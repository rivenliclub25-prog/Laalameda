-- =====================================================================
--  Rentabilidad R3: margen de las promos y resumen de lo vendido
--  (RENTABILIDAD.md, secciones 9 y 10). Solo funciones, sin tablas nuevas.
--
--  - _coste_promo(): coste de una promo con los productos que incluye.
--  - rentabilidad_promos(): precio normal, descuento real, coste, margen,
--    etiqueta y aviso si el descuento anunciado no cuadra.
--  - rentabilidad_resumen(desde, hasta): lo vendido en esas jornadas con el
--    coste de HOY (el coste del día de cada venta es R4): margen medio
--    ponderado, por categoría, por producto, ingredientes y precios que han
--    cambiado. Las devoluciones van aparte (son por venta, no por producto).
--  Todo solo para admins.
-- =====================================================================

-- Etiqueta de un margen ya calculado (misma escala que _margen_etiqueta).
CREATE OR REPLACE FUNCTION "public"."_etiqueta_de_margen"("p_margen" numeric) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when p_margen is null then 'sin_coste'
    when p_margen < coalesce(s.escala_bueno_pct, 60) then 'bajo'
    when p_margen < coalesce(s.escala_muy_bueno_pct, 70) then 'bueno'
    when p_margen < coalesce(s.escala_excelente_pct, 80) then 'muy_bueno'
    else 'excelente' end
  from (select 1) uno
  left join public.app_settings s on true;
$$;

-- Coste de una promo: Σ coste de cada producto × cantidad. null si no tiene productos
-- o alguno no tiene receta.
CREATE OR REPLACE FUNCTION "public"."_coste_promo"("p_promo_id" "text") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with c as (
    select pi.cantidad, public._coste_producto(pi.product_id) as coste
    from public.promotion_items pi
    where pi.promo_id = p_promo_id
  )
  select case when count(*) = 0 or bool_or(c.coste is null) then null
              else round(sum(c.cantidad * c.coste), 6) end
  from c;
$$;


-- ---------------------------------------------------------------------
-- Promos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."rentabilidad_promos"() RETURNS TABLE(
    "promo_id" "text", "nombre" "text", "tipo" "text", "publicada" boolean, "activa" boolean,
    "precio_centimos" integer, "descuento_anunciado_pct" integer, "productos" integer, "sin_receta" "text"[],
    "precio_normal_centimos" integer, "descuento_real_pct" numeric, "aviso_descuento" boolean,
    "coste" numeric, "margen_pct" numeric, "ganancia" numeric, "etiqueta" "text",
    "vendidas_30d" integer, "ganancia_30d" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  return query
  with items as (
    select pi.promo_id,
           count(*)::integer as n,
           array_agg(pr.nombre order by pr.nombre) filter (where public._coste_producto(pi.product_id) is null) as sin_receta,
           case when bool_or(pr.precio_centimos is null) then null
                else sum(pr.precio_centimos * pi.cantidad)::integer end as normal
    from public.promotion_items pi
    join public.products pr on pr.id = pi.product_id
    group by pi.promo_id
  ),
  vendidas as (
    select oi.promo_id, sum(oi.cantidad)::integer as unidades
    from public.order_items oi
    join public.sales s on s.id = oi.sale_id
    where oi.promo_id is not null and oi.estado in ('aceptada', 'servida') and s.cobrado_at >= now() - interval '30 days'
    group by oi.promo_id
  ),
  base as (
    select p.*, i.n, i.sin_receta, i.normal, public._coste_promo(p.id) as coste_promo,
           case when i.normal > 0 and p.precio_centimos is not null
                then round((1 - p.precio_centimos::numeric / i.normal) * 100, 1) end as real_pct
    from public.promotions p
    left join items i on i.promo_id = p.id
  )
  select b.id, b.nombre, b.tipo, b.publicada, b.activa, b.precio_centimos, b.descuento_pct,
         coalesce(b.n, 0), coalesce(b.sin_receta, '{}'::text[]), b.normal, b.real_pct,
         (b.descuento_pct is not null and b.real_pct is not null and abs(b.descuento_pct - b.real_pct) > 2),
         b.coste_promo, m.margen_pct, m.ganancia, m.etiqueta,
         coalesce(v.unidades, 0), case when m.ganancia is null then null else round(m.ganancia * coalesce(v.unidades, 0), 2) end
  from base b
  left join vendidas v on v.promo_id = b.id
  cross join lateral public._margen_etiqueta(b.precio_centimos, b.coste_promo) m
  order by b.orden, b.nombre;
end;
$$;


-- ---------------------------------------------------------------------
-- Resumen de lo vendido en unas jornadas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_iva numeric;
  v_out jsonb;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 400 then raise exception 'PERIODO_INVALIDO'; end if;
  select coalesce((select iva_defecto_pct from public.app_settings limit 1), 10) into v_iva;

  with lineas as (
    select oi.product_id, oi.promo_id, oi.cantidad,
           oi.precio_unitario_centimos * oi.cantidad / 100.0 / (1 + v_iva / 100) as venta,
           case when oi.product_id is not null then public._coste_producto(oi.product_id)
                else public._coste_promo(oi.promo_id) end * oi.cantidad as coste
    from public.order_items oi
    join public.sales s on s.id = oi.sale_id
    where s.jornada between p_desde and p_hasta and oi.estado in ('aceptada', 'servida')
  ),
  -- Lo que se vendió, por producto o promo
  vendido as (
    select l.product_id, l.promo_id, sum(l.cantidad)::integer as unidades, sum(l.venta) as venta,
           case when bool_or(l.coste is null) then null else sum(l.coste) end as coste
    from lineas l
    group by l.product_id, l.promo_id
  ),
  detalle as (
    select v.*,
           case when v.product_id is not null then 'producto' else 'promo' end as clase,
           coalesce(pr.nombre, po.nombre, '¿?') as nombre,
           case when v.product_id is not null then coalesce(pr.categoria_id, '¿?') else 'promos' end as cat_id,
           case when v.product_id is not null then coalesce(c.nombre, pr.categoria_id) else 'Promos' end as cat_nombre,
           case when v.product_id is not null then coalesce(c.orden, 999) else 1000 end as cat_orden
    from vendido v
    left join public.products pr on pr.id = v.product_id
    left join public.menu_categories c on c.id = pr.categoria_id
    left join public.promotions po on po.id = v.promo_id
  ),
  tot as (
    select coalesce(sum(venta), 0) as venta,
           coalesce(sum(venta) filter (where coste is not null), 0) as venta_cc,
           coalesce(sum(coste), 0) as coste,
           coalesce(sum(venta) filter (where coste is null), 0) as venta_sc,
           coalesce(sum(unidades), 0)::integer as unidades
    from detalle
  ),
  cats as (
    select cat_id, cat_nombre, cat_orden, sum(venta) as venta,
           sum(venta) filter (where coste is not null) as venta_cc,
           sum(coste) as coste,
           coalesce(sum(venta) filter (where coste is null), 0) as venta_sc,
           sum(unidades)::integer as unidades
    from detalle
    group by cat_id, cat_nombre, cat_orden
  ),
  -- Cambios de precio de ingredientes en el periodo (respecto al anterior)
  ing as (
    select h.insumo_id, i.nombre, i.unidad_base, h.vigente_desde, h.coste_unitario as despues,
           lag(h.coste_unitario) over (partition by h.insumo_id order by h.vigente_desde, h.id) as antes
    from public.insumo_precios h
    join public.insumos i on i.id = h.insumo_id
  ),
  -- Cambios de precio de la carta en el periodo (respecto al anterior)
  car as (
    select h.product_id, pr.nombre, h.desde, h.precio_centimos as despues,
           lag(h.precio_centimos) over (partition by h.product_id order by h.desde, h.id) as antes
    from public.producto_precios h
    join public.products pr on pr.id = h.product_id
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'iva_pct', v_iva,
    'totales', (
      select jsonb_build_object(
        'ventas_sin_iva', round(t.venta, 2), 'ventas_con_coste', round(t.venta_cc, 2), 'coste', round(t.coste, 2),
        'ganancia', round(t.venta_cc - t.coste, 2), 'unidades', t.unidades,
        'margen_pct', case when t.venta_cc > 0 then round((t.venta_cc - t.coste) / t.venta_cc * 100, 1) end,
        'etiqueta', public._etiqueta_de_margen(case when t.venta_cc > 0 then round((t.venta_cc - t.coste) / t.venta_cc * 100, 1) end),
        'ventas_sin_coste', round(t.venta_sc, 2),
        'pct_sin_coste', case when t.venta > 0 then round(t.venta_sc / t.venta * 100, 1) end,
        'devuelto', (select coalesce(sum(r.importe_centimos), 0) / 100.0 from public.sale_refunds r
                     join public.sales s on s.id = r.sale_id where s.jornada between p_desde and p_hasta))
      from tot t),
    'por_categoria', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.cat_id, 'nombre', c.cat_nombre, 'unidades', c.unidades,
        'ventas_sin_iva', round(c.venta, 2),
        'pct_venta', case when (select venta from tot) > 0 then round(c.venta / (select venta from tot) * 100, 1) end,
        'ganancia', case when c.venta_cc is null then null else round(c.venta_cc - c.coste, 2) end,
        'margen_pct', case when c.venta_cc > 0 then round((c.venta_cc - c.coste) / c.venta_cc * 100, 1) end,
        'etiqueta', public._etiqueta_de_margen(case when c.venta_cc > 0 then round((c.venta_cc - c.coste) / c.venta_cc * 100, 1) end),
        'ventas_sin_coste', round(c.venta_sc, 2))
        order by c.cat_orden, c.cat_nombre)
      from cats c), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clase', d.clase, 'id', coalesce(d.product_id::text, d.promo_id), 'nombre', d.nombre, 'categoria', d.cat_nombre,
        'unidades', d.unidades, 'ventas_sin_iva', round(d.venta, 2),
        'ganancia', case when d.coste is null then null else round(d.venta - d.coste, 2) end,
        'margen_pct', case when d.coste is not null and d.venta > 0 then round((d.venta - d.coste) / d.venta * 100, 1) end,
        'etiqueta', case when d.coste is null then 'sin_coste' when d.venta <= 0 then 'sin_precio'
                         else public._etiqueta_de_margen(round((d.venta - d.coste) / d.venta * 100, 1)) end)
        order by d.venta desc, d.nombre)
      from detalle d), '[]'::jsonb),
    'ingredientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'insumo_id', g.insumo_id, 'nombre', g.nombre, 'unidad', g.unidad_base, 'fecha', g.vigente_desde,
        'antes', g.antes, 'despues', g.despues,
        'variacion_pct', case when g.antes > 0 then round((g.despues / g.antes - 1) * 100, 1) end,
        'productos', (select count(*) from public.recetas r where r.insumo_id = g.insumo_id))
        order by (g.despues / nullif(g.antes, 0)) desc nulls last, g.vigente_desde desc)
      from ing g
      where g.antes is not null and g.despues is distinct from g.antes
        and public._jornada_fecha(g.vigente_desde) between p_desde and p_hasta), '[]'::jsonb),
    'precios_carta', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', k.product_id, 'nombre', k.nombre, 'fecha', k.desde, 'antes', k.antes, 'despues', k.despues)
        order by k.desde desc)
      from car k
      where k.antes is distinct from k.despues and k.antes is not null
        and public._jornada_fecha(k.desde) between p_desde and p_hasta), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;


-- ---------------------------------------------------------------------
-- Permisos explícitos (regla de ENTORNOS.md)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."_etiqueta_de_margen"("p_margen" numeric) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_etiqueta_de_margen"("p_margen" numeric) TO "service_role";
REVOKE ALL ON FUNCTION "public"."_coste_promo"("p_promo_id" "text") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_coste_promo"("p_promo_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."rentabilidad_promos"() FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."rentabilidad_promos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rentabilidad_promos"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") TO "service_role";
