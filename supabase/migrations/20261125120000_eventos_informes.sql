-- =====================================================================
-- Eventos EV4 (EVENTOS.md, EV-D11): los eventos se distinguen en el cierre y en el informe.
--
-- · _resumen_caja (cierre de jornada, estado de la jornada e informe) añade «eventos»: lo cobrado en
--   cuentas de evento, por método de pago, con lo devuelto y el reparto plazos / extras. Es una parte
--   de lo cobrado (ya incluida en el total): no cambia ni el neto ni el efectivo esperado.
-- · admin_informe añade «por_evento»: cada evento con cobros en el periodo (precio, cobrado en el
--   periodo, plazos y extras, cobrado en total, devuelto, pendiente y estado).
--
-- Solo funciones, con los mismos parámetros (create or replace). Los plazos no se suman a ningún
-- producto (no tienen product_id): el informe sigue cuadrando como antes.
-- =====================================================================

CREATE OR REPLACE FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with v as (
    select s.* from public.sales s where s.jornada between p_desde and p_hasta
  ),
  d as (
    select r.importe_centimos, s.metodo, s.order_id
    from public.sale_refunds r
    join public.sales s on s.id = r.sale_id
    where public._jornada_fecha(r.at) between p_desde and p_hasta
  ),
  a as (
    select e.* from public.pos_events e
    where e.tipo = 'linea_anulada' and e.detalle ? 'estado_anterior'
      and public._jornada_fecha(e.at) between p_desde and p_hasta
  ),
  -- Eventos: ventas y devoluciones de cuentas de evento, y sus líneas cobradas.
  ve as (
    select v.* from v join public.orders o on o.id = v.order_id where o.origen = 'evento'
  ),
  de as (
    select d.* from d join public.orders o on o.id = d.order_id where o.origen = 'evento'
  ),
  le as (
    select oi.tipo_linea, oi.cantidad * oi.precio_unitario_centimos as importe
    from public.order_items oi join ve on ve.id = oi.sale_id
    where oi.estado in ('aceptada', 'servida')
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
    'ultima_venta_at', (select max(cobrado_at) from v),
    'eventos', jsonb_build_object(
      'ventas', (select count(*) from ve),
      'cobrado_centimos', (select coalesce(sum(total_centimos), 0) from ve),
      'devuelto_centimos', (select coalesce(sum(importe_centimos), 0) from de),
      'neto_centimos', (select coalesce(sum(total_centimos), 0) from ve) - (select coalesce(sum(importe_centimos), 0) from de),
      'plazos_centimos', (select coalesce(sum(importe), 0) from le where le.tipo_linea = 'evento'),
      'extras_centimos', (select coalesce(sum(importe), 0) from le where le.tipo_linea <> 'evento'),
      'por_metodo', (
        select jsonb_object_agg(m.metodo, jsonb_build_object(
          'ventas', (select count(*) from ve where ve.metodo = m.metodo),
          'cobrado_centimos', (select coalesce(sum(total_centimos), 0) from ve where ve.metodo = m.metodo),
          'devuelto_centimos', (select coalesce(sum(importe_centimos), 0) from de where de.metodo = m.metodo),
          'neto_centimos', (select coalesce(sum(total_centimos), 0) from ve where ve.metodo = m.metodo)
                         - (select coalesce(sum(importe_centimos), 0) from de where de.metodo = m.metodo)
        ))
        from metodos m
      )
    )
  );
$$;


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
    -- EV4: cada evento con cobros en el periodo.
    'por_evento', coalesce((
      select jsonb_agg(x order by x.fecha, x.nombre) from (
        select e.id, e.nombre, e.fecha, e.estado, e.precio_centimos,
               (select count(*) from v where v.order_id = e.order_id)::integer as ventas,
               (select coalesce(sum(v.total_centimos), 0) from v where v.order_id = e.order_id)::integer as cobrado_periodo_centimos,
               (select coalesce(sum(l.cantidad * l.precio_unitario_centimos), 0) from l
                 where l.order_id = e.order_id and l.tipo_linea = 'evento')::integer as plazos_periodo_centimos,
               (select coalesce(sum(l.cantidad * l.precio_unitario_centimos), 0) from l
                 where l.order_id = e.order_id and l.tipo_linea <> 'evento')::integer as extras_periodo_centimos,
               (select coalesce(sum(s.total_centimos), 0) from public.sales s where s.order_id = e.order_id)::integer as cobrado_total_centimos,
               (select coalesce(sum(r.importe_centimos), 0) from public.sale_refunds r
                 join public.sales s on s.id = r.sale_id where s.order_id = e.order_id)::integer as devuelto_total_centimos,
               (select coalesce(sum(oi.cantidad * oi.precio_unitario_centimos), 0) from public.order_items oi
                 where oi.order_id = e.order_id and oi.estado in ('aceptada', 'servida') and oi.sale_id is null)::integer as pendiente_centimos
        from public.eventos e
        where e.order_id in (select v.order_id from v)
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
-- Permisos explícitos (ENTORNOS.md: cada migración revoca lo que Supabase da por defecto)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") TO "service_role";
REVOKE ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") TO "service_role";
