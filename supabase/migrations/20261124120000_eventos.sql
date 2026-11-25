-- =====================================================================
--  Eventos con precio cerrado · EV1: base de datos (EVENTOS.md)
--
--  Un evento es un acuerdo (contenido + precio cerrado + plazos). Al
--  confirmarlo se abre su propia cuenta (orders.origen = 'evento') con una
--  línea por plazo (order_items.tipo_linea = 'evento'). Los plazos se cobran
--  con lo que ya existe (cobrar por separado / cobrar cuenta) y cada cobro va
--  a la jornada del día en que se cobra (EV-D13). Las cuentas de evento no
--  bloquean el cierre (EV-D14) y sus plazos no se anulan desde el TPV (EV-D15).
--  Solo admins crean, editan, confirman y cancelan; camareros y admins leen.
--  Todo se AÑADE: la web publicada sigue funcionando igual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tablas nuevas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."eventos" (
    "id" "uuid" DEFAULT gen_random_uuid() PRIMARY KEY,
    "nombre" "text" NOT NULL,
    "fecha" "date" NOT NULL,
    "hora_inicio" time without time zone,
    "personas" integer,
    "contacto_nombre" "text",
    "contacto_telefono" "text",
    "socio_id" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "precio_centimos" integer NOT NULL,
    "estado" "text" DEFAULT 'borrador' NOT NULL,
    "notas" "text",
    "order_id" "uuid" UNIQUE REFERENCES "public"."orders"("id") ON DELETE RESTRICT,
    "motivo_cancelacion" "text",
    "created_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    CONSTRAINT "eventos_nombre_check" CHECK (length(btrim("nombre")) BETWEEN 1 AND 120),
    CONSTRAINT "eventos_personas_check" CHECK ("personas" IS NULL OR "personas" BETWEEN 1 AND 10000),
    CONSTRAINT "eventos_contacto_check" CHECK (("contacto_nombre" IS NULL OR length("contacto_nombre") <= 120)
                                               AND ("contacto_telefono" IS NULL OR length("contacto_telefono") <= 40)),
    CONSTRAINT "eventos_precio_check" CHECK ("precio_centimos" > 0 AND "precio_centimos" < 100000000),
    CONSTRAINT "eventos_estado_check" CHECK ("estado" IN ('borrador', 'confirmado', 'realizado', 'cancelado')),
    CONSTRAINT "eventos_notas_check" CHECK ("notas" IS NULL OR length("notas") <= 1000),
    CONSTRAINT "eventos_cuenta_check" CHECK (("estado" = 'borrador') OR ("estado" = 'cancelado') OR ("order_id" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "eventos_fecha_idx" ON "public"."eventos" ("fecha");

-- Contenido acordado: o un producto de la carta o un concepto libre (EV-D2). Informativo: sin precio.
CREATE TABLE IF NOT EXISTS "public"."evento_items" (
    "id" "uuid" DEFAULT gen_random_uuid() PRIMARY KEY,
    "evento_id" "uuid" NOT NULL REFERENCES "public"."eventos"("id") ON DELETE CASCADE,
    "product_id" integer REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    "concepto" "text",
    "cantidad" integer NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "evento_items_uno_check" CHECK (("product_id" IS NULL) <> ("concepto" IS NULL)),
    CONSTRAINT "evento_items_concepto_check" CHECK ("concepto" IS NULL OR length(btrim("concepto")) BETWEEN 1 AND 120),
    CONSTRAINT "evento_items_cantidad_check" CHECK ("cantidad" BETWEEN 1 AND 9999)
);
CREATE INDEX IF NOT EXISTS "evento_items_evento_idx" ON "public"."evento_items" ("evento_id");

-- Plazos (EV-D3). anulado: plazo que se quitó tras confirmar (su línea queda anulada).
CREATE TABLE IF NOT EXISTS "public"."evento_plazos" (
    "id" "uuid" DEFAULT gen_random_uuid() PRIMARY KEY,
    "evento_id" "uuid" NOT NULL REFERENCES "public"."eventos"("id") ON DELETE CASCADE,
    "nombre" "text" NOT NULL,
    "importe_centimos" integer NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "order_item_id" "uuid" UNIQUE,
    "anulado" boolean DEFAULT false NOT NULL,
    CONSTRAINT "evento_plazos_nombre_check" CHECK (length(btrim("nombre")) BETWEEN 1 AND 60),
    CONSTRAINT "evento_plazos_importe_check" CHECK ("importe_centimos" > 0 AND "importe_centimos" < 100000000)
);
CREATE INDEX IF NOT EXISTS "evento_plazos_evento_idx" ON "public"."evento_plazos" ("evento_id");

CREATE OR REPLACE TRIGGER "eventos_set_updated_at" BEFORE UPDATE ON "public"."eventos"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."eventos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."evento_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."evento_plazos" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personal ve los eventos" ON "public"."eventos";
CREATE POLICY "Personal ve los eventos" ON "public"."eventos" FOR SELECT TO "authenticated"
  USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));
DROP POLICY IF EXISTS "Personal ve el contenido de los eventos" ON "public"."evento_items";
CREATE POLICY "Personal ve el contenido de los eventos" ON "public"."evento_items" FOR SELECT TO "authenticated"
  USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));
DROP POLICY IF EXISTS "Personal ve los plazos de los eventos" ON "public"."evento_plazos";
CREATE POLICY "Personal ve los plazos de los eventos" ON "public"."evento_plazos" FOR SELECT TO "authenticated"
  USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));


-- ---------------------------------------------------------------------
-- 2. Ampliaciones (añadir antes de quitar)
-- ---------------------------------------------------------------------
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "evento_id" "uuid";
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_evento_id_fkey";
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_evento_id_key" ON "public"."orders" ("evento_id") WHERE "evento_id" IS NOT NULL;
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_origen_check";
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_origen_check" CHECK (("origen" = ANY (ARRAY['barra'::"text", 'mesa'::"text", 'evento'::"text"])));
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_evento_check";
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_evento_check" CHECK ((("origen" = 'evento'::"text") = ("evento_id" IS NOT NULL)));

ALTER TABLE "public"."order_items" ADD COLUMN IF NOT EXISTS "evento_plazo_id" "uuid";
ALTER TABLE "public"."order_items" DROP CONSTRAINT IF EXISTS "order_items_evento_plazo_id_fkey";
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_evento_plazo_id_fkey" FOREIGN KEY ("evento_plazo_id") REFERENCES "public"."evento_plazos"("id") ON DELETE RESTRICT;
ALTER TABLE "public"."order_items" DROP CONSTRAINT IF EXISTS "order_items_tipo_linea_check";
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_tipo_linea_check" CHECK (("tipo_linea" = ANY (ARRAY['producto'::"text", 'pack'::"text", 'obsequio'::"text", 'sorteo'::"text", 'evento'::"text"])));
-- «Exactamente uno de producto, promo o plazo» sustituye a «o producto o promo» (primero se añade la nueva).
ALTER TABLE "public"."order_items" DROP CONSTRAINT IF EXISTS "order_items_una_fuente";
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_una_fuente" CHECK (num_nonnulls("product_id", "promo_id", "evento_plazo_id") = 1);
ALTER TABLE "public"."order_items" DROP CONSTRAINT IF EXISTS "order_items_producto_o_promo";
ALTER TABLE "public"."order_items" DROP CONSTRAINT IF EXISTS "order_items_evento_check";
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_evento_check" CHECK ((("tipo_linea" = 'evento'::"text") = ("evento_plazo_id" IS NOT NULL)));

ALTER TABLE "public"."evento_plazos" DROP CONSTRAINT IF EXISTS "evento_plazos_order_item_id_fkey";
ALTER TABLE "public"."evento_plazos" ADD CONSTRAINT "evento_plazos_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;

ALTER TABLE "public"."pos_events" DROP CONSTRAINT IF EXISTS "pos_events_tipo_check";
ALTER TABLE "public"."pos_events" ADD CONSTRAINT "pos_events_tipo_check" CHECK (("tipo" = ANY (ARRAY[
  'abierta'::"text", 'linea_anadida'::"text", 'linea_aceptada'::"text", 'linea_servida'::"text", 'linea_anulada'::"text",
  'pagada'::"text", 'cancelada'::"text", 'devuelta'::"text", 'mesa_cambiada'::"text", 'cuenta_impresa'::"text",
  'evento_creado'::"text", 'evento_editado'::"text", 'evento_confirmado'::"text", 'evento_cancelado'::"text", 'evento_realizado'::"text"])));


-- ---------------------------------------------------------------------
-- 3. Guardar un evento (crear o editar) · solo admins
--    p_datos: {"nombre", "fecha": "2026-12-05", "hora_inicio": "20:00" | null, "personas", "contacto_nombre",
--              "contacto_telefono", "socio_id", "precio_centimos", "notas",
--              "items":  [{"product_id": 15, "cantidad": 40} | {"concepto": "Barril Estrella 30 L", "cantidad": 1}],
--              "plazos": [{"id"?: "…", "nombre": "Señal", "importe_centimos": 10000}, …]}
--    Borrador: se cambia todo. Confirmado (EV-D8): el contenido siempre; los plazos cobrados no se tocan
--    (tienen que venir iguales, con su id); los pendientes se cambian, se quitan (su línea se anula) o se
--    añaden (con su línea). Los plazos siempre suman el precio, que no puede bajar de lo cobrado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."admin_guardar_evento"("p_id" "uuid", "p_datos" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid        uuid := auth.uid();
  ev         public.eventos%rowtype;
  x          jsonb;
  v_nombre   text;
  v_fecha    date;
  v_hora     time;
  v_personas integer;
  v_precio   integer;
  v_socio    uuid;
  v_suma     integer := 0;
  v_cobrado  integer := 0;
  v_id       uuid;
  v_pid      integer;
  v_cant     integer;
  v_concepto text;
  v_pl       public.evento_plazos%rowtype;
  v_li       public.order_items%rowtype;
  v_vistos   uuid[] := '{}';
  v_orden    integer := 0;
  v_imp      integer;
  v_pnombre  text;
  v_nuevo    uuid;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'EVENTO_DATOS_INVALIDOS'; end if;

  -- Datos generales
  v_nombre := btrim(regexp_replace(coalesce(p_datos ->> 'nombre', ''), '\s+', ' ', 'g'));
  if v_nombre = '' or length(v_nombre) > 120 then raise exception 'EVENTO_NOMBRE'; end if;
  begin
    v_fecha := (p_datos ->> 'fecha')::date;
    v_hora := nullif(btrim(coalesce(p_datos ->> 'hora_inicio', '')), '')::time;
  exception when others then
    raise exception 'EVENTO_FECHA';
  end;
  if v_fecha is null then raise exception 'EVENTO_FECHA'; end if;
  v_personas := case when jsonb_typeof(p_datos -> 'personas') = 'number' then (p_datos ->> 'personas')::numeric::integer end;
  if v_personas is not null and (v_personas < 1 or v_personas > 10000) then raise exception 'EVENTO_PERSONAS'; end if;
  v_precio := case when jsonb_typeof(p_datos -> 'precio_centimos') = 'number' then (p_datos ->> 'precio_centimos')::numeric::integer end;
  if v_precio is null or v_precio <= 0 or v_precio >= 100000000 then raise exception 'EVENTO_PRECIO'; end if;
  begin
    v_socio := nullif(btrim(coalesce(p_datos ->> 'socio_id', '')), '')::uuid;
  exception when others then
    raise exception 'EVENTO_SOCIO_NO_EXISTE';
  end;
  if v_socio is not null and not exists (select 1 from auth.users where id = v_socio) then raise exception 'EVENTO_SOCIO_NO_EXISTE'; end if;
  if jsonb_typeof(coalesce(p_datos -> 'items', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_datos -> 'plazos', '[]'::jsonb)) <> 'array' then
    raise exception 'EVENTO_DATOS_INVALIDOS';
  end if;
  if jsonb_array_length(coalesce(p_datos -> 'items', '[]'::jsonb)) > 100 or jsonb_array_length(coalesce(p_datos -> 'plazos', '[]'::jsonb)) > 12 then
    raise exception 'EVENTO_DATOS_INVALIDOS';
  end if;

  -- Contenido: validar antes de tocar nada
  for x in select value from jsonb_array_elements(coalesce(p_datos -> 'items', '[]'::jsonb)) loop
    v_pid := case when jsonb_typeof(x -> 'product_id') = 'number' then (x ->> 'product_id')::numeric::integer end;
    v_concepto := nullif(btrim(regexp_replace(coalesce(x ->> 'concepto', ''), '\s+', ' ', 'g')), '');
    v_cant := case when jsonb_typeof(x -> 'cantidad') = 'number' then (x ->> 'cantidad')::numeric::integer end;
    if (v_pid is null) = (v_concepto is null) then raise exception 'EVENTO_ITEM_INVALIDO'; end if;
    if v_pid is not null and not exists (select 1 from public.products where id = v_pid) then raise exception 'EVENTO_ITEM_INVALIDO'; end if;
    if v_concepto is not null and length(v_concepto) > 120 then raise exception 'EVENTO_ITEM_INVALIDO'; end if;
    if v_cant is null or v_cant < 1 or v_cant > 9999 then raise exception 'EVENTO_ITEM_INVALIDO'; end if;
  end loop;

  -- Plazos: validar y sumar
  for x in select value from jsonb_array_elements(coalesce(p_datos -> 'plazos', '[]'::jsonb)) loop
    v_pnombre := btrim(regexp_replace(coalesce(x ->> 'nombre', ''), '\s+', ' ', 'g'));
    v_imp := case when jsonb_typeof(x -> 'importe_centimos') = 'number' then (x ->> 'importe_centimos')::numeric::integer end;
    if v_pnombre = '' or length(v_pnombre) > 60 or v_imp is null or v_imp <= 0 or v_imp >= 100000000 then raise exception 'EVENTO_PLAZO_INVALIDO'; end if;
    v_suma := v_suma + v_imp;
  end loop;
  if jsonb_array_length(coalesce(p_datos -> 'plazos', '[]'::jsonb)) = 0 then raise exception 'EVENTO_SIN_PLAZOS'; end if;
  if p_id is null then
    if v_suma <> v_precio then raise exception 'EVENTO_PLAZOS_NO_SUMAN' using detail = format('%s ≠ %s', v_suma, v_precio); end if;
    insert into public.eventos (nombre, fecha, hora_inicio, personas, contacto_nombre, contacto_telefono, socio_id, precio_centimos,
                                notas, created_by, updated_by)
    values (v_nombre, v_fecha, v_hora, v_personas, nullif(btrim(coalesce(p_datos ->> 'contacto_nombre', '')), ''),
            nullif(btrim(coalesce(p_datos ->> 'contacto_telefono', '')), ''), v_socio, v_precio,
            nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''), uid, uid)
    returning * into ev;
    insert into public.pos_events (tipo, actor, detalle) values ('evento_creado', uid, jsonb_build_object('evento_id', ev.id, 'nombre', v_nombre, 'precio_centimos', v_precio));
  else
    select * into ev from public.eventos where id = p_id for update;
    if not found then raise exception 'EVENTO_NO_EXISTE'; end if;
    if ev.estado not in ('borrador', 'confirmado') then raise exception 'EVENTO_NO_EDITABLE'; end if;
    if ev.order_id is not null then
      perform 1 from public.orders where id = ev.order_id for update;
    end if;
    update public.eventos set nombre = v_nombre, fecha = v_fecha, hora_inicio = v_hora, personas = v_personas,
      contacto_nombre = nullif(btrim(coalesce(p_datos ->> 'contacto_nombre', '')), ''),
      contacto_telefono = nullif(btrim(coalesce(p_datos ->> 'contacto_telefono', '')), ''),
      socio_id = v_socio, precio_centimos = v_precio, notas = nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''), updated_by = uid
    where id = ev.id;
    insert into public.pos_events (order_id, tipo, actor, detalle)
    values (ev.order_id, 'evento_editado', uid, jsonb_build_object('evento_id', ev.id, 'precio_antes', ev.precio_centimos, 'precio_centimos', v_precio));
  end if;

  -- Lo ya cobrado manda (EV-D8): el precio no puede bajar de ahí. Después, los plazos tienen que sumar el precio.
  if ev.order_id is not null then
    select coalesce(sum(p.importe_centimos), 0) into v_cobrado
    from public.evento_plazos p join public.order_items oi on oi.id = p.order_item_id
    where p.evento_id = ev.id and not p.anulado and oi.sale_id is not null;
    if v_precio < v_cobrado then raise exception 'EVENTO_PRECIO_MENOR_QUE_COBRADO' using detail = v_cobrado::text; end if;
  end if;
  if v_suma <> v_precio then raise exception 'EVENTO_PLAZOS_NO_SUMAN' using detail = format('%s ≠ %s', v_suma, v_precio); end if;

  -- Contenido: se rehace siempre
  delete from public.evento_items where evento_id = ev.id;
  insert into public.evento_items (evento_id, product_id, concepto, cantidad, orden)
  select ev.id,
         case when jsonb_typeof(it.value -> 'product_id') = 'number' then (it.value ->> 'product_id')::numeric::integer end,
         nullif(btrim(regexp_replace(coalesce(it.value ->> 'concepto', ''), '\s+', ' ', 'g')), ''),
         (it.value ->> 'cantidad')::numeric::integer, it.ordinality::integer
  from jsonb_array_elements(coalesce(p_datos -> 'items', '[]'::jsonb)) with ordinality it;

  -- Plazos
  if ev.estado = 'borrador' then
    delete from public.evento_plazos where evento_id = ev.id;
    insert into public.evento_plazos (evento_id, nombre, importe_centimos, orden)
    select ev.id, btrim(regexp_replace(pl.value ->> 'nombre', '\s+', ' ', 'g')), (pl.value ->> 'importe_centimos')::numeric::integer, pl.ordinality::integer
    from jsonb_array_elements(p_datos -> 'plazos') with ordinality pl;
    return ev.id;
  end if;

  -- Confirmado (EV-D8)

  for x in select value from jsonb_array_elements(p_datos -> 'plazos') loop
    v_orden := v_orden + 1;
    v_pnombre := btrim(regexp_replace(x ->> 'nombre', '\s+', ' ', 'g'));
    v_imp := (x ->> 'importe_centimos')::numeric::integer;
    v_id := null;
    begin
      v_id := nullif(x ->> 'id', '')::uuid;
    exception when others then
      raise exception 'EVENTO_PLAZO_INVALIDO';
    end;
    v_pl := null;
    if v_id is not null then
      select * into v_pl from public.evento_plazos where id = v_id and evento_id = ev.id and not anulado;
      if v_pl.id is null then raise exception 'EVENTO_PLAZO_INVALIDO'; end if;
      if v_id = any (v_vistos) then raise exception 'EVENTO_PLAZO_INVALIDO'; end if;
      v_vistos := v_vistos || v_id;
      select * into v_li from public.order_items where id = v_pl.order_item_id;
      if v_li.sale_id is not null then
        if v_imp <> v_pl.importe_centimos then raise exception 'EVENTO_PLAZO_COBRADO' using detail = v_pl.nombre; end if;
        update public.evento_plazos set orden = v_orden where id = v_pl.id;
      else
        update public.evento_plazos set nombre = v_pnombre, importe_centimos = v_imp, orden = v_orden where id = v_pl.id;
        update public.order_items set precio_unitario_centimos = v_imp, nombre = format('Evento · %s — %s', v_nombre, lower(v_pnombre))
        where id = v_pl.order_item_id;
      end if;
    else
      insert into public.evento_plazos (evento_id, nombre, importe_centimos, orden) values (ev.id, v_pnombre, v_imp, v_orden)
      returning id into v_nuevo;
      insert into public.order_items (order_id, nombre, precio_unitario_centimos, tipo_linea, cantidad, anadida_por, estado, evento_plazo_id)
      values (ev.order_id, format('Evento · %s — %s', v_nombre, lower(v_pnombre)), v_imp, 'evento', 1, uid, 'servida', v_nuevo)
      returning id into v_id;
      update public.evento_plazos set order_item_id = v_id where id = v_nuevo;
      v_vistos := v_vistos || v_nuevo;
    end if;
  end loop;

  -- Plazos que ya no vienen: cobrados → error; pendientes → se anulan con su línea.
  for v_pl in select * from public.evento_plazos where evento_id = ev.id and not anulado and not (id = any (v_vistos)) loop
    select * into v_li from public.order_items where id = v_pl.order_item_id;
    if v_li.sale_id is not null then raise exception 'EVENTO_PLAZO_COBRADO' using detail = v_pl.nombre; end if;
    update public.evento_plazos set anulado = true where id = v_pl.id;
    update public.order_items set estado = 'anulada' where id = v_pl.order_item_id;
    insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
    values (ev.order_id, v_pl.order_item_id, 'linea_anulada', uid, jsonb_build_object('motivo', 'Plazo quitado al editar el evento', 'evento_id', ev.id));
  end loop;

  -- Si con el cambio ya no queda nada por cobrar (y hubo cobros), la cuenta se cierra: el evento pasa a realizado.
  if exists (select 1 from public.sales where order_id = ev.order_id) and not public._pos_cuenta_pendiente(ev.order_id) then
    update public.orders set estado = 'pagada' where id = ev.order_id and estado = 'abierta';
  end if;
  return ev.id;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Confirmar: abre la cuenta del evento con una línea por plazo (idempotente)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."admin_confirmar_evento"("p_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid    uuid := auth.uid();
  ev     public.eventos%rowtype;
  pl     public.evento_plazos%rowtype;
  v_ord  uuid;
  v_li   uuid;
  v_suma integer;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  select * into ev from public.eventos where id = p_id for update;
  if not found then raise exception 'EVENTO_NO_EXISTE'; end if;
  if ev.estado in ('confirmado', 'realizado') then return ev.order_id; end if;   -- ya confirmado: no duplica nada
  if ev.estado = 'cancelado' then raise exception 'EVENTO_CANCELADO'; end if;

  select coalesce(sum(importe_centimos), 0) into v_suma from public.evento_plazos where evento_id = ev.id and not anulado;
  if v_suma = 0 then raise exception 'EVENTO_SIN_PLAZOS'; end if;
  if v_suma <> ev.precio_centimos then raise exception 'EVENTO_PLAZOS_NO_SUMAN'; end if;

  insert into public.orders (origen, estado, abierta_por, jornada, evento_id)
  values ('evento', 'abierta', uid, public._jornada_fecha(), ev.id)
  returning id into v_ord;
  for pl in select * from public.evento_plazos where evento_id = ev.id and not anulado order by orden loop
    insert into public.order_items (order_id, nombre, precio_unitario_centimos, tipo_linea, cantidad, anadida_por, estado, evento_plazo_id)
    values (v_ord, format('Evento · %s — %s', ev.nombre, lower(pl.nombre)), pl.importe_centimos, 'evento', 1, uid, 'servida', pl.id)
    returning id into v_li;
    update public.evento_plazos set order_item_id = v_li where id = pl.id;
  end loop;

  update public.eventos set estado = 'confirmado', order_id = v_ord, updated_by = uid where id = ev.id;
  insert into public.pos_events (order_id, tipo, actor, detalle)
  values (v_ord, 'abierta', uid, jsonb_build_object('evento', ev.nombre)),
         (v_ord, 'evento_confirmado', uid, jsonb_build_object('evento_id', ev.id, 'precio_centimos', ev.precio_centimos));
  return v_ord;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Cancelar: anula lo pendiente (plazos y extras), conserva lo cobrado (EV-D9)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."admin_cancelar_evento"("p_id" "uuid", "p_motivo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid  uuid := auth.uid();
  ev   public.eventos%rowtype;
  li   public.order_items%rowtype;
  v_cobrada boolean;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  select * into ev from public.eventos where id = p_id for update;
  if not found then raise exception 'EVENTO_NO_EXISTE'; end if;
  if ev.estado = 'cancelado' then return; end if;
  if ev.estado = 'realizado' then raise exception 'EVENTO_NO_EDITABLE'; end if;

  -- Primero el evento (así el cierre de su cuenta no lo da por «realizado»)
  update public.eventos set estado = 'cancelado', motivo_cancelacion = btrim(p_motivo), updated_by = uid where id = ev.id;
  insert into public.pos_events (order_id, tipo, actor, detalle)
  values (ev.order_id, 'evento_cancelado', uid, jsonb_build_object('evento_id', ev.id, 'motivo', btrim(p_motivo)));

  if ev.order_id is not null then
    perform 1 from public.orders where id = ev.order_id and estado = 'abierta' for update;
    if found then
      for li in
        update public.order_items set estado = 'anulada'
        where order_id = ev.order_id and estado in ('pendiente', 'aceptada', 'servida') and sale_id is null
        returning *
      loop
        perform public._pos_liberar_ticket(li, uid, btrim(p_motivo));
        insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
        values (ev.order_id, li.id, 'linea_anulada', uid, jsonb_build_object('motivo', btrim(p_motivo), 'por_cancelacion', true));
      end loop;
      update public.evento_plazos p set anulado = true
      from public.order_items oi where oi.id = p.order_item_id and p.evento_id = ev.id and oi.estado = 'anulada';
      v_cobrada := exists (select 1 from public.sales where order_id = ev.order_id);
      update public.orders set estado = case when v_cobrada then 'pagada' else 'cancelada' end where id = ev.order_id;
    end if;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Cuando la cuenta de un evento queda pagada (por cualquier camino), el evento pasa a realizado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."_evento_cuenta_pagada"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.origen = 'evento' and new.estado = 'pagada' and old.estado is distinct from 'pagada' then
    update public.eventos set estado = 'realizado' where id = new.evento_id and estado = 'confirmado';
    if found then
      insert into public.pos_events (order_id, tipo, actor, detalle)
      values (new.id, 'evento_realizado', auth.uid(), jsonb_build_object('evento_id', new.evento_id));
    end if;
  end if;
  return null;
end;
$$;

CREATE OR REPLACE TRIGGER "orders_evento_pagada" AFTER UPDATE OF "estado" ON "public"."orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."_evento_cuenta_pagada"();


-- ---------------------------------------------------------------------
-- 7. Eventos para el TPV (camareros y admins): confirmados o realizados de unas fechas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."pos_eventos"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public._pos_exigir_personal();
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 400 then raise exception 'PERIODO_INVALIDO'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'hora_inicio', e.hora_inicio, 'personas', e.personas,
      'contacto_nombre', e.contacto_nombre, 'contacto_telefono', e.contacto_telefono,
      'socio_id', e.socio_id, 'socio_nombre', (select pr.nombre from public.profiles pr where pr.id = e.socio_id),
      'precio_centimos', e.precio_centimos, 'estado', e.estado, 'notas', e.notas, 'order_id', e.order_id,
      'cuenta_abierta', o.estado = 'abierta',
      'contenido', coalesce((
        select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'nombre', coalesce(pr.nombre, i.concepto), 'cantidad', i.cantidad) order by i.orden)
        from public.evento_items i left join public.products pr on pr.id = i.product_id where i.evento_id = e.id), '[]'::jsonb),
      'plazos', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'importe_centimos', p.importe_centimos,
                                            'order_item_id', p.order_item_id, 'cobrado', oi.sale_id is not null,
                                            'venta_numero', s.numero) order by p.orden)
        from public.evento_plazos p
        left join public.order_items oi on oi.id = p.order_item_id
        left join public.sales s on s.id = oi.sale_id
        where p.evento_id = e.id and not p.anulado), '[]'::jsonb),
      'cobrado_centimos', coalesce((select sum(s.total_centimos) from public.sales s where s.order_id = e.order_id), 0),
      'pendiente_centimos', coalesce((select sum(oi.precio_unitario_centimos * oi.cantidad) from public.order_items oi
                                      where oi.order_id = e.order_id and oi.estado in ('aceptada', 'servida') and oi.sale_id is null), 0),
      'extras_pendientes', coalesce((select count(*) from public.order_items oi
                                     where oi.order_id = e.order_id and oi.tipo_linea <> 'evento' and oi.estado in ('pendiente', 'aceptada', 'servida')
                                       and oi.sale_id is null), 0)
    ) order by e.fecha, e.hora_inicio nulls last, e.nombre)
    from public.eventos e
    left join public.orders o on o.id = e.order_id
    where e.estado in ('confirmado', 'realizado') and e.fecha between p_desde and p_hasta
  ), '[]'::jsonb);
end;
$$;


-- ---------------------------------------------------------------------
-- 8. Funciones que se adaptan (mismos parámetros)
-- ---------------------------------------------------------------------
-- EV-D13: los cobros de una cuenta de evento van a la jornada del día del cobro (las demás, como siempre).

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
  values (p_order.id, v_total + v_desc, v_desc, v_total, p_metodo, p_actor,
          case when p_order.origen = 'evento' then public._jornada_fecha() else p_order.jornada end, p_client_request_id)
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



-- EV-D14: las cuentas de evento no bloquean el cierre de jornada ni salen en «mesas abiertas».

CREATE OR REPLACE FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") RETURNS "public"."cierres_jornada"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid      uuid := public._pos_exigir_personal();
  v_res    jsonb;
  v_mesas  text;
  v_ef     integer;
  v_ver    integer;
  nuevo    public.cierres_jornada%rowtype;
begin
  if p_jornada is null or p_jornada > public._jornada_fecha() then raise exception 'JORNADA_INVALIDA'; end if;
  if p_efectivo_contado_centimos is not null and p_efectivo_contado_centimos < 0 then raise exception 'IMPORTE_INVALIDO'; end if;
  if p_notas is not null and length(trim(p_notas)) > 500 then raise exception 'NOTAS_DEMASIADO_LARGAS'; end if;

  -- Dos cierres a la vez de la misma jornada: el segundo espera al primero.
  perform pg_advisory_xact_lock(hashtext('cierre_jornada'), (p_jornada - date '2000-01-01'));

  select string_agg(coalesce(m.nombre, 'Barra'), ', ' order by m.orden, m.nombre) into v_mesas
  from public.orders o left join public.mesas m on m.id = o.mesa_id
  where o.estado = 'abierta' and o.jornada <= p_jornada and o.origen <> 'evento';
  if v_mesas is not null then raise exception 'MESAS_ABIERTAS' using detail = v_mesas; end if;

  v_res := public._resumen_caja(p_jornada, p_jornada);
  v_ef := (v_res -> 'por_metodo' -> 'efectivo' ->> 'neto_centimos')::integer;
  select coalesce(max(version), 0) + 1 into v_ver from public.cierres_jornada where jornada = p_jornada;

  insert into public.cierres_jornada (
    jornada, version, cerrado_por, ventas, cobrado_centimos, descuentos_centimos, devuelto_centimos,
    neto_centimos, efectivo_neto_centimos, efectivo_contado_centimos, descuadre_centimos, notas, resumen)
  values (
    p_jornada, v_ver, uid, (v_res ->> 'ventas')::integer, (v_res ->> 'cobrado_centimos')::integer,
    (v_res ->> 'descuentos_centimos')::integer, (v_res ->> 'devuelto_centimos')::integer,
    (v_res ->> 'neto_centimos')::integer, v_ef, p_efectivo_contado_centimos,
    p_efectivo_contado_centimos - v_ef, nullif(trim(coalesce(p_notas, '')), ''), v_res)
  returning * into nuevo;
  return nuevo;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  c        public.cierres_jornada%rowtype;
  v_res    jsonb;
  v_mesas  text[];
begin
  perform public._pos_exigir_personal();
  if p_jornada is null or p_jornada > public._jornada_fecha() then raise exception 'JORNADA_INVALIDA'; end if;

  v_res := public._resumen_caja(p_jornada, p_jornada);
  select coalesce(array_agg(coalesce(m.nombre, 'Barra') order by m.orden, m.nombre), '{}') into v_mesas
  from public.orders o left join public.mesas m on m.id = o.mesa_id
  where o.estado = 'abierta' and o.jornada <= p_jornada and o.origen <> 'evento';

  select * into c from public.cierres_jornada
  where jornada = p_jornada order by version desc limit 1;

  return jsonb_build_object(
    'jornada', p_jornada,
    'actual', p_jornada = public._jornada_fecha(),
    'resumen', v_res,
    'mesas_abiertas', to_jsonb(v_mesas),
    'ultimo_cierre', case when c.id is null then null else to_jsonb(c) end,
    'ventas_despues_del_cierre', case when c.id is null then 0 else
      (v_res ->> 'ventas')::integer - c.ventas end,
    'neto_despues_del_cierre_centimos', case when c.id is null then 0 else
      (v_res ->> 'neto_centimos')::integer - c.neto_centimos end
  );
end;
$$;



-- EV-D15: los plazos de un evento y la cuenta de un evento no se anulan desde el TPV (van por Panel → Eventos).

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
  if li.tipo_linea = 'evento' then raise exception 'EVENTO_DESDE_PANEL'; end if;
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
  if o.origen = 'evento' then raise exception 'EVENTO_DESDE_PANEL'; end if;
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



-- Resumen de Rentabilidad: los plazos de evento van a su grupo «Eventos» (sin coste, EV-D16), no a «Promos».

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
    select oi.product_id, oi.promo_id,
           (select ep.evento_id from public.evento_plazos ep where ep.id = oi.evento_plazo_id) as evento_id, oi.cantidad,
           oi.precio_unitario_centimos * oi.cantidad / 100.0 as venta,
           case when oi.product_id is not null then public._coste_producto(oi.product_id)
                else public._coste_promo(oi.promo_id) end * oi.cantidad as coste
    from public.order_items oi
    join public.sales s on s.id = oi.sale_id
    where s.jornada between p_desde and p_hasta and oi.estado in ('aceptada', 'servida')
  ),
  vendido as (
    select l.product_id, l.promo_id, l.evento_id, sum(l.cantidad)::integer as unidades, sum(l.venta) as venta,
           case when bool_or(l.coste is null) then null else sum(l.coste) end as coste
    from lineas l
    group by l.product_id, l.promo_id, l.evento_id
  ),
  detalle as (
    select v.*,
           case when v.product_id is not null then 'producto' when v.evento_id is not null then 'evento' else 'promo' end as clase,
           coalesce(pr.nombre, po.nombre, ev.nombre, '¿?') as nombre,
           case when v.product_id is not null then coalesce(pr.categoria_id, '¿?') when v.evento_id is not null then 'eventos' else 'promos' end as cat_id,
           case when v.product_id is not null then coalesce(c.nombre, pr.categoria_id) when v.evento_id is not null then 'Eventos' else 'Promos' end as cat_nombre,
           case when v.product_id is not null then coalesce(c.orden, 999) when v.evento_id is not null then 1001 else 1000 end as cat_orden
    from vendido v
    left join public.products pr on pr.id = v.product_id
    left join public.menu_categories c on c.id = pr.categoria_id
    left join public.promotions po on po.id = v.promo_id
    left join public.eventos ev on ev.id = v.evento_id
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
        'clase', d.clase, 'id', coalesce(d.product_id::text, d.promo_id, d.evento_id::text), 'nombre', d.nombre, 'categoria', d.cat_nombre,
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
-- 9. Permisos explícitos (regla de ENTORNOS.md)
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."eventos" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."evento_items" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."evento_plazos" FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON TABLE "public"."eventos" TO "service_role";
GRANT ALL ON TABLE "public"."evento_items" TO "service_role";
GRANT ALL ON TABLE "public"."evento_plazos" TO "service_role";
-- Camareros y admins leen (RLS); nadie escribe directamente: todo va por las funciones.
GRANT SELECT ON TABLE "public"."eventos" TO "authenticated";
GRANT SELECT ON TABLE "public"."evento_items" TO "authenticated";
GRANT SELECT ON TABLE "public"."evento_plazos" TO "authenticated";

REVOKE ALL ON FUNCTION "public"."_evento_cuenta_pagada"() FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_evento_cuenta_pagada"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."_pos_crear_venta_lineas"("p_order" "public"."orders", "p_items" "uuid"[], "p_metodo" "text", "p_actor" "uuid", "p_client_request_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_pos_crear_venta_lineas"("p_order" "public"."orders", "p_items" "uuid"[], "p_metodo" "text", "p_actor" "uuid", "p_client_request_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."admin_guardar_evento"("p_id" "uuid", "p_datos" "jsonb") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_guardar_evento"("p_id" "uuid", "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_guardar_evento"("p_id" "uuid", "p_datos" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."admin_confirmar_evento"("p_id" "uuid") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_confirmar_evento"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_confirmar_evento"("p_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."admin_cancelar_evento"("p_id" "uuid", "p_motivo" "text") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."admin_cancelar_evento"("p_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_cancelar_evento"("p_id" "uuid", "p_motivo" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."pos_eventos"("p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_eventos"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_eventos"("p_desde" "date", "p_hasta" "date") TO "service_role";
REVOKE ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") TO "service_role";
REVOKE ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rentabilidad_resumen"("p_desde" "date", "p_hasta" "date") TO "service_role";


-- ---------------------------------------------------------------------
-- Pruebas manuales en PRUEBAS (SQL Editor, como admin y como camarero)
-- ---------------------------------------------------------------------
-- 1. select public.admin_guardar_evento(null, '{"nombre":"Cumple Laura","fecha":"2026-12-05","personas":25,"precio_centimos":30000,
--      "items":[{"concepto":"Barril Estrella 30 L","cantidad":1},{"product_id":55,"cantidad":20}],
--      "plazos":[{"nombre":"Señal","importe_centimos":10000},{"nombre":"Resto","importe_centimos":20000}]}'::jsonb);   → id
-- 2. Plazos que no suman (10000 + 15000 con precio 30000) → EVENTO_PLAZOS_NO_SUMAN.
-- 3. select public.admin_confirmar_evento('<id>');  dos veces → misma cuenta, 2 líneas «Evento · Cumple Laura — señal/resto».
-- 4. Como camarero: pos_cobrar_parte(<cuenta>, '[{"item_id":"<línea señal>","cantidad":1}]', 'efectivo', gen_random_uuid())
--    → venta de 100,00 € en la jornada de hoy (sales.jornada = _jornada_fecha()).
-- 5. Como camarero: pos_anular_linea(<línea resto>, 'x') → EVENTO_DESDE_PANEL; pos_cancelar_cuenta(<cuenta>, 'x') → EVENTO_DESDE_PANEL.
-- 6. pos_cerrar_jornada(hoy, null, null) no se bloquea por la cuenta del evento.
-- 7. Cobrar el resto → la cuenta se cierra y el evento pasa a «realizado».
-- 8. Otro evento con señal cobrada: admin_cancelar_evento(id, 'No vienen') → resto anulado, la señal se queda, evento «cancelado».
-- 9. Como socio: select * from public.eventos → 0 filas; select public.pos_eventos(...) → NO_ES_CAMARERO.
