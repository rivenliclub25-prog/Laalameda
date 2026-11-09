-- =====================================================================
--  La Alameda — POS: pedido del socio desde la mesa (fase P4)
--
--  Requisito: haber ejecutado antes pos.sql y pos-mesas.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
--
--  Qué añade:
--    · El socio escanea el QR de su mesa (#/mesa?m=<código>) y envía
--      "rondas" desde su móvil. Llegan como PENDIENTES al TPV, donde el
--      camarero las acepta o las rechaza (control humano).
--    · Solo socios con sesión pueden pedir. Cada socio ve SOLO lo que ha
--      pedido él; nunca cuentas de otras mesas.
--    · Límites: máximo 2 rondas pendientes por socio y 20 unidades por
--      ronda. Se cambian en la sección 2 (constantes al principio de
--      socio_pedir_ronda).
--    · Tiempo real: orders y order_items se publican en Realtime.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Datos nuevos en las líneas
-- ---------------------------------------------------------------------
alter table public.order_items add column if not exists ronda uuid;               -- agrupa lo pedido de una vez
alter table public.order_items add column if not exists pedido_por_nombre text;   -- nombre de pila (para el camarero)

create index if not exists order_items_ronda_idx on public.order_items (order_id, ronda);
create index if not exists order_items_pedido_por_idx on public.order_items (pedido_por);


-- ---------------------------------------------------------------------
-- 2. Seguridad: el socio lee SOLO sus líneas y las cuentas donde las tiene
--    (las políticas del personal de pos.sql se mantienen).
-- ---------------------------------------------------------------------
drop policy if exists "Socio lee sus líneas" on public.order_items;
create policy "Socio lee sus líneas" on public.order_items for select to authenticated
  using (pedido_por = (select auth.uid()));

drop policy if exists "Socio lee sus cuentas" on public.orders;
create policy "Socio lee sus cuentas" on public.orders for select to authenticated
  using (exists (
    select 1 from public.order_items oi
    where oi.order_id = orders.id and oi.pedido_por = (select auth.uid())
  ));


-- ---------------------------------------------------------------------
-- 3. Tiempo real: el TPV se entera al instante de las rondas y el socio
--    ve cambiar el estado de lo que pidió (Realtime respeta la RLS).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['orders', 'order_items'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. RPC pública: datos de la mesa del QR (también sin sesión)
--    Devuelve null si el código no existe (QR antiguo o inventado).
-- ---------------------------------------------------------------------
create or replace function public.mesa_info(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'nombre', m.nombre, 'activa', m.activa)
  from public.mesas m
  where m.token = p_token;
$$;


-- ---------------------------------------------------------------------
-- 5. RPC del socio: enviar una ronda desde la mesa
--    p_items: [{"product_id": 15, "cantidad": 2, "notas": "sin hielo"}, …]
--    El precio lo pone la base de datos. Un p_client_request_id repetido
--    no añade nada. La ronda queda PENDIENTE hasta que la acepte el camarero.
--    Errores: NO_AUTENTICADO, SOLICITUD_INVALIDA, MESA_NO_EXISTE,
--      MESA_INACTIVA, VENTA_VACIA, CANTIDAD_INVALIDA, RONDA_DEMASIADO_GRANDE,
--      RONDAS_PENDIENTES_MAX, PRODUCTO_NO_EXISTE, PRODUCTO_AGOTADO,
--      PRODUCTO_SIN_PRECIO, NOTAS_DEMASIADO_LARGAS.
-- ---------------------------------------------------------------------
create or replace function public.socio_pedir_ronda(p_token text, p_items jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rondas_pendientes constant integer := 2;    -- ← límites (se pueden cambiar)
  max_unidades_ronda    constant integer := 20;
  uid      uuid := auth.uid();
  m        public.mesas%rowtype;
  v_req    uuid;
  v_order  uuid;
  v_nombre text;
  v_total  integer := 0;
  v_n      integer := 0;
  v_item   uuid;
  r        record;
  p        public.products%rowtype;
begin
  if uid is null then raise exception 'NO_AUTENTICADO' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'SOLICITUD_INVALIDA'; end if;

  select * into m from public.mesas where token = p_token;
  if not found then raise exception 'MESA_NO_EXISTE'; end if;
  if not m.activa then raise exception 'MESA_INACTIVA'; end if;

  -- ¿Ya se envió esta misma ronda? (doble toque o reintento)
  insert into public.pos_solicitudes (id) values (p_client_request_id)
  on conflict (id) do nothing
  returning id into v_req;
  if v_req is null then
    return jsonb_build_object('repetida', true, 'ronda', p_client_request_id);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VENTA_VACIA';
  end if;
  if jsonb_array_length(p_items) > max_unidades_ronda then raise exception 'RONDA_DEMASIADO_GRANDE'; end if;

  if (select count(distinct oi.ronda)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.pedido_por = uid and oi.estado = 'pendiente' and o.estado = 'abierta') >= max_rondas_pendientes then
    raise exception 'RONDAS_PENDIENTES_MAX';
  end if;

  -- Cuenta abierta de la mesa (se abre si no hay).
  select id into v_order from public.orders where mesa_id = m.id and estado = 'abierta';
  if not found then
    insert into public.orders (origen, estado, mesa_id, abierta_por, jornada)
    values ('mesa', 'abierta', m.id, uid, public._jornada_fecha())
    on conflict (mesa_id) where estado = 'abierta' do nothing
    returning id into v_order;
    if v_order is null then
      select id into v_order from public.orders where mesa_id = m.id and estado = 'abierta';
    else
      insert into public.pos_events (order_id, tipo, actor, detalle)
      values (v_order, 'abierta', uid, jsonb_build_object('mesa', m.nombre, 'origen', 'socio'));
    end if;
  end if;
  perform 1 from public.orders where id = v_order for update;

  select nullif(split_part(trim(coalesce(pf.nombre, '')), ' ', 1), '') into v_nombre
  from public.profiles pf where pf.id = uid;

  for r in
    select e ->> 'product_id' as pid_txt,
           nullif(trim(coalesce(e ->> 'notas', '')), '') as notas,
           sum(case when (e ->> 'cantidad') ~ '^[0-9]{1,3}$' then (e ->> 'cantidad')::integer else 0 end) as cantidad,
           bool_or(not coalesce((e ->> 'cantidad') ~ '^[0-9]{1,3}$', false)) as cantidad_mala
    from jsonb_array_elements(p_items) e
    group by 1, 2
  loop
    if r.pid_txt is null or r.pid_txt !~ '^[0-9]{1,9}$' then raise exception 'PRODUCTO_NO_EXISTE'; end if;
    if r.cantidad_mala or r.cantidad < 1 then raise exception 'CANTIDAD_INVALIDA'; end if;
    v_total := v_total + r.cantidad;
    if v_total > max_unidades_ronda then raise exception 'RONDA_DEMASIADO_GRANDE'; end if;
    if r.notas is not null and length(r.notas) > 200 then raise exception 'NOTAS_DEMASIADO_LARGAS'; end if;
    select * into p from public.products pr where pr.id = r.pid_txt::integer;
    if not found or not p.activo then
      raise exception 'PRODUCTO_NO_EXISTE' using detail = coalesce(p.nombre, '#' || r.pid_txt);
    end if;
    if not p.disponible then raise exception 'PRODUCTO_AGOTADO' using detail = p.nombre; end if;
    if p.precio_centimos is null then raise exception 'PRODUCTO_SIN_PRECIO' using detail = p.nombre; end if;

    insert into public.order_items (order_id, product_id, nombre, precio_unitario_centimos, tipo_linea, cantidad, notas,
                                    pedido_por, pedido_por_nombre, anadida_por, estado, ronda)
    values (v_order, p.id, p.nombre, p.precio_centimos, 'producto', r.cantidad, r.notas,
            uid, v_nombre, null, 'pendiente', p_client_request_id)
    returning id into v_item;

    insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
    values (v_order, v_item, 'linea_anadida', uid,
            jsonb_build_object('producto', p.nombre, 'cantidad', r.cantidad, 'notas', r.notas, 'origen', 'socio',
                               'ronda', p_client_request_id));
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('repetida', false, 'ronda', p_client_request_id, 'lineas', v_n, 'mesa', m.nombre);
end;
$$;


-- ---------------------------------------------------------------------
-- 6. RPC del camarero: aceptar o rechazar una ronda
-- ---------------------------------------------------------------------
create or replace function public.pos_aceptar_ronda(p_order_id uuid, p_ronda uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._pos_exigir_camarero();
  n   integer;
begin
  perform public._pos_cuenta_abierta(p_order_id);
  with aceptadas as (
    update public.order_items set estado = 'aceptada'
    where order_id = p_order_id and ronda = p_ronda and estado = 'pendiente'
    returning id
  )
  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  select p_order_id, a.id, 'linea_aceptada', uid, jsonb_build_object('ronda', p_ronda) from aceptadas a;
  get diagnostics n = row_count;
  return n;   -- 0 si ya estaba aceptada (otro camarero): no es un error
end;
$$;

create or replace function public.pos_rechazar_ronda(p_order_id uuid, p_ronda uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._pos_exigir_camarero();
  n   integer;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  perform public._pos_cuenta_abierta(p_order_id);
  with rechazadas as (
    update public.order_items set estado = 'anulada'
    where order_id = p_order_id and ronda = p_ronda and estado = 'pendiente'
    returning id
  )
  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  select p_order_id, r.id, 'linea_anulada', uid,
         jsonb_build_object('motivo', trim(p_motivo), 'rechazo', true, 'ronda', p_ronda)
  from rechazadas r;
  get diagnostics n = row_count;
  return n;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public.mesa_info(text)                             from public;
grant  execute on function public.mesa_info(text)                             to anon, authenticated;
revoke execute on function public.socio_pedir_ronda(text, jsonb, uuid)        from public, anon;
grant  execute on function public.socio_pedir_ronda(text, jsonb, uuid)        to authenticated;
revoke execute on function public.pos_aceptar_ronda(uuid, uuid)               from public, anon;
grant  execute on function public.pos_aceptar_ronda(uuid, uuid)               to authenticated;
revoke execute on function public.pos_rechazar_ronda(uuid, uuid, text)        from public, anon;
grant  execute on function public.pos_rechazar_ronda(uuid, uuid, text)        to authenticated;


-- =====================================================================
--  PRUEBAS MANUALES (opcionales; NO cambian nada)
--
--  Sustituye ID-SOCIO por una cuenta normal y CODIGO por el token de una
--  mesa (Table Editor → mesas → columna token).
--
--  1) El socio pide una ronda → queda pendiente
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    set local role authenticated;
--    select public.socio_pedir_ronda('CODIGO', '[{"product_id":15,"cantidad":2}]', gen_random_uuid());
--    select nombre, cantidad, estado from public.order_items;   -- solo ve sus líneas
--    rollback;
--
--  2) Sin sesión no se puede pedir (permission denied) pero sí ver la mesa:
--    begin; set local role anon;
--    select public.mesa_info('CODIGO');
--    rollback;
-- =====================================================================
