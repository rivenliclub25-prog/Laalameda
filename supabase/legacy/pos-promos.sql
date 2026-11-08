-- =====================================================================
--  La Alameda — POS: promos y tickets en las ventas (fase P5)
--
--  Requisito: haber ejecutado antes tickets.sql, catalogo.sql,
--  catalogo-codigos.sql, pos.sql, pos-mesas.sql y pos-pedidos.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
--
--  Qué añade:
--    · Una promo es una línea más de la cuenta, con su tipo (pack,
--      obsequio, sorteo) y el precio de la promo. El descuento lo calcula
--      la base de datos: precio normal del contenido (promotion_items)
--      menos el precio de la promo. Sin contenido, el descuento queda vacío.
--    · Promos de club: cada línea lleva UN ticket válido del socio.
--        - En el TPV el camarero escanea o teclea el código y el ticket se
--          canjea en ese momento.
--        - Desde la mesa se usa el ticket disponible del socio (o se crea,
--          con los límites de siempre) y queda RESERVADO para esa línea
--          hasta que el camarero acepta la ronda (se canjea) o la rechaza
--          (vuelve a quedar libre).
--    · Las reglas del canje viven en UNA función (_canjear_ticket), que
--      usan #/canjear (redeem_ticket), el TPV y aceptar ronda.
--    · Anular una línea con ticket: el ticket vuelve a "disponible" si no
--      ha caducado (si no, queda anulado). Todo queda registrado.
--    · Al cobrar: bruto = total + descuentos, y cada ticket queda enlazado
--      a su línea y a su venta.
--
--  Las funciones de pos.sql, pos-mesas.sql y pos-pedidos.sql que cambian
--  se reescriben aquí con "create or replace" y los MISMOS parámetros
--  (la web y los permisos no cambian).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Datos nuevos
-- ---------------------------------------------------------------------
-- Línea a la que va (o fue) el ticket: reservado si sigue "disponible".
alter table public.tickets add column if not exists order_item_id uuid
  references public.order_items (id) on delete set null;
create index if not exists tickets_order_item_idx on public.tickets (order_item_id);

-- El hueco sale_id de tickets.sql pasa a tener su clave foránea.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tickets_sale_id_fkey') then
    alter table public.tickets add constraint tickets_sale_id_fkey
      foreign key (sale_id) references public.sales (id) on delete set null;
  end if;
end;
$$;

-- Copia del código en la línea (el camarero no puede leer la tabla tickets).
alter table public.order_items add column if not exists ticket_codigo text;

-- Un ticket solo puede estar en UNA línea viva a la vez.
create unique index if not exists order_items_un_ticket_vivo
  on public.order_items (ticket_id)
  where ticket_id is not null and estado <> 'anulada';

comment on column public.order_items.descuento_centimos is
  'Ahorro de la línea entera (por unidad × cantidad). Null si la promo no tiene contenido definido.';


-- ---------------------------------------------------------------------
-- 2. Funciones internas
-- ---------------------------------------------------------------------

-- Ahorro por unidad de una promo: contenido a precio de carta − precio de
-- la promo (nunca negativo). Null si no tiene contenido o falta un precio.
create or replace function public._promo_descuento_unidad(p_promo_id text, p_precio integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) = 0 or bool_or(pr.precio_centimos is null) or p_precio is null then null
    else greatest(sum(pi.cantidad * pr.precio_centimos) - p_precio, 0)::integer
  end
  from public.promotion_items pi
  join public.products pr on pr.id = pi.product_id
  where pi.promo_id = p_promo_id;
$$;

-- Por qué un ticket NO se puede canjear ahora (null = sí se puede).
-- p_item: la línea para la que se canjea (su reserva no cuenta como estorbo).
create or replace function public._ticket_motivo(p_t public.tickets, p_camarero uuid, p_item uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_t.id is null then 'TICKET_NO_EXISTE'
    when p_t.estado = 'canjeado' then 'TICKET_YA_CANJEADO'
    when p_t.estado = 'anulado' then 'TICKET_ANULADO'
    when p_t.estado = 'caducado' or p_t.expires_at <= now() then 'TICKET_CADUCADO'
    when p_t.user_id = p_camarero then 'TICKET_PROPIO'
    when p_t.user_id is null then 'TICKET_NO_VALIDO'
    when p_t.order_item_id is not null and p_t.order_item_id is distinct from p_item then 'TICKET_EN_PEDIDO'
    when not coalesce((select pr.activa from public.promotions pr where pr.id = p_t.promo_id), false) then 'PROMO_INACTIVA'
    else null
  end;
$$;

-- Canje de un ticket: un único UPDATE con todas las condiciones, así que
-- si dos camareros (o el TPV y #/canjear) lo intentan a la vez, solo uno
-- lo consigue. Lo usan redeem_ticket, el TPV y aceptar ronda.
create or replace function public._canjear_ticket(p_ticket_id uuid, p_camarero uuid, p_importe integer, p_item uuid)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets%rowtype;
begin
  if p_importe is not null and p_importe < 0 then
    raise exception 'IMPORTE_INVALIDO';
  end if;

  update public.tickets tk
  set estado = 'canjeado',
      canjeado_at = now(),
      canjeado_por = p_camarero,
      importe_descuento_centimos = p_importe,
      order_item_id = coalesce(p_item, tk.order_item_id)
  where tk.id = p_ticket_id
    and tk.estado = 'disponible'
    and tk.expires_at > now()
    and tk.user_id <> p_camarero
    and (tk.order_item_id is null or tk.order_item_id = p_item)
    and exists (select 1 from public.promotions pr where pr.id = tk.promo_id and pr.activa)
  returning * into t;

  if found then
    insert into public.ticket_events (ticket_id, tipo, actor, detalle)
    values (t.id, 'canjeado', p_camarero,
            jsonb_build_object('importe_descuento_centimos', p_importe, 'order_item_id', p_item));
    return t;
  end if;

  -- No se ha canjeado: averiguamos por qué.
  select * into t from public.tickets tk where tk.id = p_ticket_id;
  raise exception '%', coalesce(public._ticket_motivo(t, p_camarero, p_item), 'TICKET_NO_VALIDO');
end;
$$;

-- Deshace lo que una línea anulada hizo con su ticket:
--   · reservado (ronda pendiente) → queda libre otra vez;
--   · canjeado → vuelve a "disponible" si no ha caducado; si no puede
--     (caducado, o el socio ya tiene otro disponible), queda anulado.
create or replace function public._pos_liberar_ticket(p_item public.order_items, p_actor uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets%rowtype;
begin
  if p_item.ticket_id is null then return; end if;
  select * into t from public.tickets where id = p_item.ticket_id for update;
  if not found or t.order_item_id is distinct from p_item.id then return; end if;

  if t.estado = 'disponible' then
    update public.tickets set order_item_id = null where id = t.id;
    return;
  end if;
  if t.estado <> 'canjeado' then return; end if;

  if t.expires_at > now() then
    begin
      update public.tickets
      set estado = 'disponible', canjeado_at = null, canjeado_por = null,
          importe_descuento_centimos = null, order_item_id = null
      where id = t.id;
      insert into public.ticket_events (ticket_id, tipo, actor, detalle)
      values (t.id, 'reabierto', p_actor, jsonb_build_object(
        'motivo', 'Línea anulada en el TPV: ' || p_motivo, 'order_item_id', p_item.id,
        'canjeado_at_anterior', t.canjeado_at, 'canjeado_por_anterior', t.canjeado_por));
      return;
    exception when unique_violation then
      null;   -- ya tiene otro disponible de esa promo: se anula este
    end;
  end if;

  update public.tickets
  set estado = 'anulado', anulado_at = now(), anulado_por = p_actor,
      motivo_anulacion = 'Línea anulada en el TPV: ' || p_motivo
  where id = t.id;
  insert into public.ticket_events (ticket_id, tipo, actor, detalle)
  values (t.id, 'anulado', p_actor, jsonb_build_object(
    'motivo', 'Línea anulada en el TPV: ' || p_motivo, 'order_item_id', p_item.id));
end;
$$;

-- Añade UNA línea de promo a una cuenta y devuelve su id.
--   p_socio = true  → la pide el socio desde la mesa (p_actor = el socio):
--                     se exige el horario y se reserva su ticket.
--   p_socio = false → la añade el camarero (p_actor = el camarero): el
--                     horario es solo un aviso en la web y, si es de club,
--                     se canjea el ticket p_ticket_codigo.
create or replace function public._pos_linea_promo(
  p_order_id      uuid,
  p_promo_id      text,
  p_cantidad      integer,
  p_notas         text,
  p_ticket_codigo text,
  p_estado        text,
  p_actor         uuid,
  p_socio         boolean,
  p_socio_nombre  text,
  p_ronda         uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr      public.promotions%rowtype;
  t       public.tickets%rowtype;
  v_desc  integer;
  v_item  uuid;
  v_m     text;
begin
  select * into pr from public.promotions where id = p_promo_id;
  if not found then raise exception 'PROMO_NO_EXISTE' using detail = coalesce(p_promo_id, '?'); end if;
  if not pr.activa then raise exception 'PROMO_INACTIVA' using detail = pr.nombre; end if;
  if pr.precio_centimos is null then raise exception 'PROMO_SIN_PRECIO' using detail = pr.nombre; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 99 then raise exception 'CANTIDAD_INVALIDA'; end if;
  if p_notas is not null and length(p_notas) > 200 then raise exception 'NOTAS_DEMASIADO_LARGAS'; end if;
  if p_socio and not public.promo_activa(pr.id) then
    raise exception 'PROMO_FUERA_DE_HORARIO' using detail = pr.nombre;
  end if;

  if pr.solo_club then
    if p_cantidad <> 1 then raise exception 'PROMO_CLUB_DE_UNA_EN_UNA' using detail = pr.nombre; end if;
    if p_socio then
      -- Su ticket disponible de esta promo o, si no tiene, uno nuevo (con
      -- los mismos límites y horario que al sacarlo desde la web).
      perform public._caducar_tickets(p_actor);
      select * into t from public.tickets
      where user_id = p_actor and promo_id = pr.id and estado = 'disponible'
      for update;
      if found and t.order_item_id is not null then
        raise exception 'TICKET_EN_PEDIDO' using detail = pr.nombre;
      end if;
      if not found then
        begin
          t := public.create_ticket(pr.id);
        exception when raise_exception then
          raise exception using message = sqlerrm, detail = pr.nombre;
        end;
      end if;
    else
      if coalesce(trim(p_ticket_codigo), '') = '' then
        raise exception 'TICKET_OBLIGATORIO' using detail = pr.nombre;
      end if;
      select * into t from public.tickets where codigo = public._normalizar_codigo(p_ticket_codigo);
      v_m := public._ticket_motivo(t, p_actor, null);
      if v_m is not null then raise exception using message = v_m, detail = coalesce(t.codigo, upper(trim(p_ticket_codigo))); end if;
      if t.promo_id <> pr.id then raise exception 'TICKET_OTRA_PROMO' using detail = t.promo_nombre; end if;
    end if;
  end if;

  v_desc := public._promo_descuento_unidad(pr.id, pr.precio_centimos);

  begin
    insert into public.order_items (order_id, promo_id, nombre, precio_unitario_centimos, tipo_linea, cantidad, notas,
                                    pedido_por, pedido_por_nombre, anadida_por, estado, ronda,
                                    ticket_id, ticket_codigo, descuento_centimos)
    values (p_order_id, pr.id, pr.nombre, pr.precio_centimos, pr.tipo, p_cantidad, p_notas,
            case when p_socio then p_actor end, case when p_socio then p_socio_nombre end,
            case when p_socio then null else p_actor end, p_estado, p_ronda,
            t.id, t.codigo, v_desc * p_cantidad)
    returning id into v_item;
  exception when unique_violation then
    -- El mismo ticket ya está en otra línea (dos envíos a la vez).
    raise exception using message = case when p_socio then 'TICKET_EN_PEDIDO' else 'TICKET_YA_CANJEADO' end,
                          detail = coalesce(t.codigo, pr.nombre);
  end;

  if t.id is not null then
    if p_socio then
      update public.tickets set order_item_id = v_item
      where id = t.id and estado = 'disponible' and order_item_id is null;
      if not found then raise exception 'TICKET_EN_PEDIDO' using detail = pr.nombre; end if;
    else
      perform public._canjear_ticket(t.id, p_actor, v_desc, v_item);
    end if;
  end if;

  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  values (p_order_id, v_item, 'linea_anadida', p_actor, jsonb_strip_nulls(jsonb_build_object(
    'promo', pr.nombre, 'tipo', pr.tipo, 'cantidad', p_cantidad, 'precio_unitario_centimos', pr.precio_centimos,
    'descuento_centimos', v_desc * p_cantidad, 'ticket', t.codigo, 'notas', p_notas,
    'origen', case when p_socio then 'socio' end, 'ronda', p_ronda)));
  return v_item;
end;
$$;

-- Comprueba la forma de p_items: cada elemento lleva product_id O promo_id.
create or replace function public._pos_items_validos(p_items jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VENTA_VACIA';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'CANTIDAD_INVALIDA'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object' or (e ? 'product_id') = (e ? 'promo_id')
  ) then
    raise exception 'PRODUCTO_NO_EXISTE';
  end if;
end;
$$;

-- Cantidad de un elemento de p_items (-1 si no es un número válido).
create or replace function public._pos_cantidad(p_e jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when (p_e ->> 'cantidad') ~ '^[0-9]{1,3}$' then (p_e ->> 'cantidad')::integer else -1 end;
$$;


-- ---------------------------------------------------------------------
-- 3. Tickets: #/canjear usa el canje compartido y conoce las reservas
--    (mismos parámetros y resultado que en tickets.sql)
-- ---------------------------------------------------------------------
create or replace function public.lookup_ticket(p_codigo text)
returns table (
  valido          boolean,
  motivo          text,
  codigo          text,
  estado          text,
  promo_id        text,
  promo_nombre    text,
  promo_descuento text,
  socio_nombre    text,
  created_at      timestamptz,
  expires_at      timestamptz,
  canjeado_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  t   public.tickets%rowtype;
  nombre_socio text;
  m   text;
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;

  select * into t from public.tickets where tickets.codigo = public._normalizar_codigo(p_codigo);
  if not found then
    return query select false, 'TICKET_NO_EXISTE'::text, public._normalizar_codigo(p_codigo),
      null::text, null::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  select nullif(split_part(trim(coalesce(pf.nombre, '')), ' ', 1), '') into nombre_socio
  from public.profiles pf where pf.id = t.user_id;
  m := public._ticket_motivo(t, uid, null);

  return query select m is null, m, t.codigo,
    case when t.estado = 'disponible' and t.expires_at <= now() then 'caducado' else t.estado end,
    t.promo_id, t.promo_nombre, t.promo_descuento, nombre_socio,
    t.created_at, t.expires_at, t.canjeado_at;
end;
$$;

create or replace function public.redeem_ticket(p_codigo text, p_importe_centimos integer default null)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  if p_importe_centimos is not null and p_importe_centimos < 0 then
    raise exception 'IMPORTE_INVALIDO';
  end if;
  select tk.id into v_id from public.tickets tk where tk.codigo = public._normalizar_codigo(p_codigo);
  if not found then raise exception 'TICKET_NO_EXISTE'; end if;
  return public._canjear_ticket(v_id, uid, p_importe_centimos, null);
end;
$$;


-- 8.5 de tickets.sql: un admin deshace un canje hecho por error. Si el
-- ticket se usó en el TPV no se reabre aquí: se anula su línea en la
-- cuenta (y vuelve solo a disponible) o, si ya se cobró, se devuelve.
create or replace function public.admin_reopen_ticket(p_id uuid, p_motivo text)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  antes public.tickets%rowtype;
  t     public.tickets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_OBLIGATORIO';
  end if;

  select * into antes from public.tickets tk where tk.id = p_id for update;
  if not found then raise exception 'TICKET_NO_EXISTE'; end if;
  if antes.estado <> 'canjeado' then raise exception 'TICKET_NO_CANJEADO'; end if;
  if antes.order_item_id is not null then raise exception 'TICKET_EN_VENTA'; end if;
  if antes.expires_at <= now() then raise exception 'TICKET_CADUCADO'; end if;

  begin
    update public.tickets tk
    set estado = 'disponible', canjeado_at = null, canjeado_por = null, importe_descuento_centimos = null
    where tk.id = p_id
    returning * into t;
  exception when unique_violation then
    raise exception 'TICKET_YA_DISPONIBLE';  -- el socio ya tiene otro disponible de esa promo
  end;

  insert into public.ticket_events (ticket_id, tipo, actor, detalle)
  values (t.id, 'reabierto', uid, jsonb_build_object(
    'motivo', trim(p_motivo),
    'canjeado_at_anterior', antes.canjeado_at,
    'canjeado_por_anterior', antes.canjeado_por,
    'importe_anterior', antes.importe_descuento_centimos
  ));
  return t;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Ventas: el resumen incluye promos, tickets y descuentos
-- ---------------------------------------------------------------------
create or replace function public._pos_venta_json(p_order_id uuid, p_repetida boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sale_id', s.id,
    'numero', s.numero,
    'bruto_centimos', s.bruto_centimos,
    'descuentos_centimos', s.descuentos_centimos,
    'total_centimos', s.total_centimos,
    'metodo', s.metodo,
    'cobrado_at', s.cobrado_at,
    'repetida', p_repetida,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', oi.product_id, 'promo_id', oi.promo_id, 'tipo_linea', oi.tipo_linea,
        'nombre', oi.nombre, 'cantidad', oi.cantidad,
        'precio_unitario_centimos', oi.precio_unitario_centimos,
        'descuento_centimos', oi.descuento_centimos, 'ticket_codigo', oi.ticket_codigo
      ) order by oi.created_at, oi.nombre)
      from public.order_items oi where oi.order_id = s.order_id and oi.estado <> 'anulada'
    ), '[]'::jsonb)
  )
  from public.sales s
  where s.order_id = p_order_id;
$$;

-- Crea la venta de una cuenta con sus totales y enlaza los tickets.
create or replace function public._pos_crear_venta(p_order public.orders, p_metodo text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_desc  integer;
  v_sale  uuid;
begin
  select coalesce(sum(precio_unitario_centimos * cantidad), 0), coalesce(sum(coalesce(descuento_centimos, 0)), 0)
  into v_total, v_desc
  from public.order_items where order_id = p_order.id and estado in ('aceptada', 'servida');

  insert into public.sales (order_id, bruto_centimos, descuentos_centimos, total_centimos, metodo, cobrado_por, jornada)
  values (p_order.id, v_total + v_desc, v_desc, v_total, p_metodo, p_actor, p_order.jornada)
  returning id into v_sale;

  update public.tickets tk set sale_id = v_sale
  from public.order_items oi
  where oi.order_id = p_order.id and oi.estado in ('aceptada', 'servida') and tk.id = oi.ticket_id;

  insert into public.pos_events (order_id, sale_id, tipo, actor, detalle)
  values (p_order.id, v_sale, 'pagada', p_actor, jsonb_build_object(
    'origen', p_order.origen, 'metodo', p_metodo, 'total_centimos', v_total, 'descuentos_centimos', v_desc));
  return v_sale;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. RPC reescritas (mismos parámetros que antes)
--    p_items admite ahora también promos:
--      {"promo_id": "pack-partido", "cantidad": 1, "ticket_codigo": "ALA-7K3P"}
--    (ticket_codigo solo en las del camarero, y solo si la promo es de club).
-- ---------------------------------------------------------------------

-- 5.1 Venta en barra (pos.sql).
create or replace function public.pos_venta_barra(p_items jsonb, p_metodo text, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  o          public.orders%rowtype;
  v_order    uuid;
  r          record;
  e          jsonb;
  p          public.products%rowtype;
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  if p_client_request_id is null then raise exception 'SOLICITUD_INVALIDA'; end if;
  if p_metodo is null or p_metodo not in ('efectivo', 'tarjeta', 'otro') then raise exception 'METODO_INVALIDO'; end if;

  -- ¿Ya se cobró este mismo intento? Entonces se devuelve esa venta.
  select id into v_order from public.orders where client_request_id = p_client_request_id;
  if found then return public._pos_venta_json(v_order, true); end if;

  perform public._pos_items_validos(p_items);

  insert into public.orders (origen, estado, abierta_por, jornada, client_request_id)
  values ('barra', 'pagada', uid, public._jornada_fecha(), p_client_request_id)
  on conflict (client_request_id) do nothing
  returning id into v_order;
  if v_order is null then
    select id into v_order from public.orders where client_request_id = p_client_request_id;
    return public._pos_venta_json(v_order, true);
  end if;

  -- Productos: se agrupan y el precio sale de la tabla products.
  for r in
    select x ->> 'product_id' as pid_txt, sum(public._pos_cantidad(x)) as cantidad,
           bool_or(public._pos_cantidad(x) < 0) as cantidad_mala
    from jsonb_array_elements(p_items) x
    where x ? 'product_id'
    group by 1
  loop
    if r.pid_txt is null or r.pid_txt !~ '^[0-9]{1,9}$' then raise exception 'PRODUCTO_NO_EXISTE'; end if;
    if r.cantidad_mala or r.cantidad < 1 or r.cantidad > 99 then raise exception 'CANTIDAD_INVALIDA'; end if;
    select * into p from public.products pr where pr.id = r.pid_txt::integer;
    if not found or not p.activo then
      raise exception 'PRODUCTO_NO_EXISTE' using detail = coalesce(p.nombre, '#' || r.pid_txt);
    end if;
    if not p.disponible then raise exception 'PRODUCTO_AGOTADO' using detail = p.nombre; end if;
    if p.precio_centimos is null then raise exception 'PRODUCTO_SIN_PRECIO' using detail = p.nombre; end if;

    insert into public.order_items (order_id, product_id, nombre, precio_unitario_centimos, tipo_linea, cantidad, anadida_por, estado)
    values (v_order, p.id, p.nombre, p.precio_centimos, 'producto', r.cantidad, uid, 'servida');
  end loop;

  -- Promos: una línea por elemento (las de club, con su ticket).
  for e in select x from jsonb_array_elements(p_items) x where x ? 'promo_id' loop
    perform public._pos_linea_promo(v_order, e ->> 'promo_id', public._pos_cantidad(e), null,
                                    e ->> 'ticket_codigo', 'servida', uid, false, null, null);
  end loop;

  select * into o from public.orders where id = v_order;
  perform public._pos_crear_venta(o, p_metodo, uid);
  return public._pos_venta_json(v_order, false);
end;
$$;

-- 7.2 de pos-mesas.sql: añadir consumiciones a una cuenta abierta.
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
  e       jsonb;
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

  perform public._pos_items_validos(p_items);

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

  for e in select x from jsonb_array_elements(p_items) x where x ? 'promo_id' loop
    perform public._pos_linea_promo(o.id, e ->> 'promo_id', public._pos_cantidad(e),
                                    nullif(trim(coalesce(e ->> 'notas', '')), ''),
                                    e ->> 'ticket_codigo', 'aceptada', uid, false, null, null);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('repetida', false, 'lineas', v_n);
end;
$$;

-- 7.4 de pos-mesas.sql: anular una línea (su ticket se libera o se reabre).
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
  perform public._pos_liberar_ticket(li, uid, trim(p_motivo));
  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  values (li.order_id, li.id, 'linea_anulada', uid,
          jsonb_strip_nulls(jsonb_build_object('motivo', trim(p_motivo), 'estado_anterior', li.estado, 'producto', li.nombre,
                             'cantidad', li.cantidad, 'importe_centimos', li.precio_unitario_centimos * li.cantidad,
                             'ticket', li.ticket_codigo)));
end;
$$;

-- 7.5 de pos-mesas.sql: cobrar (total, descuentos y tickets enlazados).
create or replace function public.pos_cobrar_cuenta(p_order_id uuid, p_metodo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := public._pos_exigir_camarero();
  o        public.orders%rowtype;
begin
  if p_metodo is null or p_metodo not in ('efectivo', 'tarjeta', 'otro') then raise exception 'METODO_INVALIDO'; end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'CUENTA_NO_EXISTE'; end if;
  if o.estado = 'pagada' then return public._pos_venta_json(o.id, true); end if;
  if o.estado <> 'abierta' then raise exception 'CUENTA_CERRADA'; end if;

  if exists (select 1 from public.order_items where order_id = o.id and estado = 'pendiente') then
    raise exception 'PEDIDOS_PENDIENTES';
  end if;
  if not exists (select 1 from public.order_items where order_id = o.id and estado in ('aceptada', 'servida')) then
    raise exception 'CUENTA_VACIA';
  end if;

  update public.orders set estado = 'pagada' where id = o.id;
  perform public._pos_crear_venta(o, p_metodo, uid);
  return public._pos_venta_json(o.id, false);
end;
$$;

-- 7.6 de pos-mesas.sql: cancelar sin cobrar (los tickets se liberan).
create or replace function public.pos_cancelar_cuenta(p_order_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._pos_exigir_camarero();
  o   public.orders%rowtype;
  li  public.order_items%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  o := public._pos_cuenta_abierta(p_order_id);
  if exists (select 1 from public.order_items where order_id = o.id and estado = 'servida') then
    raise exception 'CUENTA_CON_SERVIDAS';
  end if;

  for li in
    update public.order_items set estado = 'anulada'
    where order_id = o.id and estado in ('pendiente', 'aceptada')
    returning *
  loop
    perform public._pos_liberar_ticket(li, uid, trim(p_motivo));
    insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
    values (o.id, li.id, 'linea_anulada', uid, jsonb_build_object('motivo', trim(p_motivo), 'por_cancelacion', true));
  end loop;

  update public.orders set estado = 'cancelada' where id = o.id;
  insert into public.pos_events (order_id, tipo, actor, detalle)
  values (o.id, 'cancelada', uid, jsonb_build_object('motivo', trim(p_motivo)));
end;
$$;

-- 5 de pos-pedidos.sql: el socio envía una ronda (ahora también promos).
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
  e        jsonb;
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
      values (v_order, 'abierta', uid, jsonb_build_object('mesa', m.nombre, 'origen', 'socio'));
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

  return jsonb_build_object('repetida', false, 'ronda', p_client_request_id, 'lineas', v_n, 'mesa', m.nombre);
end;
$$;

-- 6 de pos-pedidos.sql: aceptar una ronda canjea sus tickets. Si alguno ya
-- no vale (p. ej. caducó), no se acepta nada y el error dice qué promo es.
create or replace function public.pos_aceptar_ronda(p_order_id uuid, p_ronda uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._pos_exigir_camarero();
  li  public.order_items%rowtype;
  n   integer;
begin
  perform public._pos_cuenta_abierta(p_order_id);

  for li in
    select * from public.order_items
    where order_id = p_order_id and ronda = p_ronda and estado = 'pendiente' and ticket_id is not null
  loop
    begin
      perform public._canjear_ticket(li.ticket_id, uid, li.descuento_centimos, li.id);
    exception when raise_exception then
      raise exception using message = sqlerrm, detail = li.nombre;
    end;
  end loop;

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

-- Rechazar una ronda deja libres los tickets que tenía reservados.
create or replace function public.pos_rechazar_ronda(p_order_id uuid, p_ronda uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._pos_exigir_camarero();
  li  public.order_items%rowtype;
  n   integer := 0;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  perform public._pos_cuenta_abierta(p_order_id);

  for li in
    update public.order_items set estado = 'anulada'
    where order_id = p_order_id and ronda = p_ronda and estado = 'pendiente'
    returning *
  loop
    perform public._pos_liberar_ticket(li, uid, trim(p_motivo));
    insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
    values (p_order_id, li.id, 'linea_anulada', uid,
            jsonb_build_object('motivo', trim(p_motivo), 'rechazo', true, 'ronda', p_ronda));
    n := n + 1;
  end loop;
  return n;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Permisos: las funciones internas no se llaman desde la web (las RPC
--    reescritas conservan los permisos que ya tenían).
-- ---------------------------------------------------------------------
revoke execute on function public._promo_descuento_unidad(text, integer)                        from public, anon, authenticated;
revoke execute on function public._ticket_motivo(public.tickets, uuid, uuid)                    from public, anon, authenticated;
revoke execute on function public._canjear_ticket(uuid, uuid, integer, uuid)                    from public, anon, authenticated;
revoke execute on function public._pos_liberar_ticket(public.order_items, uuid, text)           from public, anon, authenticated;
revoke execute on function public._pos_linea_promo(uuid, text, integer, text, text, text, uuid, boolean, text, uuid)
                                                                                                from public, anon, authenticated;
revoke execute on function public._pos_items_validos(jsonb)                                     from public, anon, authenticated;
revoke execute on function public._pos_cantidad(jsonb)                                          from public, anon, authenticated;
revoke execute on function public._pos_crear_venta(public.orders, text, uuid)                   from public, anon, authenticated;


-- =====================================================================
--  PRUEBAS MANUALES (opcionales; NO cambian nada)
--
--  Sustituye ID-CAMARERO por una cuenta con es_camarero = true, y
--  ALA-XXXX por el código de un ticket disponible de OTRO socio para la
--  promo PROMO (encendida y con precio).
--
--  1) Venta en barra con la promo y su ticket → el ticket queda canjeado
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    set local role authenticated;
--    select public.pos_venta_barra('[{"promo_id":"PROMO","cantidad":1,"ticket_codigo":"ALA-XXXX"}]',
--                                  'efectivo', gen_random_uuid());
--    -- Repetir con OTRO id de solicitud → TICKET_YA_CANJEADO
--    rollback;
-- =====================================================================
