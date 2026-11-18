-- =====================================================================
--  Rentabilidad R2: recetas, margen y etiqueta (RENTABILIDAD.md)
--
--  - recetas: producto de la carta ↔ ingrediente (cantidad en la unidad
--    base del ingrediente, merma).
--  - costes_emparejamientos: qué producto del Excel es cada producto de
--    la carta (para no volver a emparejar al reimportar).
--  - producto_precios: histórico de precios de la carta (automático).
--  - app_settings: IVA general y cortes de la escala de etiquetas.
--  - rentabilidad_productos(): coste, margen y etiqueta calculados al
--    leer (R-D12): siempre al día, sin guardar nada en products.
--  - admin_guardar_receta() y admin_importar_recetas().
--  Todo solo para admins.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ajustes: IVA general y escala (sin IVA)
-- ---------------------------------------------------------------------
ALTER TABLE "public"."app_settings"
  ADD COLUMN IF NOT EXISTS "iva_defecto_pct" numeric(5,2) DEFAULT 10 NOT NULL,
  ADD COLUMN IF NOT EXISTS "escala_bueno_pct" numeric(5,2) DEFAULT 60 NOT NULL,
  ADD COLUMN IF NOT EXISTS "escala_muy_bueno_pct" numeric(5,2) DEFAULT 70 NOT NULL,
  ADD COLUMN IF NOT EXISTS "escala_excelente_pct" numeric(5,2) DEFAULT 80 NOT NULL;
ALTER TABLE "public"."app_settings" DROP CONSTRAINT IF EXISTS "app_settings_iva_check";
ALTER TABLE "public"."app_settings" ADD CONSTRAINT "app_settings_iva_check"
  CHECK ("iva_defecto_pct" >= 0 AND "iva_defecto_pct" <= 30);
ALTER TABLE "public"."app_settings" DROP CONSTRAINT IF EXISTS "app_settings_escala_check";
ALTER TABLE "public"."app_settings" ADD CONSTRAINT "app_settings_escala_check"
  CHECK (0 < "escala_bueno_pct" AND "escala_bueno_pct" < "escala_muy_bueno_pct"
         AND "escala_muy_bueno_pct" < "escala_excelente_pct" AND "escala_excelente_pct" < 100);


-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."recetas" (
    "product_id" integer NOT NULL REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    "insumo_id" integer NOT NULL REFERENCES "public"."insumos"("id") ON DELETE RESTRICT,
    "cantidad" numeric(12,3) NOT NULL,
    "merma_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "nota" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    PRIMARY KEY ("product_id", "insumo_id"),
    CONSTRAINT "recetas_cantidad_check" CHECK ("cantidad" > 0 AND "cantidad" < 1000000),
    CONSTRAINT "recetas_merma_check" CHECK ("merma_pct" >= 0 AND "merma_pct" < 100),
    CONSTRAINT "recetas_nota_check" CHECK ("nota" IS NULL OR length("nota") <= 200)
);
CREATE INDEX IF NOT EXISTS "recetas_insumo_idx" ON "public"."recetas" ("insumo_id");

CREATE TABLE IF NOT EXISTS "public"."costes_emparejamientos" (
    "nombre_excel" "text" PRIMARY KEY,                     -- en minúsculas y sin espacios de más
    "product_ids" integer[] DEFAULT '{}'::integer[] NOT NULL, -- vacío = no está en la carta
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "public"."producto_precios" (
    "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "product_id" integer NOT NULL REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    "precio_centimos" integer,
    "desde" timestamp with time zone DEFAULT "now"() NOT NULL,
    "por" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "producto_precios_product_idx" ON "public"."producto_precios" ("product_id", "desde" DESC);

-- Las importaciones de recetas también se registran.
ALTER TABLE "public"."costes_importaciones" DROP CONSTRAINT IF EXISTS "costes_importaciones_tipo_check";
ALTER TABLE "public"."costes_importaciones" ADD CONSTRAINT "costes_importaciones_tipo_check" CHECK ("tipo" IN ('insumos', 'recetas'));

ALTER TABLE "public"."recetas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."costes_emparejamientos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."producto_precios" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins ven las recetas" ON "public"."recetas";
CREATE POLICY "Admins ven las recetas" ON "public"."recetas" FOR SELECT TO "authenticated"
  USING (( SELECT "public"."is_admin"() AS "is_admin"));
DROP POLICY IF EXISTS "Admins ven los emparejamientos" ON "public"."costes_emparejamientos";
CREATE POLICY "Admins ven los emparejamientos" ON "public"."costes_emparejamientos" FOR SELECT TO "authenticated"
  USING (( SELECT "public"."is_admin"() AS "is_admin"));
DROP POLICY IF EXISTS "Admins ven el histórico de la carta" ON "public"."producto_precios";
CREATE POLICY "Admins ven el histórico de la carta" ON "public"."producto_precios" FOR SELECT TO "authenticated"
  USING (( SELECT "public"."is_admin"() AS "is_admin"));


-- ---------------------------------------------------------------------
-- 3. Histórico de precios de la carta (automático e inmutable)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."_producto_registrar_precio"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and new.precio_centimos is not distinct from old.precio_centimos then
    return null;
  end if;
  insert into public.producto_precios (product_id, precio_centimos, por) values (new.id, new.precio_centimos, auth.uid());
  return null;
end;
$$;

CREATE OR REPLACE TRIGGER "products_registrar_precio" AFTER INSERT OR UPDATE OF "precio_centimos" ON "public"."products"
  FOR EACH ROW EXECUTE FUNCTION "public"."_producto_registrar_precio"();

CREATE OR REPLACE FUNCTION "public"."producto_precios_inmutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception 'HISTORICO_INMUTABLE' using errcode = '42501';
  end if;
  if (new.id, new.product_id, new.precio_centimos, new.desde) is distinct from (old.id, old.product_id, old.precio_centimos, old.desde)
     or (new.por is distinct from old.por and new.por is not null) then
    raise exception 'HISTORICO_INMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

CREATE OR REPLACE TRIGGER "producto_precios_inmutable" BEFORE DELETE OR UPDATE ON "public"."producto_precios"
  FOR EACH ROW EXECUTE FUNCTION "public"."producto_precios_inmutable"();

-- Punto de partida: el precio actual de cada producto (una sola vez).
INSERT INTO "public"."producto_precios" ("product_id", "precio_centimos")
SELECT p."id", p."precio_centimos" FROM "public"."products" p
WHERE NOT EXISTS (SELECT 1 FROM "public"."producto_precios" h WHERE h."product_id" = p."id");


-- ---------------------------------------------------------------------
-- 4. Cálculo (una sola fuente)
-- ---------------------------------------------------------------------
-- Coste de un producto: Σ cantidad × coste por unidad / (1 − merma). null = sin receta.
CREATE OR REPLACE FUNCTION "public"."_coste_producto"("p_product_id" integer) RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case when count(*) = 0 then null
              else round(sum(r.cantidad * i.coste_unitario / (1 - r.merma_pct / 100)), 6) end
  from public.recetas r
  join public.insumos i on i.id = r.insumo_id
  where r.product_id = p_product_id;
$$;

-- Margen sobre el precio sin IVA (redondeado a 1 decimal) y etiqueta con la escala de ajustes.
CREATE OR REPLACE FUNCTION "public"."_margen_etiqueta"("p_precio_centimos" integer, "p_coste" numeric,
                                                      OUT "precio_sin_iva" numeric, OUT "margen_pct" numeric,
                                                      OUT "ganancia" numeric, OUT "etiqueta" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  s public.app_settings%rowtype;
begin
  select * into s from public.app_settings limit 1;
  if p_precio_centimos is null or p_precio_centimos <= 0 then
    etiqueta := case when p_coste is null then 'sin_coste' else 'sin_precio' end;
    return;
  end if;
  precio_sin_iva := round(p_precio_centimos / 100.0 / (1 + coalesce(s.iva_defecto_pct, 10) / 100), 6);
  if p_coste is null then
    etiqueta := 'sin_coste';
    return;
  end if;
  ganancia := round(precio_sin_iva - p_coste, 4);
  margen_pct := round((precio_sin_iva - p_coste) / precio_sin_iva * 100, 1);
  etiqueta := case
    when margen_pct < coalesce(s.escala_bueno_pct, 60) then 'bajo'
    when margen_pct < coalesce(s.escala_muy_bueno_pct, 70) then 'bueno'
    when margen_pct < coalesce(s.escala_excelente_pct, 80) then 'muy_bueno'
    else 'excelente' end;
end;
$$;

-- Todos los productos de la carta con su rentabilidad, calculada ahora mismo.
CREATE OR REPLACE FUNCTION "public"."rentabilidad_productos"() RETURNS TABLE(
    "product_id" integer, "nombre" "text", "categoria_id" "text", "categoria" "text", "categoria_orden" integer,
    "orden" integer, "activo" boolean, "precio_centimos" integer, "lineas" integer, "coste" numeric,
    "precio_sin_iva" numeric, "margen_pct" numeric, "ganancia" numeric, "etiqueta" "text",
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
         k.lineas, k.coste, m.precio_sin_iva, m.margen_pct, m.ganancia, m.etiqueta,
         coalesce(v.unidades, 0), case when m.ganancia is null then null else round(m.ganancia * coalesce(v.unidades, 0), 2) end
  from public.products p
  join costes k on k.id = p.id
  left join public.menu_categories c on c.id = p.categoria_id
  left join vendidos v on v.product_id = p.id
  cross join lateral public._margen_etiqueta(p.precio_centimos, k.coste) m
  order by c.orden nulls last, p.orden, p.id;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Guardar la receta de un producto (entera, de una vez)
--    p_lineas: [{"insumo_id": 7, "cantidad": 250, "merma_pct": 0, "nota": null}, …]  ([] = sin receta)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."admin_guardar_receta"("p_product_id" integer, "p_lineas" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  x       jsonb;
  v_ins   integer;
  v_cant  numeric;
  v_merma numeric;
  v_nota  text;
  vistos  integer[] := '{}';
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCTO_NO_EXISTE'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'RECETA_INVALIDA'; end if;
  if jsonb_array_length(p_lineas) > 50 then raise exception 'RECETA_DEMASIADO_LARGA'; end if;

  -- Validar todo antes de tocar nada.
  for x in select value from jsonb_array_elements(p_lineas) loop
    v_ins := case when jsonb_typeof(x -> 'insumo_id') = 'number' then (x ->> 'insumo_id')::numeric::integer end;
    v_cant := case when jsonb_typeof(x -> 'cantidad') = 'number' then (x ->> 'cantidad')::numeric end;
    v_merma := case when x -> 'merma_pct' is null or jsonb_typeof(x -> 'merma_pct') = 'null' then 0
                    when jsonb_typeof(x -> 'merma_pct') = 'number' then (x ->> 'merma_pct')::numeric end;
    v_nota := nullif(btrim(coalesce(x ->> 'nota', '')), '');
    if v_ins is null or not exists (select 1 from public.insumos where id = v_ins) then raise exception 'INSUMO_NO_EXISTE'; end if;
    if v_ins = any (vistos) then raise exception 'INSUMO_REPETIDO'; end if;
    if v_cant is null or v_cant <= 0 or v_cant >= 1000000 then raise exception 'CANTIDAD_INVALIDA'; end if;
    if v_merma is null or v_merma < 0 or v_merma >= 100 then raise exception 'MERMA_INVALIDA'; end if;
    if v_nota is not null and length(v_nota) > 200 then raise exception 'NOTA_DEMASIADO_LARGA'; end if;
    vistos := vistos || v_ins;
  end loop;

  delete from public.recetas where product_id = p_product_id;
  insert into public.recetas (product_id, insumo_id, cantidad, merma_pct, nota, updated_by)
  select p_product_id, (ln.value ->> 'insumo_id')::numeric::integer, round((ln.value ->> 'cantidad')::numeric, 3),
         coalesce(round((ln.value ->> 'merma_pct')::numeric, 2), 0), nullif(btrim(coalesce(ln.value ->> 'nota', '')), ''), auth.uid()
  from jsonb_array_elements(p_lineas) ln;
  return jsonb_array_length(p_lineas);
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Importar recetas (hoja «Coste_Unitario»): previsualizar o aplicar
--    p_filas: [{"fila": 2, "producto": "Caña_Estrella", "insumo": "Barril - Estrella Galicea",
--               "cantidad": 250, "medida": "ml"}, …]
--    p_emparejamientos: [{"producto": "Caña_Estrella", "product_ids": [15]}, …]  ([] = no está en la carta)
--    La receta del archivo sustituye a la del producto; los productos que no vienen no se tocan.
--    Con un solo error no se aplica nada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."admin_importar_recetas"("p_archivo" "text", "p_filas" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  rec       record;
  x         jsonb;
  e         jsonb;
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
  v_pids    integer[];
  ins       public.insumos%rowtype;
  p         public.products%rowtype;
  m         record;
  lineas    jsonb := '{}'::jsonb;   -- clave → [{insumo_id, insumo, cantidad, unidad}]
  nombres   jsonb := '{}'::jsonb;   -- clave → nombre tal cual en el Excel
  emp       jsonb := '{}'::jsonb;   -- clave → [product_id, …]
  asignado  jsonb := '{}'::jsonb;   -- product_id → clave
  errores   jsonb := '[]'::jsonb;
  productos jsonb := '[]'::jsonb;
  sin_carta jsonb := '[]'::jsonb;
  v_actual  jsonb;
  v_nuevo   jsonb;
  v_estado  text;
  v_coste   numeric;
  v_coste_a numeric;
  v_aplicar jsonb := '[]'::jsonb;
  v_informe jsonb;
  v_imp     uuid;
  v_mermas  jsonb;
  v_otro    text;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'IMPORTACION_VACIA'; end if;
  if jsonb_array_length(p_filas) > 2000 then raise exception 'IMPORTACION_DEMASIADO_GRANDE'; end if;
  if p_emparejamientos is null or jsonb_typeof(p_emparejamientos) <> 'array' or jsonb_array_length(p_emparejamientos) > 1000 then
    raise exception 'EMPAREJAMIENTOS_INVALIDOS';
  end if;
  if p_confirmar then
    lock table public.recetas in share row exclusive mode;
  end if;

  -- 1. Líneas de receta
  for rec in select value as v, ordinality as n from jsonb_array_elements(p_filas) with ordinality loop
    x := rec.v;
    v_motivo := null;
    v_fila := case when jsonb_typeof(x -> 'fila') = 'number' then (x ->> 'fila')::numeric::integer else rec.n::integer end;
    v_prod := btrim(regexp_replace(coalesce(x ->> 'producto', ''), '\s+', ' ', 'g'));
    v_clave := lower(v_prod);
    v_ins_txt := btrim(regexp_replace(coalesce(x ->> 'insumo', ''), '\s+', ' ', 'g'));
    v_med := lower(btrim(coalesce(x ->> 'medida', '')));
    v_cant := case when jsonb_typeof(x -> 'cantidad') = 'number' then (x ->> 'cantidad')::numeric end;
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

    if v_prod <> '' and not nombres ? v_clave then
      nombres := nombres || jsonb_build_object(v_clave, v_prod);
    end if;
    if v_motivo is not null then
      errores := errores || jsonb_build_object('fila', v_fila, 'producto', nullif(v_prod, ''), 'motivo', v_motivo);
      continue;
    end if;
    lineas := jsonb_set(lineas, array[v_clave], coalesce(lineas -> v_clave, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'insumo_id', ins.id, 'insumo', ins.nombre, 'cantidad', round(v_cant * v_factor, 3), 'unidad', ins.unidad_base,
      'coste_unitario', ins.coste_unitario)));
  end loop;

  -- 2. Emparejamientos
  for e in select value from jsonb_array_elements(p_emparejamientos) loop
    v_clave := lower(btrim(regexp_replace(coalesce(e ->> 'producto', ''), '\s+', ' ', 'g')));
    if v_clave = '' or jsonb_typeof(e -> 'product_ids') is distinct from 'array' then
      errores := errores || jsonb_build_object('fila', null, 'producto', nullif(v_clave, ''), 'motivo', 'Emparejamiento no válido');
      continue;
    end if;
    v_pids := '{}';
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
      if not v_pid = any (v_pids) then v_pids := v_pids || v_pid; end if;
    end loop;
    emp := emp || jsonb_build_object(v_clave, to_jsonb(v_pids));
  end loop;

  for v_clave in select jsonb_object_keys(nombres) loop
    if not emp ? v_clave then
      errores := errores || jsonb_build_object('fila', null, 'producto', nombres ->> v_clave, 'motivo', 'Sin emparejar con la carta');
    elsif jsonb_array_length(emp -> v_clave) = 0 then
      sin_carta := sin_carta || to_jsonb(nombres ->> v_clave);
    end if;
  end loop;

  -- 3. Resultado por producto de la carta
  for v_clave in select jsonb_object_keys(emp) loop
    if not lineas ? v_clave then continue; end if;      -- todas sus filas tienen error (ya avisado)
    v_nuevo := (select jsonb_agg(l order by l ->> 'insumo') from jsonb_array_elements(lineas -> v_clave) l);
    for v_pid in select (value)::text::integer from jsonb_array_elements(emp -> v_clave) loop
      select * into p from public.products where id = v_pid;
      v_actual := (select coalesce(jsonb_agg(jsonb_build_object('insumo_id', r.insumo_id, 'cantidad', r.cantidad) order by r.insumo_id), '[]'::jsonb)
                   from public.recetas r where r.product_id = v_pid);
      v_estado := case
        when jsonb_array_length(v_actual) = 0 then 'nueva'
        when v_actual = (select jsonb_agg(jsonb_build_object('insumo_id', (l ->> 'insumo_id')::integer, 'cantidad', (l ->> 'cantidad')::numeric)
                                          order by (l ->> 'insumo_id')::integer) from jsonb_array_elements(v_nuevo) l) then 'igual'
        else 'cambia' end;
      -- La merma ya guardada de un ingrediente se conserva al reimportar.
      v_coste := (select round(sum((l ->> 'cantidad')::numeric * (l ->> 'coste_unitario')::numeric
                                   / (1 - coalesce(r.merma_pct, 0) / 100)), 6)
                  from jsonb_array_elements(v_nuevo) l
                  left join public.recetas r on r.product_id = v_pid and r.insumo_id = (l ->> 'insumo_id')::integer);
      v_coste_a := public._coste_producto(v_pid);
      select * into m from public._margen_etiqueta(p.precio_centimos, v_coste);
      productos := productos || jsonb_build_object(
        'product_id', v_pid, 'nombre', p.nombre, 'producto_excel', nombres ->> v_clave, 'estado', v_estado,
        'precio_centimos', p.precio_centimos, 'coste_antes', v_coste_a, 'coste', v_coste,
        'margen_pct', m.margen_pct, 'ganancia', m.ganancia, 'etiqueta', m.etiqueta,
        'lineas', (select jsonb_agg(l - 'coste_unitario') from jsonb_array_elements(v_nuevo) l));
      if v_estado <> 'igual' then
        v_aplicar := v_aplicar || jsonb_build_object('product_id', v_pid, 'lineas', v_nuevo);
      end if;
    end loop;
  end loop;

  v_informe := jsonb_build_object(
    'total_filas', jsonb_array_length(p_filas),
    'productos', coalesce((select jsonb_agg(pr.value order by pr.value ->> 'nombre') from jsonb_array_elements(productos) pr), '[]'::jsonb),
    'sin_carta', sin_carta,
    'errores', errores);
  if not p_confirmar or jsonb_array_length(errores) > 0 then
    return v_informe || jsonb_build_object('aplicada', false);
  end if;

  for x in select value from jsonb_array_elements(v_aplicar) loop
    v_pid := (x ->> 'product_id')::integer;
    v_mermas := (select coalesce(jsonb_object_agg(r.insumo_id::text, r.merma_pct), '{}'::jsonb)
                 from public.recetas r where r.product_id = v_pid);
    delete from public.recetas where product_id = v_pid;
    insert into public.recetas (product_id, insumo_id, cantidad, merma_pct, updated_by)
    select v_pid, (l ->> 'insumo_id')::integer, (l ->> 'cantidad')::numeric,
           coalesce((v_mermas ->> (l ->> 'insumo_id'))::numeric, 0), auth.uid()
    from jsonb_array_elements(x -> 'lineas') l;
  end loop;

  insert into public.costes_emparejamientos (nombre_excel, product_ids, updated_at, updated_by)
  select k, array(select (value)::text::integer from jsonb_array_elements(emp -> k)), now(), auth.uid()
  from jsonb_object_keys(emp) k
  on conflict (nombre_excel) do update set product_ids = excluded.product_ids, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  insert into public.costes_importaciones (tipo, nombre_archivo, filas, informe, creada_por)
  values ('recetas', left(nullif(btrim(coalesce(p_archivo, '')), ''), 200),
          jsonb_build_object('filas', p_filas, 'emparejamientos', p_emparejamientos), v_informe, auth.uid())
  returning id into v_imp;

  return v_informe || jsonb_build_object('aplicada', true, 'importacion_id', v_imp, 'recetas_cambiadas', jsonb_array_length(v_aplicar));
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Permisos explícitos (regla de ENTORNOS.md)
-- ---------------------------------------------------------------------
GRANT UPDATE ("iva_defecto_pct", "escala_bueno_pct", "escala_muy_bueno_pct", "escala_excelente_pct")
  ON TABLE "public"."app_settings" TO "authenticated";

REVOKE ALL ON TABLE "public"."recetas" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."costes_emparejamientos" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."producto_precios" FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON TABLE "public"."recetas" TO "service_role";
GRANT ALL ON TABLE "public"."costes_emparejamientos" TO "service_role";
GRANT ALL ON TABLE "public"."producto_precios" TO "service_role";
-- Los admins (RLS) solo leen; las recetas se escriben con las funciones.
GRANT SELECT ON TABLE "public"."recetas" TO "authenticated";
GRANT SELECT ON TABLE "public"."costes_emparejamientos" TO "authenticated";
GRANT SELECT ON TABLE "public"."producto_precios" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."producto_precios_id_seq" FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON SEQUENCE "public"."producto_precios_id_seq" TO "service_role";

REVOKE ALL ON FUNCTION "public"."_producto_registrar_precio"() FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_producto_registrar_precio"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."producto_precios_inmutable"() FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."producto_precios_inmutable"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."_coste_producto"("p_product_id" integer) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_coste_producto"("p_product_id" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."_margen_etiqueta"("p_precio_centimos" integer, "p_coste" numeric) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_margen_etiqueta"("p_precio_centimos" integer, "p_coste" numeric) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rentabilidad_productos"() FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."rentabilidad_productos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rentabilidad_productos"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."admin_guardar_receta"("p_product_id" integer, "p_lineas" "jsonb") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_guardar_receta"("p_product_id" integer, "p_lineas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_guardar_receta"("p_product_id" integer, "p_lineas" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."admin_importar_recetas"("p_archivo" "text", "p_filas" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_importar_recetas"("p_archivo" "text", "p_filas" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_importar_recetas"("p_archivo" "text", "p_filas" "jsonb", "p_emparejamientos" "jsonb", "p_confirmar" boolean) TO "service_role";
