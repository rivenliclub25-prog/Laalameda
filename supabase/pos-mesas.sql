-- =====================================================================
--  La Alameda — POS: mesas, cuentas de mesa y devoluciones (fase P3)
--
--  Requisito: haber ejecutado antes pos.sql (y todo lo anterior).
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
--
--  Qué añade:
--    · Mesas (nombre, orden, activa y un código secreto para su QR).
--    · Cuentas de mesa: se abren, se les añaden consumiciones (con notas),
--      se sirven, se anulan líneas con motivo, se cambian de mesa, se
--      cobran o se cancelan. Una sola cuenta abierta por mesa.
--    · Devoluciones (solo admins), totales o parciales, con motivo. Nunca
--      más de lo cobrado.
--    · Protección contra duplicados: el mismo envío repetido no añade nada.
--  Todo queda en pos_events. Dinero en céntimos. Horas en Europe/Madrid.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Mesas
-- ---------------------------------------------------------------------
create or replace function public._token_mesa()
returns text
language sql
volatile
security definer   -- usa pgcrypto con los permisos del propietario
set search_path = ''
as $$
  -- 16 caracteres aleatorios aptos para una URL (base64url de 12 bytes).
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_');
$$;

create table if not exists public.mesas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  token      text not null unique default public._token_mesa(),  -- va en el QR (#/mesa?m=…, P4)
  orden      integer not null default 0,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists mesas_set_updated_at on public.mesas;
create trigger mesas_set_updated_at before update on public.mesas
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. Las cuentas pueden ser de una mesa
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists mesa_id uuid references public.mesas (id) on delete restrict;

-- Una cuenta de mesa siempre tiene mesa; una de barra, nunca.
alter table public.orders drop constraint if exists orders_mesa_check;
alter table public.orders add constraint orders_mesa_check check ((origen = 'mesa') = (mesa_id is not null));

-- Una sola cuenta abierta por mesa.
create unique index if not exists orders_una_abierta_por_mesa on public.orders (mesa_id) where estado = 'abierta';

-- El registro admite "cambio de mesa".
alter table public.pos_events drop constraint if exists pos_events_tipo_check;
alter table public.pos_events add constraint pos_events_tipo_check check (tipo in (
  'abierta', 'linea_anadida', 'linea_aceptada', 'linea_servida', 'linea_anulada',
  'pagada', 'cancelada', 'devuelta', 'mesa_cambiada'));


-- ---------------------------------------------------------------------
-- 3. Devoluciones (solo admins). No se borran ni se editan.
-- ---------------------------------------------------------------------
create table if not exists public.sale_refunds (
  id               uuid primary key default gen_random_uuid(),
  sale_id          uuid not null references public.sales (id) on delete restrict,
  importe_centimos integer not null check (importe_centimos > 0),
  motivo           text not null check (length(trim(motivo)) > 0),
  por              uuid references auth.users (id) on delete set null,
  at               timestamptz not null default now()
);

create index if not exists sale_refunds_sale_idx on public.sale_refunds (sale_id);

create or replace function public.sale_refunds_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or (new.id, new.sale_id, new.importe_centimos, new.motivo, new.at)
        is distinct from (old.id, old.sale_id, old.importe_centimos, old.motivo, old.at)
     or (new.por is distinct from old.por and new.por is not null) then
    raise exception 'VENTA_INMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists sale_refunds_inmutable on public.sale_refunds;
create trigger sale_refunds_inmutable before update or delete on public.sale_refunds
  for each row execute function public.sale_refunds_inmutable();


-- ---------------------------------------------------------------------
-- 4. Envíos ya procesados (protección contra duplicados)
-- ---------------------------------------------------------------------
create table if not exists public.pos_solicitudes (
  id uuid primary key,
  at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 5. Seguridad (RLS)
--    Mesas: las leen camareros y admins; solo los admins las gestionan.
--    Devoluciones y solicitudes: nadie escribe directamente.
-- ---------------------------------------------------------------------
alter table public.mesas           enable row level security;
alter table public.sale_refunds    enable row level security;
alter table public.pos_solicitudes enable row level security;

drop policy if exists "Personal lee las mesas" on public.mesas;
create policy "Personal lee las mesas" on public.mesas for select to authenticated
  using ((select public.is_camarero()) or (select public.is_admin()));
drop policy if exists "Admins gestionan las mesas" on public.mesas;
create policy "Admins gestionan las mesas" on public.mesas for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Personal lee las devoluciones" on public.sale_refunds;
create policy "Personal lee las devoluciones" on public.sale_refunds for select to authenticated
  using ((select public.is_camarero()) or (select public.is_admin()));

revoke all on public.mesas, public.sale_refunds, public.pos_solicitudes from anon, authenticated;
grant select on public.mesas, public.sale_refunds to authenticated;
grant insert, update on public.mesas to authenticated;   -- las políticas lo limitan a admins


-- ---------------------------------------------------------------------
-- 6. Funciones internas
-- ---------------------------------------------------------------------

-- Comprueba que quien llama es camarero.
create or replace function public._pos_exigir_camarero()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Cuenta abierta, bloqueada para esta operación (si dos camareros actúan a
-- la vez, el segundo espera al primero).
create or replace function public._pos_cuenta_abierta(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'CUENTA_NO_EXISTE'; end if;
  if o.estado <> 'abierta' then raise exception 'CUENTA_CERRADA'; end if;
  return o;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. RPC del camarero
-- ---------------------------------------------------------------------

-- 7.1 Abrir la cuenta de una mesa (si ya hay una abierta, devuelve esa).
create or replace function public.pos_abrir_mesa(p_mesa_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := public._pos_exigir_camarero();
  m       public.mesas%rowtype;
  v_order uuid;
begin
  select * into m from public.mesas where id = p_mesa_id;
  if not found then raise exception 'MESA_NO_EXISTE'; end if;
  if not m.activa then raise exception 'MESA_INACTIVA'; end if;

  select id into v_order from public.orders where mesa_id = m.id and estado = 'abierta';
  if found then return v_order; end if;

  insert into public.orders (origen, estado, mesa_id, abierta_por, jornada)
  values ('mesa', 'abierta', m.id, uid, public._jornada_fecha())
  on conflict (mesa_id) where estado = 'abierta' do nothing
  returning id into v_order;

  if v_order is null then  -- otro camarero la abrió a la vez
    select id into v_order from public.orders where mesa_id = m.id and estado = 'abierta';
    return v_order;
  end if;

  insert into public.pos_events (order_id, tipo, actor, detalle)
  values (v_order, 'abierta', uid, jsonb_build_object('mesa', m.nombre));
  return v_order;
end;
$$;

-- 7.2 Añadir consumiciones a una cuenta abierta.
--     p_items: [{"product_id": 15, "cantidad": 2, "notas": "sin hielo"}, …]
--     El precio lo pone la base de datos. Un p_client_request_id repetido
--     no añade nada (devuelve "repetida": true).
create or replace function public.pos_anadir_lineas(p_order_id uuid, p_items jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := public._pos_exigir_camarero();
  o       public.orders%rowtype;
  v_req   uuid;
  v_item  uuid;
  v_n     integer := 0;
  r       record;
  p       public.products%rowtype;
begin
  if p_client_request_id is null then raise exception 'SOLICITUD_INVALIDA'; end if;
  o := public._pos_cuenta_abierta(p_order_id);

  insert into public.pos_solicitudes (id) values (p_client_request_id)
  on conflict (id) do nothing
  returning id into v_req;
  if v_req is null then
    return jsonb_build_object('repetida', true, 'lineas', 0);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VENTA_VACIA';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'CANTIDAD_INVALIDA'; end if;

  for r in
    select e ->> 'product_id' as pid_txt,
           nullif(trim(coalesce(e ->> 'notas', '')), '') as notas,
           sum(case when (e ->> 'cantidad') ~ '^[0-9]{1,3}$' then (e ->> 'cantidad')::integer else 0 end) as cantidad,
           bool_or(not coalesce((e ->> 'cantidad') ~ '^[0-9]{1,3}$', false)) as cantidad_mala
    from jsonb_array_elements(p_items) e
    group by 1, 2
  loop
    if r.pid_txt is null or r.pid_txt !~ '^[0-9]{1,9}$' then raise exception 'PRODUCTO_NO_EXISTE'; end if;
    if r.cantidad_mala or r.cantidad < 1 or r.cantidad > 99 then raise exception 'CANTIDAD_INVALIDA'; end if;
    if r.notas is not null and length(r.notas) > 200 then raise exception 'NOTAS_DEMASIADO_LARGAS'; end if;
    select * into p from public.products pr where pr.id = r.pid_txt::integer;
    if not found or not p.activo then
      raise exception 'PRODUCTO_NO_EXISTE' using detail = coalesce(p.nombre, '#' || r.pid_txt);
    end if;
    if not p.disponible then raise exception 'PRODUCTO_AGOTADO' using detail = p.nombre; end if;
    if p.precio_centimos is null then raise exception 'PRODUCTO_SIN_PRECIO' using detail = p.nombre; end if;

    insert into public.order_items (order_id, product_id, nombre, precio_unitario_centimos, tipo_linea, cantidad, notas, anadida_por, estado)
    values (o.id, p.id, p.nombre, p.precio_centimos, 'producto', r.cantidad, r.notas, uid, 'aceptada')
    returning id into v_item;

    insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
    values (o.id, v_item, 'linea_anadida', uid,
            jsonb_build_object('producto', p.nombre, 'cantidad', r.cantidad, 'precio_unitario_centimos', p.precio_centimos, 'notas', r.notas));
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('repetida', false, 'lineas', v_n);
end;
$$;

-- 7.3 Marcar líneas como servidas (solo las aceptadas de cuentas abiertas).
create or replace function public.pos_servir_lineas(p_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._pos_exigir_camarero();
  n   integer;
begin
  with servidas as (
    update public.order_items oi
    set estado = 'servida'
    from public.orders o
    where oi.id = any (p_item_ids)
      and o.id = oi.order_id
      and o.estado = 'abierta'
      and oi.estado = 'aceptada'
    returning oi.id, oi.order_id
  )
  insert into public.pos_events (order_id, item_id, tipo, actor)
  select s.order_id, s.id, 'linea_servida', uid from servidas s;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 7.4 Anular una línea (también servida, p. ej. invitación o bebida
--     derramada) con motivo, mientras la cuenta esté abierta.
create or replace function public.pos_anular_linea(p_item_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := public._pos_exigir_camarero();
  li   public.order_items%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  select * into li from public.order_items where id = p_item_id;
  if not found then raise exception 'LINEA_NO_EXISTE'; end if;
  perform public._pos_cuenta_abierta(li.order_id);   -- bloquea la cuenta y comprueba que siga abierta
  select * into li from public.order_items where id = p_item_id;
  if li.estado = 'anulada' then raise exception 'LINEA_YA_ANULADA'; end if;

  update public.order_items set estado = 'anulada' where id = li.id;
  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  values (li.order_id, li.id, 'linea_anulada', uid,
          jsonb_build_object('motivo', trim(p_motivo), 'estado_anterior', li.estado, 'producto', li.nombre,
                             'cantidad', li.cantidad, 'importe_centimos', li.precio_unitario_centimos * li.cantidad));
end;
$$;

-- 7.5 Cobrar la cuenta: total sin las líneas anuladas. Si ya estaba cobrada
--     (doble toque u otro camarero a la vez), devuelve esa venta.
create or replace function public.pos_cobrar_cuenta(p_order_id uuid, p_metodo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := public._pos_exigir_camarero();
  o       public.orders%rowtype;
  v_total integer;
  v_lineas integer;
  v_sale  uuid;
begin
  if p_metodo is null or p_metodo not in ('efectivo', 'tarjeta', 'otro') then raise exception 'METODO_INVALIDO'; end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'CUENTA_NO_EXISTE'; end if;
  if o.estado = 'pagada' then return public._pos_venta_json(o.id, true); end if;
  if o.estado <> 'abierta' then raise exception 'CUENTA_CERRADA'; end if;

  if exists (select 1 from public.order_items where order_id = o.id and estado = 'pendiente') then
    raise exception 'PEDIDOS_PENDIENTES';
  end if;
  select count(*), coalesce(sum(precio_unitario_centimos * cantidad), 0) into v_lineas, v_total
  from public.order_items where order_id = o.id and estado in ('aceptada', 'servida');
  if v_lineas = 0 then raise exception 'CUENTA_VACIA'; end if;

  update public.orders set estado = 'pagada' where id = o.id;
  insert into public.sales (order_id, bruto_centimos, descuentos_centimos, total_centimos, metodo, cobrado_por, jornada)
  values (o.id, v_total, 0, v_total, p_metodo, uid, o.jornada)
  returning id into v_sale;
  insert into public.pos_events (order_id, sale_id, tipo, actor, detalle)
  values (o.id, v_sale, 'pagada', uid, jsonb_build_object('origen', o.origen, 'metodo', p_metodo, 'total_centimos', v_total));

  return public._pos_venta_json(o.id, false);
end;
$$;

-- 7.6 Cancelar la cuenta sin cobrar, solo si no queda nada servido
--     (lo servido que no se cobre se anula antes, con su motivo).
create or replace function public.pos_cancelar_cuenta(p_order_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._pos_exigir_camarero();
  o   public.orders%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  o := public._pos_cuenta_abierta(p_order_id);
  if exists (select 1 from public.order_items where order_id = o.id and estado = 'servida') then
    raise exception 'CUENTA_CON_SERVIDAS';
  end if;

  with anuladas as (
    update public.order_items set estado = 'anulada'
    where order_id = o.id and estado in ('pendiente', 'aceptada')
    returning id, nombre, cantidad
  )
  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  select o.id, a.id, 'linea_anulada', uid, jsonb_build_object('motivo', trim(p_motivo), 'por_cancelacion', true)
  from anuladas a;

  update public.orders set estado = 'cancelada' where id = o.id;
  insert into public.pos_events (order_id, tipo, actor, detalle)
  values (o.id, 'cancelada', uid, jsonb_build_object('motivo', trim(p_motivo)));
end;
$$;

-- 7.7 Mover una cuenta abierta a otra mesa libre.
create or replace function public.pos_cambiar_mesa(p_order_id uuid, p_mesa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := public._pos_exigir_camarero();
  o       public.orders%rowtype;
  destino public.mesas%rowtype;
  origen  text;
begin
  o := public._pos_cuenta_abierta(p_order_id);
  if o.origen <> 'mesa' then raise exception 'CUENTA_NO_EXISTE'; end if;
  select * into destino from public.mesas where id = p_mesa_id;
  if not found then raise exception 'MESA_NO_EXISTE'; end if;
  if not destino.activa then raise exception 'MESA_INACTIVA'; end if;
  if destino.id = o.mesa_id then return; end if;
  if exists (select 1 from public.orders where mesa_id = destino.id and estado = 'abierta') then
    raise exception 'MESA_OCUPADA';
  end if;
  select nombre into origen from public.mesas where id = o.mesa_id;

  update public.orders set mesa_id = destino.id where id = o.id;
  insert into public.pos_events (order_id, tipo, actor, detalle)
  values (o.id, 'mesa_cambiada', uid, jsonb_build_object('de', origen, 'a', destino.nombre));
end;
$$;


-- ---------------------------------------------------------------------
-- 8. RPC de admins
-- ---------------------------------------------------------------------

-- 8.1 Devolver una venta (total o parcial), con motivo. Nunca más de lo cobrado.
create or replace function public.admin_devolver_venta(p_sale_id uuid, p_importe_centimos integer, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  s          public.sales%rowtype;
  v_devuelto integer;
  v_refund   uuid;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN' using errcode = '42501'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  if p_importe_centimos is null or p_importe_centimos <= 0 then raise exception 'IMPORTE_INVALIDO'; end if;

  select * into s from public.sales where id = p_sale_id for update;   -- dos devoluciones a la vez: una espera
  if not found then raise exception 'VENTA_NO_EXISTE'; end if;
  select coalesce(sum(importe_centimos), 0) into v_devuelto from public.sale_refunds where sale_id = s.id;
  if v_devuelto + p_importe_centimos > s.total_centimos then
    raise exception 'IMPORTE_SUPERA_VENTA';
  end if;

  insert into public.sale_refunds (sale_id, importe_centimos, motivo, por)
  values (s.id, p_importe_centimos, trim(p_motivo), uid)
  returning id into v_refund;
  insert into public.pos_events (order_id, sale_id, tipo, actor, detalle)
  values (s.order_id, s.id, 'devuelta', uid, jsonb_build_object('importe_centimos', p_importe_centimos, 'motivo', trim(p_motivo)));

  return jsonb_build_object(
    'refund_id', v_refund,
    'devuelto_centimos', v_devuelto + p_importe_centimos,
    'restante_centimos', s.total_centimos - v_devuelto - p_importe_centimos
  );
end;
$$;

-- 8.2 Nuevo código para el QR de una mesa (el anterior deja de valer).
create or replace function public.admin_regenerar_qr_mesa(p_mesa_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN' using errcode = '42501'; end if;
  update public.mesas set token = public._token_mesa() where id = p_mesa_id returning token into v_token;
  if v_token is null then raise exception 'MESA_NO_EXISTE'; end if;
  return v_token;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. Permisos de ejecución
-- ---------------------------------------------------------------------
-- _token_mesa se usa como valor por defecto al crear una mesa (lo hace un admin):
-- necesita permiso de ejecución. Solo devuelve un texto aleatorio.
revoke execute on function public._token_mesa()                         from public, anon;
grant  execute on function public._token_mesa()                         to authenticated;
revoke execute on function public._pos_exigir_camarero()                from public, anon, authenticated;
revoke execute on function public._pos_cuenta_abierta(uuid)             from public, anon, authenticated;
revoke execute on function public.sale_refunds_inmutable()              from public, anon, authenticated;

revoke execute on function public.pos_abrir_mesa(uuid)                  from public, anon;
revoke execute on function public.pos_anadir_lineas(uuid, jsonb, uuid)  from public, anon;
revoke execute on function public.pos_servir_lineas(uuid[])             from public, anon;
revoke execute on function public.pos_anular_linea(uuid, text)          from public, anon;
revoke execute on function public.pos_cobrar_cuenta(uuid, text)         from public, anon;
revoke execute on function public.pos_cancelar_cuenta(uuid, text)       from public, anon;
revoke execute on function public.pos_cambiar_mesa(uuid, uuid)          from public, anon;
revoke execute on function public.admin_devolver_venta(uuid, integer, text) from public, anon;
revoke execute on function public.admin_regenerar_qr_mesa(uuid)         from public, anon;

grant execute on function public.pos_abrir_mesa(uuid)                  to authenticated;
grant execute on function public.pos_anadir_lineas(uuid, jsonb, uuid)  to authenticated;
grant execute on function public.pos_servir_lineas(uuid[])             to authenticated;
grant execute on function public.pos_anular_linea(uuid, text)          to authenticated;
grant execute on function public.pos_cobrar_cuenta(uuid, text)         to authenticated;
grant execute on function public.pos_cancelar_cuenta(uuid, text)       to authenticated;
grant execute on function public.pos_cambiar_mesa(uuid, uuid)          to authenticated;
grant execute on function public.admin_devolver_venta(uuid, integer, text) to authenticated;
grant execute on function public.admin_regenerar_qr_mesa(uuid)         to authenticated;


-- =====================================================================
--  PRUEBAS MANUALES (opcionales; NO cambian nada)
--
--  Sustituye ID-CAMARERO por una cuenta con es_camarero = true.
--  Cada bloque va entre "begin" y "rollback".
--
--  1) Cuenta de mesa completa: abrir, añadir, servir, anular, cobrar.
--     El total no incluye la línea anulada.
--    begin;
--    insert into public.mesas (nombre) values ('Mesa de prueba');
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    set local role authenticated;
--    select set_config('prueba.cuenta', public.pos_abrir_mesa((select id from public.mesas where nombre = 'Mesa de prueba'))::text, true);
--    select public.pos_anadir_lineas(current_setting('prueba.cuenta')::uuid,
--           '[{"product_id":15,"cantidad":2},{"product_id":5,"cantidad":1,"notas":"bien hechas"}]', gen_random_uuid());
--    select public.pos_anular_linea((select id from public.order_items where order_id = current_setting('prueba.cuenta')::uuid and product_id = 5), 'Prueba');
--    select public.pos_cobrar_cuenta(current_setting('prueba.cuenta')::uuid, 'tarjeta');   -- total = solo las 2 cañas
--    rollback;
--
--  2) Cancelar con algo servido → CUENTA_CON_SERVIDAS (anula antes lo servido).
--  3) Abrir una segunda cuenta en la misma mesa devuelve la misma cuenta.
--  4) Devolver más de lo cobrado → IMPORTE_SUPERA_VENTA (como admin).
-- =====================================================================
