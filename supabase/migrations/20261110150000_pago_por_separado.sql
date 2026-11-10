-- =====================================================================
--  Pagar por separado (TPV, entrega B, 2026-11-10)
--
--  Una cuenta (mesa o puesto de barra) puede cobrarse en VARIAS ventas:
--  cada persona paga lo suyo (líneas enteras o unidades sueltas de una
--  línea) y la cuenta sigue abierta con el resto. Cuando ya no queda nada
--  por cobrar, la cuenta se cierra sola.
--
--  - order_items.sale_id: en qué venta se cobró cada línea (null = sin cobrar).
--    Se rellena en las ventas que ya existían (una venta por cuenta).
--  - sales.order_id deja de ser único (varias ventas por cuenta).
--  - sales.client_request_id: protege del doble toque en el cobro parcial.
--  - Cada venta muestra y cuenta SOLO sus líneas (resumen, justificante,
--    tickets e informe). Cobrado − devuelto sigue cuadrando.
--  - Nueva RPC pos_cobrar_parte; cambian _pos_crear_venta, _pos_venta_json,
--    pos_cobrar_cuenta, pos_cancelar_cuenta, pos_anular_linea y admin_informe
--    (mismos parámetros).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Datos
-- ---------------------------------------------------------------------
ALTER TABLE "public"."order_items" ADD COLUMN IF NOT EXISTS "sale_id" "uuid";
ALTER TABLE "public"."order_items" DROP CONSTRAINT IF EXISTS "order_items_sale_id_fkey";
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "order_items_sale_idx" ON "public"."order_items" ("sale_id");

-- Las ventas que ya existían se cobraron enteras: sus líneas vivas son de esa venta.
UPDATE "public"."order_items" oi SET "sale_id" = s."id"
FROM "public"."sales" s
WHERE s."order_id" = oi."order_id" AND oi."estado" IN ('aceptada', 'servida') AND oi."sale_id" IS NULL;

ALTER TABLE "public"."sales" DROP CONSTRAINT IF EXISTS "sales_order_id_key";
CREATE INDEX IF NOT EXISTS "sales_order_idx" ON "public"."sales" ("order_id");

ALTER TABLE "public"."sales" ADD COLUMN IF NOT EXISTS "client_request_id" "uuid";
CREATE UNIQUE INDEX IF NOT EXISTS "sales_client_request_id_key" ON "public"."sales" ("client_request_id");


-- ---------------------------------------------------------------------
-- 2. Resumen de una venta (solo sus líneas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."_pos_venta_json_sale"("p_sale_id" "uuid", "p_repetida" boolean) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'sale_id', s.id,
    'numero', s.numero,
    'bruto_centimos', s.bruto_centimos,
    'descuentos_centimos', s.descuentos_centimos,
    'total_centimos', s.total_centimos,
    'metodo', s.metodo,
    'cobrado_at', s.cobrado_at,
    'repetida', p_repetida,
    'cuenta_cerrada', o.estado <> 'abierta',
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', oi.product_id, 'promo_id', oi.promo_id, 'tipo_linea', oi.tipo_linea,
        'nombre', oi.nombre, 'cantidad', oi.cantidad,
        'precio_unitario_centimos', oi.precio_unitario_centimos,
        'descuento_centimos', oi.descuento_centimos, 'ticket_codigo', oi.ticket_codigo
      ) order by oi.created_at, oi.nombre)
      from public.order_items oi where oi.sale_id = s.id
    ), '[]'::jsonb)
  )
  from public.sales s
  join public.orders o on o.id = s.order_id
  where s.id = p_sale_id;
$$;

-- Por cuenta: la ÚLTIMA venta de esa cuenta (venta rápida y cobros repetidos).
CREATE OR REPLACE FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public._pos_venta_json_sale(s.id, p_repetida)
  from public.sales s
  where s.order_id = p_order_id
  order by s.numero desc
  limit 1;
$$;


-- ---------------------------------------------------------------------
-- 3. Crear una venta con unas líneas concretas (o con todo lo que falta)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."_pos_crear_venta_lineas"("p_order" "public"."orders", "p_items" "uuid"[], "p_metodo" "text", "p_actor" "uuid", "p_client_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_total integer;
  v_desc  integer;
  v_sale  uuid;
begin
  select coalesce(sum(precio_unitario_centimos * cantidad), 0), coalesce(sum(coalesce(descuento_centimos, 0)), 0)
  into v_total, v_desc
  from public.order_items where id = any (p_items);

  insert into public.sales (order_id, bruto_centimos, descuentos_centimos, total_centimos, metodo, cobrado_por, jornada, client_request_id)
  values (p_order.id, v_total + v_desc, v_desc, v_total, p_metodo, p_actor, p_order.jornada, p_client_request_id)
  returning id into v_sale;

  update public.order_items set sale_id = v_sale where id = any (p_items);
  update public.tickets tk set sale_id = v_sale
  from public.order_items oi
  where oi.id = any (p_items) and tk.id = oi.ticket_id;

  insert into public.pos_events (order_id, sale_id, tipo, actor, detalle)
  values (p_order.id, v_sale, 'pagada', p_actor, jsonb_build_object(
    'origen', p_order.origen, 'metodo', p_metodo, 'total_centimos', v_total, 'descuentos_centimos', v_desc,
    'lineas', cardinality(p_items)));
  return v_sale;
end;
$$;

-- Cobra todo lo que falta de una cuenta (mismos parámetros que antes).
CREATE OR REPLACE FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_items uuid[];
begin
  select array_agg(id) into v_items
  from public.order_items
  where order_id = p_order.id and estado in ('aceptada', 'servida') and sale_id is null;
  if v_items is null then raise exception 'CUENTA_VACIA'; end if;
  return public._pos_crear_venta_lineas(p_order, v_items, p_metodo, p_actor, null);
end;
$$;

-- ¿Queda algo por cobrar o por aceptar en la cuenta?
CREATE OR REPLACE FUNCTION "public"."_pos_cuenta_pendiente"("p_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and (estado = 'pendiente' or (estado in ('aceptada', 'servida') and sale_id is null))
  );
$$;


-- ---------------------------------------------------------------------
-- 4. Cobrar la cuenta: lo que falta (ya no todo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid      uuid := public._pos_exigir_camarero();
  o        public.orders%rowtype;
  v_sale   uuid;
begin
  if p_metodo is null or p_metodo not in ('efectivo', 'tarjeta', 'otro') then raise exception 'METODO_INVALIDO'; end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'CUENTA_NO_EXISTE'; end if;
  if o.estado = 'pagada' then return public._pos_venta_json(o.id, true); end if;
  if o.estado <> 'abierta' then raise exception 'CUENTA_CERRADA'; end if;

  if exists (select 1 from public.order_items where order_id = o.id and estado = 'pendiente') then
    raise exception 'PEDIDOS_PENDIENTES';
  end if;
  if not exists (select 1 from public.order_items where order_id = o.id and estado in ('aceptada', 'servida') and sale_id is null) then
    raise exception 'CUENTA_VACIA';
  end if;

  v_sale := public._pos_crear_venta(o, p_metodo, uid);
  update public.orders set estado = 'pagada' where id = o.id;
  return public._pos_venta_json_sale(v_sale, false);
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Cobrar una parte: lo que paga una persona
--    p_items: [{"item_id": "<línea>", "cantidad": 1}, …]  (cantidad ≤ la de la línea;
--    si es menor, la línea se parte en dos). Un p_client_request_id repetido
--    devuelve la venta ya hecha. Si ya no queda nada por cobrar ni por
--    aceptar, la cuenta se cierra.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."pos_cobrar_parte"("p_order_id" "uuid", "p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid       uuid := public._pos_exigir_camarero();
  o         public.orders%rowtype;
  li        public.order_items%rowtype;
  e         jsonb;
  v_id      uuid;
  v_cant    integer;
  v_desc    integer;
  v_nuevo   uuid;
  v_items   uuid[] := '{}';
  v_sale    uuid;
begin
  if p_client_request_id is null then raise exception 'SOLICITUD_INVALIDA'; end if;
  if p_metodo is null or p_metodo not in ('efectivo', 'tarjeta', 'otro') then raise exception 'METODO_INVALIDO'; end if;

  -- ¿Ya se cobró este mismo intento? (doble toque o reintento)
  select id into v_sale from public.sales where client_request_id = p_client_request_id;
  if found then return public._pos_venta_json_sale(v_sale, true); end if;

  o := public._pos_cuenta_abierta(p_order_id);   -- bloquea la cuenta (otro camarero espera)
  -- Repetido mientras se esperaba el bloqueo.
  select id into v_sale from public.sales where client_request_id = p_client_request_id;
  if found then return public._pos_venta_json_sale(v_sale, true); end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VENTA_VACIA';
  end if;
  if (select count(distinct x ->> 'item_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'LINEA_REPETIDA';
  end if;

  for e in select x from jsonb_array_elements(p_items) x loop
    begin
      v_id := (e ->> 'item_id')::uuid;
    exception when others then
      raise exception 'LINEA_NO_EXISTE';
    end;
    v_cant := public._pos_cantidad(e);

    select * into li from public.order_items where id = v_id and order_id = o.id for update;
    if not found then raise exception 'LINEA_NO_EXISTE'; end if;
    if li.estado not in ('aceptada', 'servida') then raise exception 'LINEA_NO_COBRABLE' using detail = li.nombre; end if;
    if li.sale_id is not null then raise exception 'LINEA_YA_PAGADA' using detail = li.nombre; end if;
    if v_cant < 1 or v_cant > li.cantidad then raise exception 'CANTIDAD_INVALIDA' using detail = li.nombre; end if;

    if v_cant = li.cantidad then
      v_items := v_items || li.id;
    else
      -- Se parte la línea: lo que se paga ahora pasa a una línea nueva.
      v_desc := case when li.descuento_centimos is null then null
                     else round(li.descuento_centimos::numeric * v_cant / li.cantidad)::integer end;
      update public.order_items
      set cantidad = li.cantidad - v_cant,
          descuento_centimos = case when v_desc is null then null else li.descuento_centimos - v_desc end
      where id = li.id;
      insert into public.order_items (order_id, product_id, promo_id, nombre, precio_unitario_centimos, tipo_linea, cantidad,
                                      notas, pedido_por, anadida_por, estado, descuento_centimos, created_at,
                                      ronda, pedido_por_nombre, mesa_a_mano)
      values (li.order_id, li.product_id, li.promo_id, li.nombre, li.precio_unitario_centimos, li.tipo_linea, v_cant,
              li.notas, li.pedido_por, li.anadida_por, li.estado, v_desc, li.created_at,
              li.ronda, li.pedido_por_nombre, li.mesa_a_mano)
      returning id into v_nuevo;
      v_items := v_items || v_nuevo;
    end if;
  end loop;

  begin
    v_sale := public._pos_crear_venta_lineas(o, v_items, p_metodo, uid, p_client_request_id);
  exception when unique_violation then
    -- Otro envío con el mismo id se cobró a la vez: se devuelve ese.
    select id into v_sale from public.sales where client_request_id = p_client_request_id;
    return public._pos_venta_json_sale(v_sale, true);
  end;

  if not public._pos_cuenta_pendiente(o.id) then
    update public.orders set estado = 'pagada' where id = o.id;
  end if;
  return public._pos_venta_json_sale(v_sale, false);
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Cancelar y anular con pagos parciales
-- ---------------------------------------------------------------------
-- Cancelar: lo ya cobrado no se toca. Si hubo cobros, la cuenta se cierra
-- como pagada; si no, como cancelada. No se puede si queda algo servido sin cobrar.
CREATE OR REPLACE FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := public._pos_exigir_camarero();
  o   public.orders%rowtype;
  li  public.order_items%rowtype;
  v_cobrada boolean;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  o := public._pos_cuenta_abierta(p_order_id);
  if exists (select 1 from public.order_items where order_id = o.id and estado = 'servida' and sale_id is null) then
    raise exception 'CUENTA_CON_SERVIDAS';
  end if;

  for li in
    update public.order_items set estado = 'anulada'
    where order_id = o.id and estado in ('pendiente', 'aceptada') and sale_id is null
    returning *
  loop
    perform public._pos_liberar_ticket(li, uid, trim(p_motivo));
    insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
    values (o.id, li.id, 'linea_anulada', uid, jsonb_build_object('motivo', trim(p_motivo), 'por_cancelacion', true));
  end loop;

  v_cobrada := exists (select 1 from public.sales where order_id = o.id);
  update public.orders set estado = case when v_cobrada then 'pagada' else 'cancelada' end where id = o.id;
  insert into public.pos_events (order_id, tipo, actor, detalle)
  values (o.id, 'cancelada', uid, jsonb_build_object('motivo', trim(p_motivo), 'con_cobros', v_cobrada));
end;
$$;

-- Anular: una línea ya cobrada no se anula (se devuelve desde el panel).
-- Si era lo último que faltaba de una cuenta con cobros, la cuenta se cierra.
CREATE OR REPLACE FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if li.sale_id is not null then raise exception 'LINEA_YA_PAGADA' using detail = li.nombre; end if;

  update public.order_items set estado = 'anulada' where id = li.id;
  perform public._pos_liberar_ticket(li, uid, trim(p_motivo));
  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  values (li.order_id, li.id, 'linea_anulada', uid,
          jsonb_strip_nulls(jsonb_build_object('motivo', trim(p_motivo), 'estado_anterior', li.estado, 'producto', li.nombre,
                             'cantidad', li.cantidad, 'importe_centimos', li.precio_unitario_centimos * li.cantidad,
                             'ticket', li.ticket_codigo)));

  if exists (select 1 from public.sales where order_id = li.order_id) and not public._pos_cuenta_pendiente(li.order_id) then
    update public.orders set estado = 'pagada' where id = li.order_id;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Informe: cada línea cuenta en SU venta (antes, por cuenta)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    join v on v.id = oi.sale_id
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
-- 8. Permisos explícitos
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."_pos_venta_json_sale"("p_sale_id" "uuid", "p_repetida" boolean) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_pos_venta_json_sale"("p_sale_id" "uuid", "p_repetida" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."_pos_crear_venta_lineas"("p_order" "public"."orders", "p_items" "uuid"[], "p_metodo" "text", "p_actor" "uuid", "p_client_request_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_pos_crear_venta_lineas"("p_order" "public"."orders", "p_items" "uuid"[], "p_metodo" "text", "p_actor" "uuid", "p_client_request_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."_pos_cuenta_pendiente"("p_order_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_pos_cuenta_pendiente"("p_order_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."pos_cobrar_parte"("p_order_id" "uuid", "p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_cobrar_parte"("p_order_id" "uuid", "p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") TO "authenticated";
