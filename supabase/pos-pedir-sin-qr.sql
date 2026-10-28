-- =====================================================================
--  La Alameda — POS: pedir desde la carta eligiendo la mesa (fase P6a)
--
--  Requisito: haber ejecutado antes pos-pedidos.sql y pos-promos.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
--
--  Qué añade:
--    · Un socio con sesión puede pedir sin escanear el QR: elige su mesa
--      de la lista (#/pedir). La lista NO incluye el código secreto del
--      QR, así que el QR sigue sirviendo como prueba de estar en la mesa.
--    · Las rondas pedidas así se marcan (order_items.mesa_a_mano) y el TPV
--      muestra «Mesa elegida a mano» para que el camarero lo compruebe
--      antes de aceptar. Siguen llegando pendientes y con los mismos
--      límites (2 rondas pendientes por socio, 20 unidades por ronda).
--    · La lógica de pedir ronda pasa a una función interna compartida
--      (_socio_pedir_ronda): con QR y sin QR se aplican las mismas reglas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Datos nuevos
-- ---------------------------------------------------------------------
alter table public.order_items add column if not exists mesa_a_mano boolean not null default false;


-- ---------------------------------------------------------------------
-- 2. Mesas para elegir (solo socios con sesión; sin el código del QR)
-- ---------------------------------------------------------------------
create or replace function public.mesas_para_pedir()
returns table (id uuid, nombre text, orden integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.nombre, m.orden
  from public.mesas m
  where m.activa and auth.uid() is not null
  order by m.orden, m.nombre;
$$;


-- ---------------------------------------------------------------------
-- 3. Lógica compartida de pedir una ronda (antes, dentro de
--    socio_pedir_ronda en pos-promos.sql; mismas reglas y límites)
-- ---------------------------------------------------------------------
create or replace function public._socio_pedir_ronda(p_mesa_id uuid, p_items jsonb, p_client_request_id uuid, p_a_mano boolean)
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
  e        jsonb;
  p        public.products%rowtype;
begin
  if uid is null then raise exception 'NO_AUTENTICADO' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'SOLICITUD_INVALIDA'; end if;

  select * into m from public.mesas where id = p_mesa_id;
  if not found then raise exception 'MESA_NO_EXISTE'; end if;
  if not m.activa then raise exception 'MESA_INACTIVA'; end if;

  -- ¿Ya se envió esta misma ronda? (doble toque o reintento)
  insert into public.pos_solicitudes (id) values (p_client_request_id)
  on conflict (id) do nothing
  returning id into v_req;
  if v_req is null then
    return jsonb_build_object('repetida', true, 'ronda', p_client_request_id);
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > max_unidades_ronda then
    raise exception 'RONDA_DEMASIADO_GRANDE';
  end if;
  perform public._pos_items_validos(p_items);
  if exists (select 1 from jsonb_array_elements(p_items) x where x ? 'ticket_codigo') then
    raise exception 'SOLICITUD_INVALIDA';   -- el socio no elige ticket: se usa el suyo
  end if;

  select coalesce(sum(greatest(public._pos_cantidad(x), 0)), 0) into v_total from jsonb_array_elements(p_items) x;
  if v_total > max_unidades_ronda then raise exception 'RONDA_DEMASIADO_GRANDE'; end if;

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
      values (v_order, 'abierta', uid, jsonb_build_object('mesa', m.nombre, 'origen', 'socio', 'mesa_a_mano', p_a_mano));
    end if;
  end if;
  perform 1 from public.orders where id = v_order for update;

  select nullif(split_part(trim(coalesce(pf.nombre, '')), ' ', 1), '') into v_nombre
  from public.profiles pf where pf.id = uid;

  for r in
    select x ->> 'product_id' as pid_txt,
           nullif(trim(coalesce(x ->> 'notas', '')), '') as notas,
           sum(public._pos_cantidad(x)) as cantidad,
           bool_or(public._pos_cantidad(x) < 0) as cantidad_mala
    from jsonb_array_elements(p_items) x
    where x ? 'product_id'
    group by 1, 2
  loop
    if r.pid_txt is null or r.pid_txt !~ '^[0-9]{1,9}$' then raise exception 'PRODUCTO_NO_EXISTE'; end if;
    if r.cantidad_mala or r.cantidad < 1 then raise exception 'CANTIDAD_INVALIDA'; end if;
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

  for e in select x from jsonb_array_elements(p_items) x where x ? 'promo_id' loop
    perform public._pos_linea_promo(v_order, e ->> 'promo_id', public._pos_cantidad(e),
                                    nullif(trim(coalesce(e ->> 'notas', '')), ''),
                                    null, 'pendiente', uid, true, v_nombre, p_client_request_id);
    v_n := v_n + 1;
  end loop;

  -- Mesa elegida a mano (sin QR): el camarero lo ve para comprobar que el socio está ahí.
  if p_a_mano then
    update public.order_items set mesa_a_mano = true where order_id = v_order and ronda = p_client_request_id;
  end if;

  return jsonb_build_object('repetida', false, 'ronda', p_client_request_id, 'lineas', v_n, 'mesa', m.nombre);
end;
$$;


-- ---------------------------------------------------------------------
-- 4. RPC del socio: con el QR (mismos parámetros que antes) y eligiendo
--    la mesa a mano
-- ---------------------------------------------------------------------
create or replace function public.socio_pedir_ronda(p_token text, p_items jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mesa uuid;
begin
  if auth.uid() is null then raise exception 'NO_AUTENTICADO' using errcode = '42501'; end if;
  select id into v_mesa from public.mesas where token = p_token;
  if not found then raise exception 'MESA_NO_EXISTE'; end if;
  return public._socio_pedir_ronda(v_mesa, p_items, p_client_request_id, false);
end;
$$;

create or replace function public.socio_pedir_ronda_mesa(p_mesa_id uuid, p_items jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NO_AUTENTICADO' using errcode = '42501'; end if;
  return public._socio_pedir_ronda(p_mesa_id, p_items, p_client_request_id, true);
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public._socio_pedir_ronda(uuid, jsonb, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.mesas_para_pedir()                           from public, anon;
grant  execute on function public.mesas_para_pedir()                           to authenticated;
revoke execute on function public.socio_pedir_ronda_mesa(uuid, jsonb, uuid)     from public, anon;
grant  execute on function public.socio_pedir_ronda_mesa(uuid, jsonb, uuid)     to authenticated;


-- =====================================================================
--  PRUEBA MANUAL (opcional; NO cambia nada)
--  Sustituye ID-SOCIO por una cuenta normal.
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    set local role authenticated;
--    select * from public.mesas_para_pedir();          -- Mesa 1…4, sin token
--    select public.socio_pedir_ronda_mesa((select id from public.mesas_para_pedir() limit 1),
--                                         '[{"product_id":15,"cantidad":1}]', gen_random_uuid());
--    rollback;
-- =====================================================================
