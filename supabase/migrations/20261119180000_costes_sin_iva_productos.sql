-- =====================================================================
--  Rentabilidad R3b (decisión del equipo, 2026-11-19; RENTABILIDAD.md)
--
--  1. Sin IVA: el % de ganancia se calcula con el precio TAL CUAL, como en
--     el Excel: (precio − coste) / precio. La columna iva_defecto_pct de
--     app_settings queda sin usar hasta la fase R6 (IVA).
--  2. admin_importar_productos(): importa las hojas «Coste_Unitario» (recetas)
--     y «Precio_venta» (precios) juntas. Cada producto del Excel se empareja
--     con uno de la carta o se CREA nuevo (sin salir en la carta). Los precios
--     del Excel corrigen los de la carta (salvo los que se desmarquen).
--     Sustituye a admin_importar_recetas().
--  Todo solo para admins.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cálculo sin IVA
-- ---------------------------------------------------------------------
-- % de ganancia sobre el precio (redondeado a 1 decimal) y etiqueta con la escala de ajustes.
CREATE OR REPLACE FUNCTION "public"."_margen"("p_precio_centimos" integer, "p_coste" numeric,
                                             OUT "precio" numeric, OUT "margen_pct" numeric,
                                             OUT "ganancia" numeric, OUT "etiqueta" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_precio_centimos is null or p_precio_centimos <= 0 then
    etiqueta := case when p_coste is null then 'sin_coste' else 'sin_precio' end;
    return;
  end if;
  precio := p_precio_centimos / 100.0;
  if p_coste is null then
    etiqueta := 'sin_coste';
    return;
  end if;
  ganancia := round(precio - p_coste, 4);
  margen_pct := round((precio - p_coste) / precio * 100, 1);
  etiqueta := public._etiqueta_de_margen(margen_pct);
end;
$$;

DROP FUNCTION IF EXISTS "public"."rentabilidad_productos"();
CREATE FUNCTION "public"."rentabilidad_productos"() RETURNS TABLE(
    "product_id" integer, "nombre" "text", "categoria_id" "text", "categoria" "text", "categoria_orden" integer,
    "orden" integer, "activo" boolean, "precio_centimos" integer, "lineas" integer, "coste" numeric,
    "margen_pct" numeric, "ganancia" numeric, "etiqueta" "text",
    "vendidos_30d" integer, "ganancia_30d" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  return query
  with costes as (
    select p.id, (select count(*)::integer from public.recetas r where r.product_id = p.id) as lineas,
           public._coste_producto(p.id) as coste
    from public.products p
  ),
  vendidos as (
    select oi.product_id, sum(oi.cantidad)::integer as unidades
    from public.order_items oi
    join public.sales s on s.id = oi.sale_id
    where oi.product_id is not null and oi.estado in ('aceptada', 'servida') and s.cobrado_at >= now() - interval '30 days'
    group by oi.product_id
  )
  select p.id, p.nombre, p.categoria_id, c.nombre, c.orden, p.orden, p.activo, p.precio_centimos,
         k.lineas, k.coste, m.margen_pct, m.ganancia, m.etiqueta,
         coalesce(v.unidades, 0), case when m.ganancia is null then null else round(m.ganancia * coalesce(v.unidades, 0), 2) end
  from public.products p
  join costes k on k.id = p.id
  left join public.menu_categories c on c.id = p.categoria_id
  left join vendidos v on v.product_id = p.id
  cross join lateral public._margen(p.precio_centimos, k.coste) m
  order by c.orden nulls last, p.orden, p.id;
end;
$$;

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
  cross join lateral public._margen(b.precio_centimos, b.coste_promo) m
  order by b.orden, b.nombre;
end;
$$;

-- Resumen de lo vendido: igual que antes, pero con los precios tal cual (sin quitar IVA).
CREATE OR REPLACE FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_out jsonb;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 400 then raise exception 'PERIODO_INVALIDO'; end if;

  with lineas as (
    select oi.product_id, oi.promo_id, oi.cantidad,
           oi.precio_unitario_centimos * oi.cantidad / 100.0 as venta,
           case when oi.product_id is not null then public._coste_producto(oi.product_id)
                else public._coste_promo(oi.promo_id) end * oi.cantidad as coste
    from public.order_items oi
    join public.sales s on s.id = oi.sale_id
    where s.jornada between p_desde and p_hasta and oi.estado in ('aceptada', 'servida')
  ),
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
  ing as (
    select h.insumo_id, i.nombre, i.unidad_base, h.vigente_desde, h.coste_unitario as despues,
           lag(h.coste_unitario) over (partition by h.insumo_id order by h.vigente_desde, h.id) as antes
    from public.insumo_precios h
    join public.insumos i on i.id = h.insumo_id
  ),
  car as (
    select h.product_id, pr.nombre, h.desde, h.precio_centimos as despues,
           lag(h.precio_centimos) over (partition by h.product_id order by h.desde, h.id) as antes
    from public.producto_precios h
    join public.products pr on pr.id = h.product_id
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'totales', (
      select jsonb_build_object(
        'ventas', round(t.venta, 2), 'ventas_con_coste', round(t.venta_cc, 2), 'coste', round(t.coste, 2),
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
        'ventas', round(c.venta, 2),
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
        'unidades', d.unidades, 'ventas', round(d.venta, 2),
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
-- 2. Importar productos: recetas («Coste_Unitario») + precios («Precio_venta»)
--    p_filas:   [{"fila", "producto", "insumo", "cantidad", "medida"}, …]            (recetas)
--    p_precios: [{"fila", "producto", "precio": 2.5, "coste": 0.66}, …]             (euros, tal cual)
--    p_emparejamientos: [{"producto": "Caña_Estrella", "product_ids": [15], "precio": true}
--                        | {"producto": "Nuevo", "nuevo": {"nombre": "…", "categoria_id": "…"}}, …]
--      product_ids [] = no está en la carta · "precio": false = no corregir el precio de la carta.
--    Con un solo error no se aplica nada.
-- ---------------------------------------------------------------------
ALTER TABLE "public"."costes_importaciones" DROP CONSTRAINT IF EXISTS "costes_importaciones_tipo_check";
ALTER TABLE "public"."costes_importaciones" ADD CONSTRAINT "costes_importaciones_tipo_check" CHECK ("tipo" IN ('insumos', 'recetas', 'productos'));

CREATE OR REPLACE FUNCTION "public"."admin_importar_productos"("p_archivo" "text", "p_filas" "jsonb", "p_precios" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  rec       record;
  x         jsonb;
  e         jsonb;
  t         jsonb;
  v_fila    integer;
  v_prod    text;
  v_clave   text;
  v_ins_txt text;
  v_med     text;
  v_cant    numeric;
  v_base    text;
  v_factor  numeric;
  v_motivo  text;
  v_pid     integer;
  v_otro    text;
  v_precio  numeric;
  v_coste_x numeric;
  ins       public.insumos%rowtype;
  p         public.products%rowtype;
  m         record;
  lineas    jsonb := '{}'::jsonb;   -- clave → [{insumo_id, insumo, cantidad, unidad, coste_unitario}]
  precios   jsonb := '{}'::jsonb;   -- clave → {precio_centimos, coste_excel, fila}
  nombres   jsonb := '{}'::jsonb;   -- clave → nombre tal cual en el Excel
  destinos  jsonb := '{}'::jsonb;   -- clave → [{"product_id": 15} | {"nuevo": {...}}]
  corregir  jsonb := '{}'::jsonb;   -- clave → true/false (corregir el precio con el del Excel)
  asignado  jsonb := '{}'::jsonb;   -- product_id → clave
  nuevos_n  jsonb := '{}'::jsonb;   -- nombre de producto nuevo (minúsculas) → clave
  errores   jsonb := '[]'::jsonb;
  productos jsonb := '[]'::jsonb;
  sin_carta jsonb := '[]'::jsonb;
  v_actual  jsonb;
  v_nuevo   jsonb;
  v_estado  text;
  v_coste   numeric;
  v_precio_carta integer;
  v_precio_final integer;
  v_cambia  boolean;
  v_aplicar jsonb := '[]'::jsonb;
  v_informe jsonb;
  v_imp     uuid;
  v_mermas  jsonb;
  v_nombre_n text;
  v_cat     text;
  v_creados integer := 0;
  v_precios_c integer := 0;
  v_recetas_c integer := 0;
  v_ids     jsonb := '{}'::jsonb;   -- clave de producto nuevo → id creado
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  if (p_filas is null or jsonb_typeof(p_filas) <> 'array') or (p_precios is null or jsonb_typeof(p_precios) <> 'array')
     or jsonb_array_length(p_filas) + jsonb_array_length(p_precios) = 0 then
    raise exception 'IMPORTACION_VACIA';
  end if;
  if jsonb_array_length(p_filas) > 2000 or jsonb_array_length(p_precios) > 2000 then raise exception 'IMPORTACION_DEMASIADO_GRANDE'; end if;
  if p_emparejamientos is null or jsonb_typeof(p_emparejamientos) <> 'array' or jsonb_array_length(p_emparejamientos) > 1000 then
    raise exception 'EMPAREJAMIENTOS_INVALIDOS';
  end if;
  if p_confirmar then
    lock table public.recetas in share row exclusive mode;
    lock table public.products in share row exclusive mode;
  end if;

  -- 1. Recetas
  for rec in select value as v, ordinality as n from jsonb_array_elements(p_filas) with ordinality loop
    x := rec.v;
    v_motivo := null;
    v_fila := case when jsonb_typeof(x -> 'fila') = 'number' then (x ->> 'fila')::numeric::integer else rec.n::integer end;
    v_prod := btrim(regexp_replace(coalesce(x ->> 'producto', ''), '\s+', ' ', 'g'));
    v_clave := lower(v_prod);
    v_ins_txt := btrim(regexp_replace(coalesce(x ->> 'insumo', ''), '\s+', ' ', 'g'));
    v_med := lower(btrim(coalesce(x ->> 'medida', '')));
    v_cant := case when jsonb_typeof(x -> 'cantidad') = 'number' then (x ->> 'cantidad')::numeric end;
    v_base := null;
    v_factor := null;
    select u.base, u.factor into v_base, v_factor
    from (values ('ml','ml',1), ('cl','ml',10), ('l','ml',1000), ('g','g',1), ('gr','g',1), ('kg','g',1000),
                 ('ud','ud',1), ('und','ud',1), ('unidad','ud',1), ('unidades','ud',1)) as u(txt, base, factor)
    where u.txt = rtrim(v_med, '.');
    ins := null;
    if v_ins_txt <> '' then
      select * into ins from public.insumos where lower(btrim(nombre)) = lower(v_ins_txt);
    end if;

    if v_prod = '' then v_motivo := 'Falta el producto';
    elsif length(v_prod) > 120 then v_motivo := 'Nombre de producto demasiado largo';
    elsif v_ins_txt = '' then v_motivo := 'Falta la materia prima';
    elsif ins.id is null then v_motivo := format('No existe el ingrediente «%s» (impórtalo antes en Ingredientes)', v_ins_txt);
    elsif v_cant is null or v_cant <= 0 or v_cant >= 1000000 then v_motivo := 'Cantidad no válida';
    elsif v_base is null then v_motivo := format('Medida desconocida «%s»', coalesce(x ->> 'medida', ''));
    elsif v_base <> ins.unidad_base then v_motivo := format('Medida en %s, pero «%s» va en %s', v_base, ins.nombre, ins.unidad_base);
    elsif lineas ? v_clave and exists (select 1 from jsonb_array_elements(lineas -> v_clave) l where (l ->> 'insumo_id')::integer = ins.id) then
      v_motivo := format('«%s» aparece dos veces en la receta', ins.nombre);
    end if;

    if v_prod <> '' and not nombres ? v_clave then nombres := nombres || jsonb_build_object(v_clave, v_prod); end if;
    if v_motivo is not null then
      errores := errores || jsonb_build_object('fila', v_fila, 'hoja', 'Coste_Unitario', 'producto', nullif(v_prod, ''), 'motivo', v_motivo);
      continue;
    end if;
    lineas := jsonb_set(lineas, array[v_clave], coalesce(lineas -> v_clave, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'insumo_id', ins.id, 'insumo', ins.nombre, 'cantidad', round(v_cant * v_factor, 3), 'unidad', ins.unidad_base,
      'coste_unitario', ins.coste_unitario)));
  end loop;

  -- 2. Precios
  for rec in select value as v, ordinality as n from jsonb_array_elements(p_precios) with ordinality loop
    x := rec.v;
    v_fila := case when jsonb_typeof(x -> 'fila') = 'number' then (x ->> 'fila')::numeric::integer else rec.n::integer end;
    v_prod := btrim(regexp_replace(coalesce(x ->> 'producto', ''), '\s+', ' ', 'g'));
    v_clave := lower(v_prod);
    v_precio := case when jsonb_typeof(x -> 'precio') = 'number' then (x ->> 'precio')::numeric end;
    v_coste_x := case when jsonb_typeof(x -> 'coste') = 'number' then (x ->> 'coste')::numeric end;
    v_motivo := case
      when v_prod = '' then 'Falta el producto'
      when length(v_prod) > 120 then 'Nombre de producto demasiado largo'
      when v_precio is null or v_precio < 0 or v_precio >= 100000 then 'Precio no válido'
      when precios ? v_clave then 'Producto repetido en «Precio_venta»' end;
    if v_prod <> '' and not nombres ? v_clave then nombres := nombres || jsonb_build_object(v_clave, v_prod); end if;
    if v_motivo is not null then
      errores := errores || jsonb_build_object('fila', v_fila, 'hoja', 'Precio_venta', 'producto', nullif(v_prod, ''), 'motivo', v_motivo);
      continue;
    end if;
    precios := precios || jsonb_build_object(v_clave, jsonb_build_object(
      'precio_centimos', round(v_precio * 100)::integer, 'coste_excel', v_coste_x, 'fila', v_fila));
  end loop;

  -- 3. Emparejamientos (producto de la carta, nuevo o «no está en la carta»)
  for e in select value from jsonb_array_elements(p_emparejamientos) loop
    v_clave := lower(btrim(regexp_replace(coalesce(e ->> 'producto', ''), '\s+', ' ', 'g')));
    if v_clave = '' then
      errores := errores || jsonb_build_object('fila', null, 'producto', null, 'motivo', 'Emparejamiento no válido');
      continue;
    end if;
    corregir := corregir || jsonb_build_object(v_clave, coalesce((e ->> 'precio')::boolean, true));
    t := '[]'::jsonb;
    if jsonb_typeof(e -> 'nuevo') = 'object' then
      v_nombre_n := btrim(regexp_replace(coalesce(e -> 'nuevo' ->> 'nombre', ''), '\s+', ' ', 'g'));
      v_cat := e -> 'nuevo' ->> 'categoria_id';
      if v_nombre_n = '' or length(v_nombre_n) > 120 then
        errores := errores || jsonb_build_object('fila', null, 'producto', coalesce(nombres ->> v_clave, v_clave), 'motivo', 'Escribe el nombre del producto nuevo');
      elsif v_cat is null or not exists (select 1 from public.menu_categories where id = v_cat) then
        errores := errores || jsonb_build_object('fila', null, 'producto', coalesce(nombres ->> v_clave, v_clave), 'motivo', 'Elige la categoría del producto nuevo');
      elsif exists (select 1 from public.products where lower(btrim(nombre)) = lower(v_nombre_n)) then
        errores := errores || jsonb_build_object('fila', null, 'producto', coalesce(nombres ->> v_clave, v_clave),
          'motivo', format('«%s» ya existe en la carta: emparéjalo en vez de crearlo', v_nombre_n));
      elsif nuevos_n ? lower(v_nombre_n) then
        errores := errores || jsonb_build_object('fila', null, 'producto', coalesce(nombres ->> v_clave, v_clave),
          'motivo', format('Dos productos nuevos con el mismo nombre «%s»', v_nombre_n));
      else
        nuevos_n := nuevos_n || jsonb_build_object(lower(v_nombre_n), v_clave);
        t := jsonb_build_array(jsonb_build_object('nuevo', jsonb_build_object('nombre', v_nombre_n, 'categoria_id', v_cat)));
      end if;
    elsif jsonb_typeof(e -> 'product_ids') = 'array' then
      for x in select value from jsonb_array_elements(e -> 'product_ids') loop
        v_pid := case when jsonb_typeof(x) = 'number' then x::text::numeric::integer end;
        if v_pid is null or not exists (select 1 from public.products where id = v_pid) then
          errores := errores || jsonb_build_object('fila', null, 'producto', coalesce(nombres ->> v_clave, v_clave), 'motivo', 'El producto de la carta elegido no existe');
          continue;
        end if;
        if asignado ? v_pid::text and asignado ->> v_pid::text <> v_clave then
          select pr.nombre into v_otro from public.products pr where pr.id = v_pid;
          errores := errores || jsonb_build_object('fila', null, 'producto', coalesce(nombres ->> v_clave, v_clave),
            'motivo', format('«%s» de la carta ya está asignado a «%s»', v_otro, coalesce(nombres ->> (asignado ->> v_pid::text), asignado ->> v_pid::text)));
          continue;
        end if;
        asignado := asignado || jsonb_build_object(v_pid::text, v_clave);
        if not t @> jsonb_build_array(jsonb_build_object('product_id', v_pid)) then
          t := t || jsonb_build_array(jsonb_build_object('product_id', v_pid));
        end if;
      end loop;
    else
      errores := errores || jsonb_build_object('fila', null, 'producto', coalesce(nombres ->> v_clave, v_clave), 'motivo', 'Emparejamiento no válido');
      continue;
    end if;
    destinos := destinos || jsonb_build_object(v_clave, t);
  end loop;

  for v_clave in select jsonb_object_keys(nombres) loop
    if not destinos ? v_clave then
      if not exists (select 1 from jsonb_array_elements(errores) er where er ->> 'producto' = nombres ->> v_clave and er ->> 'fila' is null) then
        errores := errores || jsonb_build_object('fila', null, 'producto', nombres ->> v_clave, 'motivo', 'Sin emparejar con la carta');
      end if;
    elsif jsonb_array_length(destinos -> v_clave) = 0 then
      sin_carta := sin_carta || to_jsonb(nombres ->> v_clave);
    end if;
  end loop;

  -- 4. Resultado por producto de la carta (o nuevo)
  for v_clave in select jsonb_object_keys(destinos) loop
    v_nuevo := case when lineas ? v_clave
                    then (select jsonb_agg(l order by l ->> 'insumo') from jsonb_array_elements(lineas -> v_clave) l) end;
    for t in select value from jsonb_array_elements(destinos -> v_clave) loop
      if t ? 'nuevo' then
        v_pid := null;
        v_precio_carta := null;
        v_actual := '[]'::jsonb;
        v_mermas := '{}'::jsonb;
      else
        v_pid := (t ->> 'product_id')::integer;
        select * into p from public.products where id = v_pid;
        v_precio_carta := p.precio_centimos;
        v_actual := (select coalesce(jsonb_agg(jsonb_build_object('insumo_id', r.insumo_id, 'cantidad', r.cantidad) order by r.insumo_id), '[]'::jsonb)
                     from public.recetas r where r.product_id = v_pid);
        v_mermas := (select coalesce(jsonb_object_agg(r.insumo_id::text, r.merma_pct), '{}'::jsonb) from public.recetas r where r.product_id = v_pid);
      end if;

      v_estado := case
        when v_nuevo is null then 'no_viene'
        when jsonb_array_length(v_actual) = 0 then 'nueva'
        when v_actual = (select jsonb_agg(jsonb_build_object('insumo_id', (l ->> 'insumo_id')::integer, 'cantidad', (l ->> 'cantidad')::numeric)
                                          order by (l ->> 'insumo_id')::integer) from jsonb_array_elements(v_nuevo) l) then 'igual'
        else 'cambia' end;
      v_coste := case
        when v_nuevo is not null then (select round(sum((l ->> 'cantidad')::numeric * (l ->> 'coste_unitario')::numeric
                                                        / (1 - coalesce((v_mermas ->> (l ->> 'insumo_id'))::numeric, 0) / 100)), 6)
                                       from jsonb_array_elements(v_nuevo) l)
        when v_pid is not null then public._coste_producto(v_pid) end;

      v_cambia := precios ? v_clave and (t ? 'nuevo' or (corregir ->> v_clave)::boolean)
                  and ((precios -> v_clave ->> 'precio_centimos')::integer is distinct from v_precio_carta);
      v_precio_final := case when v_cambia then (precios -> v_clave ->> 'precio_centimos')::integer else v_precio_carta end;
      v_coste_x := (precios -> v_clave ->> 'coste_excel')::numeric;
      select * into m from public._margen(v_precio_final, v_coste);

      productos := productos || jsonb_build_object(
        'product_id', v_pid, 'nuevo', t ? 'nuevo',
        'nombre', coalesce(t -> 'nuevo' ->> 'nombre', p.nombre), 'categoria_id', coalesce(t -> 'nuevo' ->> 'categoria_id', p.categoria_id),
        'producto_excel', nombres ->> v_clave, 'estado_receta', v_estado,
        'precio_carta', v_precio_carta, 'precio_excel', (precios -> v_clave ->> 'precio_centimos')::integer,
        'cambia_precio', v_cambia, 'precio_centimos', v_precio_final,
        'coste', v_coste, 'coste_excel', v_coste_x,
        'aviso_coste', v_coste is not null and v_coste_x is not null and abs(v_coste - v_coste_x) > 0.01,
        'margen_pct', m.margen_pct, 'ganancia', m.ganancia, 'etiqueta', m.etiqueta,
        'lineas', (select jsonb_agg(l - 'coste_unitario') from jsonb_array_elements(coalesce(v_nuevo, '[]'::jsonb)) l));
      if t ? 'nuevo' or v_estado in ('nueva', 'cambia') or v_cambia then
        v_aplicar := v_aplicar || jsonb_build_object('clave', v_clave, 'destino', t, 'lineas', v_nuevo, 'estado', v_estado,
                                                     'cambia', v_cambia, 'precio', v_precio_final, 'mermas', v_mermas);
      end if;
      p := null;
    end loop;
  end loop;

  v_informe := jsonb_build_object(
    'total_filas', jsonb_array_length(p_filas), 'total_precios', jsonb_array_length(p_precios),
    'productos', coalesce((select jsonb_agg(pr.value order by (pr.value ->> 'nuevo')::boolean desc, pr.value ->> 'nombre') from jsonb_array_elements(productos) pr), '[]'::jsonb),
    'sin_carta', sin_carta,
    'errores', errores);
  if not p_confirmar or jsonb_array_length(errores) > 0 then
    return v_informe || jsonb_build_object('aplicada', false);
  end if;

  -- 5. Aplicar
  for x in select value from jsonb_array_elements(v_aplicar) loop
    t := x -> 'destino';
    if t ? 'nuevo' then
      insert into public.products (categoria_id, nombre, precio_centimos, activo, disponible, orden)
      values (t -> 'nuevo' ->> 'categoria_id', t -> 'nuevo' ->> 'nombre', (x ->> 'precio')::integer, false, true,
              coalesce((select max(orden) from public.products where categoria_id = t -> 'nuevo' ->> 'categoria_id'), 0) + 10)
      returning id into v_pid;
      v_ids := v_ids || jsonb_build_object(x ->> 'clave', v_pid);
      v_creados := v_creados + 1;
    else
      v_pid := (t ->> 'product_id')::integer;
      if (x ->> 'cambia')::boolean then
        update public.products set precio_centimos = (x ->> 'precio')::integer where id = v_pid;
        v_precios_c := v_precios_c + 1;
      end if;
    end if;
    if x -> 'lineas' is not null and jsonb_typeof(x -> 'lineas') = 'array' and (t ? 'nuevo' or x ->> 'estado' in ('nueva', 'cambia')) then
      delete from public.recetas where product_id = v_pid;
      insert into public.recetas (product_id, insumo_id, cantidad, merma_pct, updated_by)
      select v_pid, (l ->> 'insumo_id')::integer, (l ->> 'cantidad')::numeric,
             coalesce((x -> 'mermas' ->> (l ->> 'insumo_id'))::numeric, 0), auth.uid()
      from jsonb_array_elements(x -> 'lineas') l;
      v_recetas_c := v_recetas_c + 1;
    end if;
  end loop;

  -- Emparejamientos: los nuevos quedan unidos al producto recién creado.
  insert into public.costes_emparejamientos (nombre_excel, product_ids, updated_at, updated_by)
  select k,
         case when v_ids ? k then array[(v_ids ->> k)::integer]
              else array(select (d ->> 'product_id')::integer from jsonb_array_elements(destinos -> k) d where d ? 'product_id') end,
         now(), auth.uid()
  from jsonb_object_keys(destinos) k
  on conflict (nombre_excel) do update set product_ids = excluded.product_ids, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  insert into public.costes_importaciones (tipo, nombre_archivo, filas, informe, creada_por)
  values ('productos', left(nullif(btrim(coalesce(p_archivo, '')), ''), 200),
          jsonb_build_object('recetas', p_filas, 'precios', p_precios, 'emparejamientos', p_emparejamientos), v_informe, auth.uid())
  returning id into v_imp;

  return v_informe || jsonb_build_object('aplicada', true, 'importacion_id', v_imp,
    'productos_creados', v_creados, 'precios_corregidos', v_precios_c, 'recetas_cambiadas', v_recetas_c);
end;
$$;

-- Lo que ya no se usa
DROP FUNCTION IF EXISTS "public"."admin_importar_recetas"("p_archivo" "text", "p_filas" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean);
DROP FUNCTION IF EXISTS "public"."_margen_etiqueta"("p_precio_centimos" integer, "p_coste" numeric);


-- ---------------------------------------------------------------------
-- 3. Permisos explícitos (regla de ENTORNOS.md)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."_margen"("p_precio_centimos" integer, "p_coste" numeric) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_margen"("p_precio_centimos" integer, "p_coste" numeric) TO "service_role";
REVOKE ALL ON FUNCTION "public"."rentabilidad_productos"() FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."rentabilidad_productos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rentabilidad_productos"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."rentabilidad_promos"() FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."rentabilidad_promos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rentabilidad_promos"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") TO "service_role";
REVOKE ALL ON FUNCTION "public"."admin_importar_productos"("p_archivo" "text", "p_filas" "jsonb", "p_precios" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_importar_productos"("p_archivo" "text", "p_filas" "jsonb", "p_precios" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_importar_productos"("p_archivo" "text", "p_filas" "jsonb", "p_precios" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) TO "service_role";
