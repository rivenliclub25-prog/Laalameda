-- =====================================================================
--  La Alameda — POS: cuentas, líneas, ventas y registro (fase P2)
--
--  Requisito: haber ejecutado antes schema.sql, admin.sql, tickets.sql,
--  catalogo.sql y catalogo-codigos.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
--
--  Idea general (POS.md, secciones 3 y 4):
--    · Una CUENTA (orders) agrupa LÍNEAS (order_items). Sirve para la
--      barra (P2) y, más adelante, para las mesas (P3).
--    · La VENTA (sales) nace solo cuando la cuenta se marca como pagada,
--      con su método de pago. Las ventas no se borran ni se editan.
--    · El navegador solo envía qué productos y cuántos: el PRECIO lo pone
--      siempre la base de datos (tabla products).
--    · Todo queda registrado en pos_events.
--  Dinero en céntimos (enteros). Horas en Europe/Madrid.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Cuentas
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  origen            text not null check (origen in ('barra', 'mesa')),
  estado            text not null default 'abierta' check (estado in ('abierta', 'pagada', 'cancelada')),
  abierta_por       uuid references auth.users (id) on delete set null,   -- camarero (o socio en P4)
  jornada           date not null,                                       -- jornada del bar (hora de cierre)
  client_request_id uuid unique,      -- evita duplicados: el mismo envío repetido no crea otra cuenta
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orders_jornada_idx on public.orders (jornada, created_at desc);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. Líneas de la cuenta
--    Cada línea es un producto O una promo (P5), con una COPIA del nombre
--    y del precio en el momento de añadirla: si luego cambia el precio en
--    el panel, las cuentas y ventas no cambian.
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders (id) on delete restrict,
  product_id               integer references public.products (id) on update cascade on delete restrict,
  promo_id                 text references public.promotions (id) on update cascade on delete restrict,
  nombre                   text not null,
  precio_unitario_centimos integer not null check (precio_unitario_centimos >= 0),
  tipo_linea               text not null default 'producto'
                             check (tipo_linea in ('producto', 'pack', 'obsequio', 'sorteo')),
  cantidad                 integer not null check (cantidad between 1 and 99),
  notas                    text,                                                   -- P3
  pedido_por               uuid references auth.users (id) on delete set null,     -- socio (P4); null si no es socio
  anadida_por              uuid references auth.users (id) on delete set null,     -- camarero; null si la pidió el socio
  estado                   text not null default 'aceptada'
                             check (estado in ('pendiente', 'aceptada', 'servida', 'anulada')),
  ticket_id                uuid references public.tickets (id) on delete set null, -- P5
  descuento_centimos       integer check (descuento_centimos is null or descuento_centimos >= 0),  -- P5
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint order_items_producto_o_promo check ((product_id is null) <> (promo_id is null))
);

create index if not exists order_items_order_idx on public.order_items (order_id);

drop trigger if exists order_items_set_updated_at on public.order_items;
create trigger order_items_set_updated_at before update on public.order_items
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 3. Ventas (cuentas cobradas)
--    Una por cuenta (order_id único). No se borran ni se editan: las
--    correcciones serán devoluciones (P3).
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity unique,   -- nº de venta legible (1, 2, 3…)
  order_id            uuid not null unique references public.orders (id) on delete restrict,
  bruto_centimos      integer not null check (bruto_centimos >= 0),
  descuentos_centimos integer not null default 0 check (descuentos_centimos >= 0),
  total_centimos      integer not null check (total_centimos >= 0),
  metodo              text not null check (metodo in ('efectivo', 'tarjeta', 'otro')),
  cobrado_por         uuid references auth.users (id) on delete set null,
  cobrado_at          timestamptz not null default now(),
  jornada             date not null
);

create index if not exists sales_cobrado_idx on public.sales (cobrado_at desc);
create index if not exists sales_jornada_idx on public.sales (jornada);

-- Inmutables. Única excepción: si se borra la cuenta de un camarero, su
-- id pasa a null (las ventas se conservan sin datos personales).
create or replace function public.sales_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'VENTA_INMUTABLE' using errcode = '42501';
  end if;
  if (new.id, new.numero, new.order_id, new.bruto_centimos, new.descuentos_centimos, new.total_centimos,
      new.metodo, new.cobrado_at, new.jornada)
     is distinct from
     (old.id, old.numero, old.order_id, old.bruto_centimos, old.descuentos_centimos, old.total_centimos,
      old.metodo, old.cobrado_at, old.jornada)
     or (new.cobrado_por is distinct from old.cobrado_por and new.cobrado_por is not null) then
    raise exception 'VENTA_INMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_inmutable on public.sales;
create trigger sales_inmutable before update or delete on public.sales
  for each row execute function public.sales_inmutable();


-- ---------------------------------------------------------------------
-- 4. Registro de eventos del POS
-- ---------------------------------------------------------------------
create table if not exists public.pos_events (
  id       bigint generated always as identity primary key,
  order_id uuid references public.orders (id) on delete cascade,
  item_id  uuid references public.order_items (id) on delete set null,
  sale_id  uuid references public.sales (id) on delete set null,
  tipo     text not null check (tipo in ('abierta', 'linea_anadida', 'linea_aceptada', 'linea_servida',
                                         'linea_anulada', 'pagada', 'cancelada', 'devuelta')),
  actor    uuid references auth.users (id) on delete set null,
  at       timestamptz not null default now(),
  detalle  jsonb not null default '{}'::jsonb
);

create index if not exists pos_events_order_idx on public.pos_events (order_id, at);


-- ---------------------------------------------------------------------
-- 5. Seguridad (RLS)
--    Leer: camareros y admins. Nadie escribe directamente: todo pasa por
--    las funciones RPC (security definer), que comprueban los permisos.
--    (En P4 los socios podrán leer sus propias cuentas.)
-- ---------------------------------------------------------------------
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.sales       enable row level security;
alter table public.pos_events  enable row level security;

drop policy if exists "Personal lee las cuentas" on public.orders;
create policy "Personal lee las cuentas" on public.orders for select to authenticated
  using ((select public.is_camarero()) or (select public.is_admin()));

drop policy if exists "Personal lee las líneas" on public.order_items;
create policy "Personal lee las líneas" on public.order_items for select to authenticated
  using ((select public.is_camarero()) or (select public.is_admin()));

drop policy if exists "Personal lee las ventas" on public.sales;
create policy "Personal lee las ventas" on public.sales for select to authenticated
  using ((select public.is_camarero()) or (select public.is_admin()));

drop policy if exists "Personal lee el registro" on public.pos_events;
create policy "Personal lee el registro" on public.pos_events for select to authenticated
  using ((select public.is_camarero()) or (select public.is_admin()));

revoke all on public.orders, public.order_items, public.sales, public.pos_events from anon, authenticated;
grant select on public.orders, public.order_items, public.sales, public.pos_events to authenticated;


-- ---------------------------------------------------------------------
-- 6. RPC: venta en barra (P2)
--    Crea la cuenta, sus líneas y la venta, ya pagada, en UNA operación.
--      p_items: [{"product_id": 15, "cantidad": 2}, …]  (el precio se ignora
--               aunque venga: lo pone la base de datos)
--      p_metodo: 'efectivo' | 'tarjeta' | 'otro'
--      p_client_request_id: identificador único del intento de cobro. Si
--               llega repetido (doble toque, reintento por mala red), se
--               devuelve la venta ya creada en vez de crear otra.
--    Devuelve: { sale_id, numero, bruto_centimos, total_centimos, metodo,
--                cobrado_at, repetida, lineas: [...] }
--    Errores: NO_ES_CAMARERO, SOLICITUD_INVALIDA, METODO_INVALIDO,
--             VENTA_VACIA, CANTIDAD_INVALIDA, PRODUCTO_NO_EXISTE,
--             PRODUCTO_AGOTADO, PRODUCTO_SIN_PRECIO.
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
    'total_centimos', s.total_centimos,
    'metodo', s.metodo,
    'cobrado_at', s.cobrado_at,
    'repetida', p_repetida,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', oi.product_id, 'nombre', oi.nombre, 'cantidad', oi.cantidad,
        'precio_unitario_centimos', oi.precio_unitario_centimos
      ) order by oi.created_at, oi.nombre)
      from public.order_items oi where oi.order_id = s.order_id
    ), '[]'::jsonb)
  )
  from public.sales s
  where s.order_id = p_order_id;
$$;

create or replace function public.pos_venta_barra(p_items jsonb, p_metodo text, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  v_order    uuid;
  v_jornada  date := public._jornada_fecha();
  v_bruto    integer := 0;
  v_sale     uuid;
  r          record;
  p          public.products%rowtype;
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'SOLICITUD_INVALIDA';
  end if;
  if p_metodo is null or p_metodo not in ('efectivo', 'tarjeta', 'otro') then
    raise exception 'METODO_INVALIDO';
  end if;

  -- ¿Ya se cobró este mismo intento? Entonces se devuelve esa venta.
  select o.id into v_order from public.orders o where o.client_request_id = p_client_request_id;
  if found then
    return public._pos_venta_json(v_order, true);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VENTA_VACIA';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Crea la cuenta. Si dos envíos idénticos llegan a la vez, el segundo
  -- espera al primero y devuelve su venta.
  insert into public.orders (origen, estado, abierta_por, jornada, client_request_id)
  values ('barra', 'pagada', uid, v_jornada, p_client_request_id)
  on conflict (client_request_id) do nothing
  returning id into v_order;
  if v_order is null then
    select o.id into v_order from public.orders o where o.client_request_id = p_client_request_id;
    return public._pos_venta_json(v_order, true);
  end if;

  -- Líneas: se agrupan por producto y el precio sale de la tabla products.
  for r in
    select e ->> 'product_id' as pid_txt, sum(
             case when (e ->> 'cantidad') ~ '^[0-9]{1,3}$' then (e ->> 'cantidad')::integer else 0 end
           ) as cantidad,
           bool_or(not coalesce((e ->> 'cantidad') ~ '^[0-9]{1,3}$', false)) as cantidad_mala
    from jsonb_array_elements(p_items) e
    group by e ->> 'product_id'
  loop
    if r.pid_txt is null or r.pid_txt !~ '^[0-9]{1,9}$' then
      raise exception 'PRODUCTO_NO_EXISTE';
    end if;
    if r.cantidad_mala or r.cantidad < 1 or r.cantidad > 99 then
      raise exception 'CANTIDAD_INVALIDA';
    end if;
    select * into p from public.products pr where pr.id = r.pid_txt::integer;
    if not found or not p.activo then
      raise exception 'PRODUCTO_NO_EXISTE' using detail = coalesce(p.nombre, '#' || r.pid_txt);
    end if;
    if not p.disponible then
      raise exception 'PRODUCTO_AGOTADO' using detail = p.nombre;
    end if;
    if p.precio_centimos is null then
      raise exception 'PRODUCTO_SIN_PRECIO' using detail = p.nombre;
    end if;

    insert into public.order_items (order_id, product_id, nombre, precio_unitario_centimos, tipo_linea, cantidad, anadida_por, estado)
    values (v_order, p.id, p.nombre, p.precio_centimos, 'producto', r.cantidad, uid, 'servida');
    v_bruto := v_bruto + p.precio_centimos * r.cantidad;
  end loop;

  insert into public.sales (order_id, bruto_centimos, descuentos_centimos, total_centimos, metodo, cobrado_por, jornada)
  values (v_order, v_bruto, 0, v_bruto, p_metodo, uid, v_jornada)
  returning id into v_sale;

  insert into public.pos_events (order_id, sale_id, tipo, actor, detalle)
  values (v_order, v_sale, 'pagada', uid,
          jsonb_build_object('origen', 'barra', 'metodo', p_metodo, 'total_centimos', v_bruto));

  return public._pos_venta_json(v_order, false);
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public._pos_venta_json(uuid, boolean)            from public, anon, authenticated;
revoke execute on function public.sales_inmutable()                          from public, anon, authenticated;
revoke execute on function public.pos_venta_barra(jsonb, text, uuid)         from public, anon;
grant  execute on function public.pos_venta_barra(jsonb, text, uuid)         to authenticated;


-- =====================================================================
--  PRUEBAS MANUALES (opcionales; NO cambian nada)
--
--  Cada bloque va entre "begin" y "rollback". Sustituye ID-CAMARERO por
--  el id de una cuenta con es_camarero = true e ID-SOCIO por una normal.
--
--  1) Venta correcta: el precio lo pone la base de datos (el "precio": 1
--     del navegador se ignora). Caña (#15) x2 + Patatas (#5) x1.
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    set local role authenticated;
--    select public.pos_venta_barra('[{"product_id":15,"cantidad":2,"precio":1},{"product_id":5,"cantidad":1}]',
--                                  'efectivo', '00000000-0000-0000-0000-000000000001');
--    rollback;
--
--  2) Doble toque = una sola venta: repite la misma llamada dos veces en
--     el mismo bloque; la segunda devuelve "repetida": true y el mismo nº.
--
--  3) Sin ser camarero → NO_ES_CAMARERO
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    set local role authenticated;
--    select public.pos_venta_barra('[{"product_id":15,"cantidad":1}]', 'efectivo', gen_random_uuid());
--    rollback;
--
--  4) Producto agotado → PRODUCTO_AGOTADO
--    begin;
--    update public.products set disponible = false where id = 15;
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    set local role authenticated;
--    select public.pos_venta_barra('[{"product_id":15,"cantidad":1}]', 'tarjeta', gen_random_uuid());
--    rollback;
--
--  5) Las ventas no se pueden borrar → VENTA_INMUTABLE
--    begin;
--    delete from public.sales;
--    rollback;
-- =====================================================================
