-- =====================================================================
--  La Alameda — POS: cierre de jornada e informes (fase P6b)
--
--  Requisito: haber ejecutado antes pos.sql, pos-mesas.sql,
--  pos-pedidos.sql, pos-promos.sql y pos-pedir-sin-qr.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
--
--  Qué añade:
--    · Cierre de jornada (el cuadre de caja): un resumen guardado que no
--      se puede cambiar. Lo hacen camareros y admins.
--        - No se cierra con mesas abiertas (se cobran o cancelan antes).
--        - Las devoluciones cuentan el día en que se devuelve el dinero.
--        - Efectivo contado opcional → descuadre.
--        - Si hay ventas después del cierre, se puede volver a cerrar:
--          se guarda una versión nueva y la anterior se conserva.
--    · Informe de un periodo (solo admins): por producto, promo,
--      camarero (con anulaciones), socio, hora y método. Los totales
--      cuadran: suma de las líneas = cobrado; neto = cobrado − devuelto.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Cierres de jornada (no se editan ni se borran)
-- ---------------------------------------------------------------------
create table if not exists public.cierres_jornada (
  id                        uuid primary key default gen_random_uuid(),
  jornada                   date not null,
  version                   integer not null default 1 check (version > 0),
  cerrado_por               uuid references auth.users (id) on delete set null,
  cerrado_at                timestamptz not null default now(),
  ventas                    integer not null,
  cobrado_centimos          integer not null,
  descuentos_centimos       integer not null,
  devuelto_centimos         integer not null,
  neto_centimos             integer not null,
  efectivo_neto_centimos    integer not null,   -- lo que debería haber en la caja
  efectivo_contado_centimos integer check (efectivo_contado_centimos is null or efectivo_contado_centimos >= 0),
  descuadre_centimos        integer,            -- contado − esperado (negativo = falta dinero)
  notas                     text check (notas is null or length(notas) <= 500),
  resumen                   jsonb not null,     -- detalle por método, anulaciones…
  unique (jornada, version)
);

create index if not exists cierres_jornada_jornada_idx on public.cierres_jornada (jornada desc, version desc);

create or replace function public.cierres_jornada_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CIERRE_INMUTABLE' using errcode = '42501';
  end if;
  -- Única excepción: si se borra la cuenta de quien cerró, su id pasa a null.
  if (to_jsonb(new) - 'cerrado_por') is distinct from (to_jsonb(old) - 'cerrado_por')
     or (new.cerrado_por is distinct from old.cerrado_por and new.cerrado_por is not null) then
    raise exception 'CIERRE_INMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cierres_jornada_inmutable on public.cierres_jornada;
create trigger cierres_jornada_inmutable before update or delete on public.cierres_jornada
  for each row execute function public.cierres_jornada_inmutable();

alter table public.cierres_jornada enable row level security;

drop policy if exists "Personal lee los cierres" on public.cierres_jornada;
create policy "Personal lee los cierres" on public.cierres_jornada for select to authenticated
  using ((select public.is_camarero()) or (select public.is_admin()));

revoke all on public.cierres_jornada from anon, authenticated;
grant select on public.cierres_jornada to authenticated;


-- ---------------------------------------------------------------------
-- 2. Funciones internas
-- ---------------------------------------------------------------------

-- Camarero o admin (devuelve quién llama).
create or replace function public._pos_exigir_personal()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_camarero() or public.is_admin()) then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Resumen de caja de un rango de jornadas (ambas incluidas):
--   · ventas cobradas en esas jornadas;
--   · devoluciones HECHAS en esas jornadas (por el método de su venta);
--   · anulaciones de líneas (no los rechazos de rondas ni las cancelaciones).
create or replace function public._resumen_caja(p_desde date, p_hasta date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select s.* from public.sales s where s.jornada between p_desde and p_hasta
  ),
  d as (
    select r.importe_centimos, s.metodo
    from public.sale_refunds r
    join public.sales s on s.id = r.sale_id
    where public._jornada_fecha(r.at) between p_desde and p_hasta
  ),
  a as (
    select e.* from public.pos_events e
    where e.tipo = 'linea_anulada' and e.detalle ? 'estado_anterior'
      and public._jornada_fecha(e.at) between p_desde and p_hasta
  ),
  metodos as (select unnest(array['efectivo', 'tarjeta', 'otro']) as metodo)
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'ventas', (select count(*) from v),
    'cobrado_centimos', (select coalesce(sum(total_centimos), 0) from v),
    'bruto_centimos', (select coalesce(sum(bruto_centimos), 0) from v),
    'descuentos_centimos', (select coalesce(sum(descuentos_centimos), 0) from v),
    'devuelto_centimos', (select coalesce(sum(importe_centimos), 0) from d),
    'devoluciones', (select count(*) from d),
    'neto_centimos', (select coalesce(sum(total_centimos), 0) from v) - (select coalesce(sum(importe_centimos), 0) from d),
    'por_metodo', (
      select jsonb_object_agg(m.metodo, jsonb_build_object(
        'ventas', (select count(*) from v where v.metodo = m.metodo),
        'cobrado_centimos', (select coalesce(sum(total_centimos), 0) from v where v.metodo = m.metodo),
        'devuelto_centimos', (select coalesce(sum(importe_centimos), 0) from d where d.metodo = m.metodo),
        'neto_centimos', (select coalesce(sum(total_centimos), 0) from v where v.metodo = m.metodo)
                       - (select coalesce(sum(importe_centimos), 0) from d where d.metodo = m.metodo)
      ))
      from metodos m
    ),
    'anuladas', (select count(*) from a),
    'anuladas_centimos', (select coalesce(sum((a.detalle ->> 'importe_centimos')::integer), 0) from a),
    'ultima_venta_numero', (select max(numero) from v),
    'ultima_venta_at', (select max(cobrado_at) from v)
  );
$$;


-- ---------------------------------------------------------------------
-- 3. RPC del personal: estado de una jornada y cierre
-- ---------------------------------------------------------------------

-- Jornadas con ventas de los últimos 14 días que aún no tienen cierre,
-- más la actual (aunque ya esté cerrada: se puede volver a cerrar).
-- Para elegir qué jornada cerrar.
create or replace function public.pos_jornadas_sin_cerrar()
returns table (jornada date, ventas bigint, actual boolean, cerrada boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  hoy date := public._jornada_fecha();
begin
  perform public._pos_exigir_personal();
  return query
    select j.jornada, (select count(*) from public.sales s where s.jornada = j.jornada), j.jornada = hoy,
           exists (select 1 from public.cierres_jornada c where c.jornada = j.jornada)
    from (
      select s.jornada from public.sales s where s.jornada between hoy - 14 and hoy
      union
      select hoy
    ) j
    where j.jornada = hoy or not exists (select 1 from public.cierres_jornada c where c.jornada = j.jornada)
    order by j.jornada desc;
end;
$$;

-- Resumen de la jornada, mesas abiertas que impiden cerrarla y, si ya se
-- cerró, el último cierre y lo que ha cambiado desde entonces.
create or replace function public.pos_estado_jornada(p_jornada date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c        public.cierres_jornada%rowtype;
  v_res    jsonb;
  v_mesas  text[];
begin
  perform public._pos_exigir_personal();
  if p_jornada is null or p_jornada > public._jornada_fecha() then raise exception 'JORNADA_INVALIDA'; end if;

  v_res := public._resumen_caja(p_jornada, p_jornada);
  select coalesce(array_agg(coalesce(m.nombre, 'Barra') order by m.orden, m.nombre), '{}') into v_mesas
  from public.orders o left join public.mesas m on m.id = o.mesa_id
  where o.estado = 'abierta' and o.jornada <= p_jornada;

  select * into c from public.cierres_jornada
  where jornada = p_jornada order by version desc limit 1;

  return jsonb_build_object(
    'jornada', p_jornada,
    'actual', p_jornada = public._jornada_fecha(),
    'resumen', v_res,
    'mesas_abiertas', to_jsonb(v_mesas),
    'ultimo_cierre', case when c.id is null then null else to_jsonb(c) end,
    'ventas_despues_del_cierre', case when c.id is null then 0 else
      (v_res ->> 'ventas')::integer - c.ventas end,
    'neto_despues_del_cierre_centimos', case when c.id is null then 0 else
      (v_res ->> 'neto_centimos')::integer - c.neto_centimos end
  );
end;
$$;

-- Cerrar (o volver a cerrar) una jornada.
create or replace function public.pos_cerrar_jornada(p_jornada date, p_efectivo_contado_centimos integer, p_notas text)
returns public.cierres_jornada
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := public._pos_exigir_personal();
  v_res    jsonb;
  v_mesas  text;
  v_ef     integer;
  v_ver    integer;
  nuevo    public.cierres_jornada%rowtype;
begin
  if p_jornada is null or p_jornada > public._jornada_fecha() then raise exception 'JORNADA_INVALIDA'; end if;
  if p_efectivo_contado_centimos is not null and p_efectivo_contado_centimos < 0 then raise exception 'IMPORTE_INVALIDO'; end if;
  if p_notas is not null and length(trim(p_notas)) > 500 then raise exception 'NOTAS_DEMASIADO_LARGAS'; end if;

  -- Dos cierres a la vez de la misma jornada: el segundo espera al primero.
  perform pg_advisory_xact_lock(hashtext('cierre_jornada'), (p_jornada - date '2000-01-01'));

  select string_agg(coalesce(m.nombre, 'Barra'), ', ' order by m.orden, m.nombre) into v_mesas
  from public.orders o left join public.mesas m on m.id = o.mesa_id
  where o.estado = 'abierta' and o.jornada <= p_jornada;
  if v_mesas is not null then raise exception 'MESAS_ABIERTAS' using detail = v_mesas; end if;

  v_res := public._resumen_caja(p_jornada, p_jornada);
  v_ef := (v_res -> 'por_metodo' -> 'efectivo' ->> 'neto_centimos')::integer;
  select coalesce(max(version), 0) + 1 into v_ver from public.cierres_jornada where jornada = p_jornada;

  insert into public.cierres_jornada (
    jornada, version, cerrado_por, ventas, cobrado_centimos, descuentos_centimos, devuelto_centimos,
    neto_centimos, efectivo_neto_centimos, efectivo_contado_centimos, descuadre_centimos, notas, resumen)
  values (
    p_jornada, v_ver, uid, (v_res ->> 'ventas')::integer, (v_res ->> 'cobrado_centimos')::integer,
    (v_res ->> 'descuentos_centimos')::integer, (v_res ->> 'devuelto_centimos')::integer,
    (v_res ->> 'neto_centimos')::integer, v_ef, p_efectivo_contado_centimos,
    p_efectivo_contado_centimos - v_ef, nullif(trim(coalesce(p_notas, '')), ''), v_res)
  returning * into nuevo;
  return nuevo;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Informe de un periodo (solo admins)
--    p_desde / p_hasta: jornadas, ambas incluidas (máximo 400 días).
-- ---------------------------------------------------------------------
create or replace function public.admin_informe(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caja jsonb;
  v_out  jsonb;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN' using errcode = '42501'; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 400 then
    raise exception 'RANGO_INVALIDO';
  end if;

  v_caja := public._resumen_caja(p_desde, p_hasta);

  with v as (
    select s.* from public.sales s where s.jornada between p_desde and p_hasta
  ),
  -- Líneas cobradas, con el socio al que se atribuyen: quien la pidió
  -- desde la mesa o, si la añadió el camarero con un ticket, su dueño.
  l as (
    select oi.*, coalesce(oi.pedido_por, t.user_id) as socio
    from public.order_items oi
    join v on v.order_id = oi.order_id
    left join public.tickets t on t.id = oi.ticket_id
    where oi.estado in ('aceptada', 'servida')
  ),
  a as (
    select e.* from public.pos_events e
    where e.tipo = 'linea_anulada' and e.detalle ? 'estado_anterior'
      and public._jornada_fecha(e.at) between p_desde and p_hasta
  )
  select jsonb_build_object(
    'caja', v_caja,
    'productos', coalesce((
      select jsonb_agg(x order by x.importe_centimos desc, x.nombre) from (
        select l.product_id as id, (array_agg(l.nombre order by l.created_at desc))[1] as nombre,
               sum(l.cantidad)::integer as unidades, sum(l.cantidad * l.precio_unitario_centimos)::integer as importe_centimos
        from l where l.product_id is not null group by l.product_id
      ) x), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(x order by x.importe_centimos desc, x.nombre) from (
        select l.promo_id as id, (array_agg(l.nombre order by l.created_at desc))[1] as nombre,
               (array_agg(l.tipo_linea))[1] as tipo,
               sum(l.cantidad)::integer as usos, count(l.ticket_id)::integer as con_ticket,
               sum(l.cantidad * l.precio_unitario_centimos)::integer as importe_centimos,
               coalesce(sum(l.descuento_centimos), 0)::integer as ahorro_centimos
        from l where l.promo_id is not null group by l.promo_id
      ) x), '[]'::jsonb),
    'camareros', coalesce((
      select jsonb_agg(x order by x.cobrado_centimos desc, x.nombre) from (
        select p.id, coalesce(nullif(p.nombre, ''), 'Sin nombre') as nombre,
               (select count(*) from v where v.cobrado_por = p.id)::integer as ventas,
               (select coalesce(sum(total_centimos), 0) from v where v.cobrado_por = p.id)::integer as cobrado_centimos,
               (select count(*) from a where a.actor = p.id)::integer as anulaciones,
               (select coalesce(sum((a.detalle ->> 'importe_centimos')::integer), 0) from a where a.actor = p.id)::integer as anulado_centimos
        from public.profiles p
        where p.id in (select cobrado_por from v union select actor from a)
      ) x), '[]'::jsonb),
    'socios', coalesce((
      select jsonb_agg(x order by x.importe_centimos desc, x.nombre) from (
        select l.socio as id, coalesce(nullif((select pf.nombre from public.profiles pf where pf.id = l.socio), ''), 'Cuenta borrada') as nombre,
               count(distinct l.order_id)::integer as cuentas,
               sum(l.cantidad * l.precio_unitario_centimos)::integer as importe_centimos,
               count(l.ticket_id)::integer as promos_con_ticket,
               coalesce(sum(l.descuento_centimos) filter (where l.ticket_id is not null), 0)::integer as ahorro_centimos
        from l where l.socio is not null group by l.socio
      ) x), '[]'::jsonb),
    'por_hora', coalesce((
      select jsonb_agg(x order by x.hora) from (
        select extract(hour from v.cobrado_at at time zone 'Europe/Madrid')::integer as hora,
               count(*)::integer as ventas, sum(v.total_centimos)::integer as cobrado_centimos
        from v group by 1
      ) x), '[]'::jsonb),
    'anulaciones', coalesce((
      select jsonb_agg(x order by x.veces desc, x.motivo) from (
        select a.detalle ->> 'motivo' as motivo, count(*)::integer as veces,
               coalesce(sum((a.detalle ->> 'importe_centimos')::integer), 0)::integer as importe_centimos
        from a group by 1
      ) x), '[]'::jsonb),
    'comprobacion', jsonb_build_object(
      'suma_lineas_centimos', (select coalesce(sum(l.cantidad * l.precio_unitario_centimos), 0) from l),
      'cobrado_centimos', (v_caja ->> 'cobrado_centimos')::integer,
      'cuadra', (select coalesce(sum(l.cantidad * l.precio_unitario_centimos), 0) from l) = (v_caja ->> 'cobrado_centimos')::integer
    )
  ) into v_out;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public.cierres_jornada_inmutable()            from public, anon, authenticated;
revoke execute on function public._pos_exigir_personal()                 from public, anon, authenticated;
revoke execute on function public._resumen_caja(date, date)              from public, anon, authenticated;
revoke execute on function public.pos_jornadas_sin_cerrar()              from public, anon;
revoke execute on function public.pos_estado_jornada(date)               from public, anon;
revoke execute on function public.pos_cerrar_jornada(date, integer, text) from public, anon;
revoke execute on function public.admin_informe(date, date)              from public, anon;
grant  execute on function public.pos_jornadas_sin_cerrar()              to authenticated;
grant  execute on function public.pos_estado_jornada(date)               to authenticated;
grant  execute on function public.pos_cerrar_jornada(date, integer, text) to authenticated;
grant  execute on function public.admin_informe(date, date)              to authenticated;


-- =====================================================================
--  PRUEBAS MANUALES (opcionales; NO cambian nada)
--  Sustituye ID-CAMARERO por una cuenta con es_camarero = true.
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    set local role authenticated;
--    select * from public.pos_jornadas_sin_cerrar();
--    select public.pos_estado_jornada(current_date);
--    rollback;
-- =====================================================================
