


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_caducar_tickets"("p_user" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  n integer;
begin
  with caducados as (
    update public.tickets t
    set estado = 'caducado'
    where t.estado = 'disponible'
      and t.expires_at <= now()
      and (p_user is null or t.user_id = p_user)
    returning t.id
  )
  insert into public.ticket_events (ticket_id, tipo, detalle)
  select c.id, 'caducado', '{}'::jsonb from caducados c;

  get diagnostics n = row_count;
  return n;
end;
$$;


ALTER FUNCTION "public"."_caducar_tickets"("p_user" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "user_id" "uuid",
    "promo_id" "text" NOT NULL,
    "promo_nombre" "text" NOT NULL,
    "promo_descuento" "text" NOT NULL,
    "estado" "text" DEFAULT 'disponible'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "canjeado_at" timestamp with time zone,
    "canjeado_por" "uuid",
    "anulado_at" timestamp with time zone,
    "anulado_por" "uuid",
    "motivo_anulacion" "text",
    "importe_descuento_centimos" integer,
    "sale_id" "uuid",
    "order_item_id" "uuid",
    CONSTRAINT "tickets_codigo_check" CHECK (("codigo" ~ '^ALA-[2-9A-HJKMNP-Z]{4}$'::"text")),
    CONSTRAINT "tickets_estado_check" CHECK (("estado" = ANY (ARRAY['disponible'::"text", 'canjeado'::"text", 'caducado'::"text", 'anulado'::"text"]))),
    CONSTRAINT "tickets_importe_descuento_centimos_check" CHECK ((("importe_descuento_centimos" IS NULL) OR ("importe_descuento_centimos" >= 0)))
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


COMMENT ON TABLE "public"."tickets" IS 'Tickets de promos del club. Solo se crean/cambian mediante las funciones RPC.';



CREATE OR REPLACE FUNCTION "public"."_canjear_ticket"("p_ticket_id" "uuid", "p_camarero" "uuid", "p_importe" integer, "p_item" "uuid") RETURNS "public"."tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."_canjear_ticket"("p_ticket_id" "uuid", "p_camarero" "uuid", "p_importe" integer, "p_item" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_cierre_jornada"("p_at" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (public._jornada_fecha(p_at)
          + case when s.hora_cierre < time '12:00' then 1 else 0 end
          + s.hora_cierre
         ) at time zone 'Europe/Madrid'
  from public.app_settings s
  where s.id;
$$;


ALTER FUNCTION "public"."_cierre_jornada"("p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_fin_franja"("p_id" "text", "p_at" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  p       public.promotions%rowtype;
  v_local timestamp := p_at at time zone 'Europe/Madrid';
  t       time      := v_local::time;
  d       date      := v_local::date;
begin
  select * into p from public.promotions where id = p_id;
  if not found or p.hora_inicio is null then
    return null;
  end if;

  if p.hora_inicio < p.hora_fin or t < p.hora_fin then
    return (d + p.hora_fin) at time zone 'Europe/Madrid';        -- termina hoy
  end if;
  return (d + 1 + p.hora_fin) at time zone 'Europe/Madrid';      -- cruza la medianoche
end;
$$;


ALTER FUNCTION "public"."_fin_franja"("p_id" "text", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_generar_codigo_ticket"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  resultado text := '';
  bytes     bytea;
  b         integer;
  i         integer;
begin
  while length(resultado) < 4 loop
    bytes := extensions.gen_random_bytes(8);
    for i in 0 .. 7 loop
      b := get_byte(bytes, i);
      if b < 248 and length(resultado) < 4 then
        resultado := resultado || substr(alfabeto, (b % 31) + 1, 1);
      end if;
    end loop;
  end loop;
  return 'ALA-' || resultado;
end;
$$;


ALTER FUNCTION "public"."_generar_codigo_ticket"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_inicio_ventana_usos"("p_ventana" "text", "p_at" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  d date := public._jornada_fecha(p_at);
begin
  return case p_ventana
    when 'dia'    then public._jornada_inicio(d)
    when 'semana' then public._jornada_inicio(date_trunc('week', d)::date)   -- lunes
    when 'mes'    then public._jornada_inicio(date_trunc('month', d)::date)
    else '-infinity'::timestamptz                                           -- 'total'
  end;
end;
$$;


ALTER FUNCTION "public"."_inicio_ventana_usos"("p_ventana" "text", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_jornada_fecha"("p_at" timestamp with time zone DEFAULT "now"()) RETURNS "date"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select ((p_at at time zone 'Europe/Madrid')
          - case when s.hora_cierre < time '12:00' then s.hora_cierre - time '00:00' else interval '0' end
         )::date
  from public.app_settings s
  where s.id;
$$;


ALTER FUNCTION "public"."_jornada_fecha"("p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_jornada_inicio"("p_fecha" "date") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (p_fecha
          + case when s.hora_cierre < time '12:00' then s.hora_cierre else time '00:00' end
         ) at time zone 'Europe/Madrid'
  from public.app_settings s
  where s.id;
$$;


ALTER FUNCTION "public"."_jornada_inicio"("p_fecha" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_normalizar_codigo"("p_codigo" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select case
    when upper(trim(coalesce(p_codigo, ''))) ~ '^[2-9A-HJKMNP-Z]{4}$' then 'ALA-' || upper(trim(p_codigo))
    else upper(trim(coalesce(p_codigo, '')))
  end;
$_$;


ALTER FUNCTION "public"."_normalizar_codigo"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_cantidad"("p_e" "jsonb") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select case when (p_e ->> 'cantidad') ~ '^[0-9]{1,3}$' then (p_e ->> 'cantidad')::integer else -1 end;
$_$;


ALTER FUNCTION "public"."_pos_cantidad"("p_e" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "origen" "text" NOT NULL,
    "estado" "text" DEFAULT 'abierta'::"text" NOT NULL,
    "abierta_por" "uuid",
    "jornada" "date" NOT NULL,
    "client_request_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mesa_id" "uuid",
    CONSTRAINT "orders_estado_check" CHECK (("estado" = ANY (ARRAY['abierta'::"text", 'pagada'::"text", 'cancelada'::"text"]))),
    CONSTRAINT "orders_mesa_check" CHECK ((("origen" = 'mesa'::"text") = ("mesa_id" IS NOT NULL))),
    CONSTRAINT "orders_origen_check" CHECK (("origen" = ANY (ARRAY['barra'::"text", 'mesa'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") RETURNS "uuid"
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


ALTER FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_cuenta_abierta"("p_order_id" "uuid") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'CUENTA_NO_EXISTE'; end if;
  if o.estado <> 'abierta' then raise exception 'CUENTA_CERRADA'; end if;
  return o;
end;
$$;


ALTER FUNCTION "public"."_pos_cuenta_abierta"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_exigir_camarero"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;


ALTER FUNCTION "public"."_pos_exigir_camarero"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_exigir_personal"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (public.is_camarero() or public.is_admin()) then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;


ALTER FUNCTION "public"."_pos_exigir_personal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_items_validos"("p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."_pos_items_validos"("p_items" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" integer,
    "promo_id" "text",
    "nombre" "text" NOT NULL,
    "precio_unitario_centimos" integer NOT NULL,
    "tipo_linea" "text" DEFAULT 'producto'::"text" NOT NULL,
    "cantidad" integer NOT NULL,
    "notas" "text",
    "pedido_por" "uuid",
    "anadida_por" "uuid",
    "estado" "text" DEFAULT 'aceptada'::"text" NOT NULL,
    "ticket_id" "uuid",
    "descuento_centimos" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ronda" "uuid",
    "pedido_por_nombre" "text",
    "ticket_codigo" "text",
    "mesa_a_mano" boolean DEFAULT false NOT NULL,
    CONSTRAINT "order_items_cantidad_check" CHECK ((("cantidad" >= 1) AND ("cantidad" <= 99))),
    CONSTRAINT "order_items_descuento_centimos_check" CHECK ((("descuento_centimos" IS NULL) OR ("descuento_centimos" >= 0))),
    CONSTRAINT "order_items_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aceptada'::"text", 'servida'::"text", 'anulada'::"text"]))),
    CONSTRAINT "order_items_precio_unitario_centimos_check" CHECK (("precio_unitario_centimos" >= 0)),
    CONSTRAINT "order_items_producto_o_promo" CHECK ((("product_id" IS NULL) <> ("promo_id" IS NULL))),
    CONSTRAINT "order_items_tipo_linea_check" CHECK (("tipo_linea" = ANY (ARRAY['producto'::"text", 'pack'::"text", 'obsequio'::"text", 'sorteo'::"text"])))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."order_items"."descuento_centimos" IS 'Ahorro de la línea entera (por unidad × cantidad). Null si la promo no tiene contenido definido.';



CREATE OR REPLACE FUNCTION "public"."_pos_liberar_ticket"("p_item" "public"."order_items", "p_actor" "uuid", "p_motivo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."_pos_liberar_ticket"("p_item" "public"."order_items", "p_actor" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_linea_promo"("p_order_id" "uuid", "p_promo_id" "text", "p_cantidad" integer, "p_notas" "text", "p_ticket_codigo" "text", "p_estado" "text", "p_actor" "uuid", "p_socio" boolean, "p_socio_nombre" "text", "p_ronda" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."_pos_linea_promo"("p_order_id" "uuid", "p_promo_id" "text", "p_cantidad" integer, "p_notas" "text", "p_ticket_codigo" "text", "p_estado" "text", "p_actor" "uuid", "p_socio" boolean, "p_socio_nombre" "text", "p_ronda" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) RETURNS "jsonb"
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


ALTER FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_promo_descuento_unidad"("p_promo_id" "text", "p_precio" integer) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when count(*) = 0 or bool_or(pr.precio_centimos is null) or p_precio is null then null
    else greatest(sum(pi.cantidad * pr.precio_centimos) - p_precio, 0)::integer
  end
  from public.promotion_items pi
  join public.products pr on pr.id = pi.product_id
  where pi.promo_id = p_promo_id;
$$;


ALTER FUNCTION "public"."_promo_descuento_unidad"("p_promo_id" "text", "p_precio" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with v as (
    select s.* from public.sales s where s.jornada between p_desde and p_hasta
  ),
  d as (
    select r.importe_centimos, s.metodo
    from public.sale_refunds r
    join public.sales s on s.id = r.sale_id
    where public._jornada_fecha(r.at) between p_desde and p_hasta
  ),
  a as (
    select e.* from public.pos_events e
    where e.tipo = 'linea_anulada' and e.detalle ? 'estado_anterior'
      and public._jornada_fecha(e.at) between p_desde and p_hasta
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
    'ultima_venta_at', (select max(cobrado_at) from v)
  );
$$;


ALTER FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_socio_pedir_ronda"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid", "p_a_mano" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."_socio_pedir_ronda"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid", "p_a_mano" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_ticket_motivo"("p_t" "public"."tickets", "p_camarero" "uuid", "p_item" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."_ticket_motivo"("p_t" "public"."tickets", "p_camarero" "uuid", "p_item" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_token_mesa"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  -- 16 caracteres aleatorios aptos para una URL (base64url de 12 bytes).
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_');
$$;


ALTER FUNCTION "public"."_token_mesa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aceptar_privacidad"("p_acepta_email" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NO_AUTENTICADO' using errcode = '42501';
  end if;

  update public.profiles
  set acepta_privacidad_at = coalesce(acepta_privacidad_at, now()),
      acepta_email = coalesce(p_acepta_email, false)
  where id = uid;

  if not found then
    raise exception 'USUARIO_NO_EXISTE';
  end if;
end;
$$;


ALTER FUNCTION "public"."aceptar_privacidad"("p_acepta_email" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_devolver_venta"("p_sale_id" "uuid", "p_importe_centimos" integer, "p_motivo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."admin_devolver_venta"("p_sale_id" "uuid", "p_importe_centimos" integer, "p_motivo" "text") OWNER TO "postgres";


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
    join v on v.order_id = oi.order_id
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


ALTER FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_users"() RETURNS TABLE("id" "uuid", "nombre" "text", "email" "text", "telefono" "text", "fecha_nacimiento" "date", "acepta_email" boolean, "acepta_whatsapp" boolean, "role" "text", "es_camarero" boolean, "created_at" timestamp with time zone, "email_confirmed_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Acceso solo para administradores' using errcode = '42501';
  end if;

  return query
    select p.id, p.nombre, u.email::text, p.telefono, p.fecha_nacimiento,
           p.acepta_email, p.acepta_whatsapp, p.role, p.es_camarero,
           p.created_at, u.email_confirmed_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_list_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_regenerar_qr_mesa"("p_mesa_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_token text;
begin
  if not public.is_admin() then raise exception 'NO_ES_ADMIN' using errcode = '42501'; end if;
  update public.mesas set token = public._token_mesa() where id = p_mesa_id returning token into v_token;
  if v_token is null then raise exception 'MESA_NO_EXISTE'; end if;
  return v_token;
end;
$$;


ALTER FUNCTION "public"."admin_regenerar_qr_mesa"("p_mesa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reopen_ticket"("p_id" "uuid", "p_motivo" "text") RETURNS "public"."tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."admin_reopen_ticket"("p_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_camarero"("p_user" "uuid", "p_valor" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;

  update public.profiles set es_camarero = p_valor where id = p_user;
  if not found then
    raise exception 'USUARIO_NO_EXISTE';
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_set_camarero"("p_user" "uuid", "p_valor" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_ticket_stats"("p_desde" timestamp with time zone DEFAULT ("now"() - '30 days'::interval), "p_hasta" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("promo_id" "text", "promo_nombre" "text", "generados" bigint, "canjeados" bigint, "caducados" bigint, "anulados" bigint, "canjes_por_hora" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;

  return query
    select
      pr.id,
      pr.nombre,
      count(tk.id) filter (where tk.created_at  >= p_desde and tk.created_at  < p_hasta),
      count(tk.id) filter (where tk.canjeado_at >= p_desde and tk.canjeado_at < p_hasta),
      count(tk.id) filter (where (tk.estado = 'caducado' or (tk.estado = 'disponible' and tk.expires_at <= now()))
                             and tk.expires_at >= p_desde and tk.expires_at < p_hasta),
      count(tk.id) filter (where tk.anulado_at  >= p_desde and tk.anulado_at  < p_hasta),
      coalesce((
        select jsonb_object_agg(h.hora, h.n)
        from (
          select extract(hour from t2.canjeado_at at time zone 'Europe/Madrid')::integer as hora, count(*) as n
          from public.tickets t2
          where t2.promo_id = pr.id and t2.canjeado_at >= p_desde and t2.canjeado_at < p_hasta
          group by 1
        ) h
      ), '{}'::jsonb)
    from public.promotions pr
    left join public.tickets tk on tk.promo_id = pr.id
    group by pr.id, pr.nombre
    order by pr.nombre;
end;
$$;


ALTER FUNCTION "public"."admin_ticket_stats"("p_desde" timestamp with time zone, "p_hasta" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_void_ticket"("p_id" "uuid", "p_motivo" "text") RETURNS "public"."tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := auth.uid();
  t   public.tickets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_OBLIGATORIO';
  end if;

  update public.tickets tk
  set estado = 'anulado', anulado_at = now(), anulado_por = uid, motivo_anulacion = trim(p_motivo)
  where tk.id = p_id and tk.estado = 'disponible'
  returning * into t;

  if not found then
    if not exists (select 1 from public.tickets tk where tk.id = p_id) then
      raise exception 'TICKET_NO_EXISTE';
    end if;
    raise exception 'TICKET_NO_DISPONIBLE';
  end if;

  insert into public.ticket_events (ticket_id, tipo, actor, detalle)
  values (t.id, 'anulado', uid, jsonb_build_object('motivo', trim(p_motivo)));
  return t;
end;
$$;


ALTER FUNCTION "public"."admin_void_ticket"("p_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."catalogo"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'version', 1,
    'generado_at', now(),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'orden', c.orden) order by c.orden, c.id)
      from public.menu_categories c
      where c.visible
    ), '[]'::jsonb),
    'secciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'categoria_id', s.categoria_id, 'nombre', s.nombre, 'subtitulo', s.subtitulo, 'orden', s.orden
      ) order by s.orden, s.id)
      from public.menu_sections s
      where s.visible
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'categoria_id', p.categoria_id, 'seccion_id', p.seccion_id, 'nombre', p.nombre,
        'descripcion', p.descripcion, 'precio_centimos', p.precio_centimos, 'recomendado', p.recomendado,
        'disponible', p.disponible, 'orden', p.orden
      ) order by p.orden, p.id)
      from public.products p
      where p.activo
    ), '[]'::jsonb),
    'franjas', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre, 'publico', f.publico, 'orden', f.orden)
                       order by f.orden, f.id)
      from public.promo_segments f
      where f.visible
    ), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nombre', p.nombre, 'tipo', p.tipo, 'solo_club', p.solo_club,
        'precio_centimos', p.precio_centimos, 'descuento_pct', p.descuento_pct,
        'descripcion', p.descripcion, 'contenidos', to_jsonb(p.contenidos), 'personas', p.personas,
        'texto_horario', p.texto_horario, 'mensaje_reserva', p.mensaje_reserva,
        'visible_hasta', p.visible_hasta, 'exclusiva', p.exclusiva, 'orden', p.orden,
        'inicio', p.inicio, 'fin', p.fin, 'dias_semana', to_jsonb(p.dias_semana),
        'hora_inicio', p.hora_inicio, 'hora_fin', p.hora_fin,
        'franjas', coalesce((
          select jsonb_agg(ps.segment_id order by ps.segment_id)
          from public.promotion_segments ps where ps.promo_id = p.id
        ), '[]'::jsonb),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('product_id', pi.product_id, 'cantidad', pi.cantidad) order by pi.product_id)
          from public.promotion_items pi where pi.promo_id = p.id
        ), '[]'::jsonb)
      ) order by p.orden, p.id)
      from public.promotions p
      where p.publicada
    ), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."catalogo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cierres_jornada_inmutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CIERRE_INMUTABLE' using errcode = '42501';
  end if;
  -- Única excepción: si se borra la cuenta de quien cerró, su id pasa a null.
  if (to_jsonb(new) - 'cerrado_por') is distinct from (to_jsonb(old) - 'cerrado_por')
     or (new.cerrado_por is distinct from old.cerrado_por and new.cerrado_por is not null) then
    raise exception 'CIERRE_INMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."cierres_jornada_inmutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ticket"("p_promo_id" "text") RETURNS "public"."tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid      uuid := auth.uid();
  p        public.promotions%rowtype;
  usados   integer;
  margen   integer;
  caduca   timestamptz;
  nuevo    public.tickets%rowtype;
  intento  integer := 0;
  restr    text;
begin
  if uid is null then
    raise exception 'NO_AUTENTICADO' using errcode = '42501';
  end if;

  -- Antes de nada, se ponen al día sus tickets caducados.
  perform public._caducar_tickets(uid);

  select * into p from public.promotions where id = p_promo_id;
  if not found then raise exception 'PROMO_NO_EXISTE'; end if;
  if not p.solo_club then raise exception 'PROMO_NO_CLUB'; end if;
  if not p.activa then raise exception 'PROMO_INACTIVA'; end if;
  if not public.promo_activa(p.id) then raise exception 'PROMO_FUERA_DE_HORARIO'; end if;

  if exists (
    select 1 from public.tickets t
    where t.user_id = uid and t.promo_id = p.id and t.estado = 'disponible'
  ) then
    raise exception 'TICKET_YA_DISPONIBLE';
  end if;

  -- Límite de usos: cuentan los canjeados dentro de la ventana.
  if p.max_usos is not null then
    select count(*) into usados
    from public.tickets t
    where t.user_id = uid
      and t.promo_id = p.id
      and t.estado in ('canjeado', 'disponible')
      and t.created_at >= public._inicio_ventana_usos(p.ventana_usos);
    if usados >= p.max_usos then
      raise exception 'LIMITE_USOS';
    end if;
  end if;

  -- Caducidad: lo primero que llegue entre el fin de la franja, el fin
  -- de la promo y el cierre de la jornada, más el margen de cortesía.
  select s.margen_cortesia_min into margen from public.app_settings s where s.id;
  caduca := least(public._fin_franja(p.id), p.fin, public._cierre_jornada())
            + make_interval(mins => coalesce(margen, 0));

  -- Inserta con un código nuevo; si coincide con uno existente, reintenta.
  loop
    intento := intento + 1;
    begin
      insert into public.tickets (codigo, user_id, promo_id, promo_nombre, promo_descuento, expires_at)
      values (public._generar_codigo_ticket(), uid, p.id, p.nombre, p.descuento_texto, caduca)
      returning * into nuevo;
      exit;
    exception when unique_violation then
      get stacked diagnostics restr = constraint_name;
      if restr = 'tickets_un_disponible_por_promo' then
        raise exception 'TICKET_YA_DISPONIBLE';   -- dos peticiones a la vez
      end if;
      if intento >= 20 then
        raise;
      end if;
    end;
  end loop;

  insert into public.ticket_events (ticket_id, tipo, actor, detalle)
  values (nuevo.id, 'creado', uid, jsonb_build_object('expires_at', nuevo.expires_at));

  return nuevo;
end;
$$;


ALTER FUNCTION "public"."create_ticket"("p_promo_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No hay ninguna sesión iniciada';
  end if;

  delete from auth.users where id = uid;
end;
$$;


ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, nombre, acepta_email, acepta_privacidad_at, role)
  values (
    new.id,
    nullif(trim(coalesce(meta->>'nombre', meta->>'full_name', meta->>'name', '')), ''),
    coalesce(meta->>'acepta_email', '') = 'true',
    case when coalesce(meta->>'acepta_privacidad', '') = 'true' then now() end,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_camarero"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and es_camarero
  );
$$;


ALTER FUNCTION "public"."is_camarero"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_ticket"("p_codigo" "text") RETURNS TABLE("valido" boolean, "motivo" "text", "codigo" "text", "estado" "text", "promo_id" "text", "promo_nombre" "text", "promo_descuento" "text", "socio_nombre" "text", "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "canjeado_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."lookup_ticket"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mesa_info"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('id', m.id, 'nombre', m.nombre, 'activa', m.activa)
  from public.mesas m
  where m.token = p_token;
$$;


ALTER FUNCTION "public"."mesa_info"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mesas_para_pedir"() RETURNS TABLE("id" "uuid", "nombre" "text", "orden" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select m.id, m.nombre, m.orden
  from public.mesas m
  where m.activa and auth.uid() is not null
  order by m.orden, m.nombre;
$$;


ALTER FUNCTION "public"."mesas_para_pedir"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_abrir_mesa"("p_mesa_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pos_abrir_mesa"("p_mesa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_aceptar_ronda"("p_order_id" "uuid", "p_ronda" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pos_aceptar_ronda"("p_order_id" "uuid", "p_ronda" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_anadir_lineas"("p_order_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."pos_anadir_lineas"("p_order_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") OWNER TO "postgres";


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

  update public.order_items set estado = 'anulada' where id = li.id;
  perform public._pos_liberar_ticket(li, uid, trim(p_motivo));
  insert into public.pos_events (order_id, item_id, tipo, actor, detalle)
  values (li.order_id, li.id, 'linea_anulada', uid,
          jsonb_strip_nulls(jsonb_build_object('motivo', trim(p_motivo), 'estado_anterior', li.estado, 'producto', li.nombre,
                             'cantidad', li.cantidad, 'importe_centimos', li.precio_unitario_centimos * li.cantidad,
                             'ticket', li.ticket_codigo)));
end;
$$;


ALTER FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_cambiar_mesa"("p_order_id" "uuid", "p_mesa_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pos_cambiar_mesa"("p_order_id" "uuid", "p_mesa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cierres_jornada" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jornada" "date" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "cerrado_por" "uuid",
    "cerrado_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ventas" integer NOT NULL,
    "cobrado_centimos" integer NOT NULL,
    "descuentos_centimos" integer NOT NULL,
    "devuelto_centimos" integer NOT NULL,
    "neto_centimos" integer NOT NULL,
    "efectivo_neto_centimos" integer NOT NULL,
    "efectivo_contado_centimos" integer,
    "descuadre_centimos" integer,
    "notas" "text",
    "resumen" "jsonb" NOT NULL,
    CONSTRAINT "cierres_jornada_efectivo_contado_centimos_check" CHECK ((("efectivo_contado_centimos" IS NULL) OR ("efectivo_contado_centimos" >= 0))),
    CONSTRAINT "cierres_jornada_notas_check" CHECK ((("notas" IS NULL) OR ("length"("notas") <= 500))),
    CONSTRAINT "cierres_jornada_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."cierres_jornada" OWNER TO "postgres";


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
  where o.estado = 'abierta' and o.jornada <= p_jornada;
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


ALTER FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") OWNER TO "postgres";


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
  where o.estado = 'abierta' and o.jornada <= p_jornada;

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


ALTER FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_jornadas_sin_cerrar"() RETURNS TABLE("jornada" "date", "ventas" bigint, "actual" boolean, "cerrada" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
declare
  hoy date := public._jornada_fecha();
begin
  perform public._pos_exigir_personal();
  return query
    select j.jornada, (select count(*) from public.sales s where s.jornada = j.jornada), j.jornada = hoy,
           exists (select 1 from public.cierres_jornada c where c.jornada = j.jornada)
    from (
      select s.jornada from public.sales s where s.jornada between hoy - 14 and hoy
      union
      select hoy
    ) j
    where j.jornada = hoy or not exists (select 1 from public.cierres_jornada c where c.jornada = j.jornada)
    order by j.jornada desc;
end;
$$;


ALTER FUNCTION "public"."pos_jornadas_sin_cerrar"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_rechazar_ronda"("p_order_id" "uuid", "p_ronda" "uuid", "p_motivo" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pos_rechazar_ronda"("p_order_id" "uuid", "p_ronda" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_servir_lineas"("p_item_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pos_servir_lineas"("p_item_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_venta_barra"("p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."pos_venta_barra"("p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone DEFAULT "now"()) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  p       public.promotions%rowtype;
  v_local timestamp := p_at at time zone 'Europe/Madrid';
  t       time      := v_local::time;
  dia     integer   := extract(isodow from v_local)::integer;
  previo  integer   := case when dia = 1 then 7 else dia - 1 end;
begin
  select * into p from public.promotions where id = p_id;
  if not found or not p.activa then
    return false;
  end if;

  if p.inicio is not null and p_at < p.inicio then return false; end if;
  if p.fin    is not null and p_at >= p.fin   then return false; end if;

  -- Sin franja: vale todo el día (de los días indicados).
  if p.hora_inicio is null then
    return p.dias_semana is null or dia = any (p.dias_semana);
  end if;

  -- Franja normal, p. ej. 16:00–20:00.
  if p.hora_inicio < p.hora_fin then
    return (p.dias_semana is null or dia = any (p.dias_semana))
       and t >= p.hora_inicio and t < p.hora_fin;
  end if;

  -- Franja que cruza la medianoche, p. ej. 20:00–03:00.
  return ((p.dias_semana is null or dia    = any (p.dias_semana)) and t >= p.hora_inicio)
      or ((p.dias_semana is null or previo = any (p.dias_semana)) and t <  p.hora_fin);
end;
$$;


ALTER FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promos_estado"() RETURNS TABLE("id" "text", "solo_club" boolean, "activa" boolean, "disponible_ahora" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p.id, p.solo_club, p.activa, public.promo_activa(p.id)
  from public.promotions p
  where p.publicada or public.is_admin();
$$;


ALTER FUNCTION "public"."promos_estado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if (new.role is distinct from old.role or new.es_camarero is distinct from old.es_camarero)
     and current_user in ('anon', 'authenticated') then
    raise exception 'No está permitido cambiar el rol ni el permiso de camarero desde la web'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_ticket"("p_codigo" "text", "p_importe_centimos" integer DEFAULT NULL::integer) RETURNS "public"."tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."redeem_ticket"("p_codigo" "text", "p_importe_centimos" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sale_refunds_inmutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."sale_refunds_inmutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sales_inmutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."sales_inmutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_by"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_by = auth.uid();   -- null si el cambio se hace desde el SQL Editor
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."socio_pedir_ronda"("p_token" "text", "p_items" "jsonb", "p_client_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_mesa uuid;
begin
  if auth.uid() is null then raise exception 'NO_AUTENTICADO' using errcode = '42501'; end if;
  select id into v_mesa from public.mesas where token = p_token;
  if not found then raise exception 'MESA_NO_EXISTE'; end if;
  return public._socio_pedir_ronda(v_mesa, p_items, p_client_request_id, false);
end;
$$;


ALTER FUNCTION "public"."socio_pedir_ronda"("p_token" "text", "p_items" "jsonb", "p_client_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."socio_pedir_ronda_mesa"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null then raise exception 'NO_AUTENTICADO' using errcode = '42501'; end if;
  return public._socio_pedir_ronda(p_mesa_id, p_items, p_client_request_id, true);
end;
$$;


ALTER FUNCTION "public"."socio_pedir_ronda_mesa"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "hora_cierre" time without time zone DEFAULT '03:00:00'::time without time zone NOT NULL,
    "margen_cortesia_min" integer DEFAULT 30 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_settings_id_check" CHECK ("id"),
    CONSTRAINT "app_settings_margen_cortesia_min_check" CHECK ((("margen_cortesia_min" >= 0) AND ("margen_cortesia_min" <= 240)))
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalogo_migraciones" (
    "id" "text" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."catalogo_migraciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "menu_categories_id_check" CHECK (("id" ~ '^[a-z0-9-]+$'::"text"))
);


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_sections" (
    "id" "text" NOT NULL,
    "categoria_id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "subtitulo" "text",
    "orden" integer DEFAULT 0 NOT NULL,
    "visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "menu_sections_id_check" CHECK (("id" ~ '^[a-z0-9-]+$'::"text"))
);


ALTER TABLE "public"."menu_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mesas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "token" "text" DEFAULT "public"."_token_mesa"() NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mesas_nombre_check" CHECK (("length"(TRIM(BOTH FROM "nombre")) > 0))
);


ALTER TABLE "public"."mesas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_events" (
    "id" bigint NOT NULL,
    "order_id" "uuid",
    "item_id" "uuid",
    "sale_id" "uuid",
    "tipo" "text" NOT NULL,
    "actor" "uuid",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "detalle" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "pos_events_tipo_check" CHECK (("tipo" = ANY (ARRAY['abierta'::"text", 'linea_anadida'::"text", 'linea_aceptada'::"text", 'linea_servida'::"text", 'linea_anulada'::"text", 'pagada'::"text", 'cancelada'::"text", 'devuelta'::"text", 'mesa_cambiada'::"text"])))
);


ALTER TABLE "public"."pos_events" OWNER TO "postgres";


ALTER TABLE "public"."pos_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."pos_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pos_solicitudes" (
    "id" "uuid" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_solicitudes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "categoria_id" "text" NOT NULL,
    "seccion_id" "text",
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "precio_centimos" integer,
    "recomendado" boolean DEFAULT false NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "disponible" boolean DEFAULT true NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "id" integer NOT NULL,
    CONSTRAINT "products_precio_centimos_check" CHECK ((("precio_centimos" IS NULL) OR ("precio_centimos" >= 0)))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


ALTER TABLE "public"."products" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nombre" "text",
    "telefono" "text",
    "fecha_nacimiento" "date",
    "acepta_email" boolean DEFAULT false NOT NULL,
    "acepta_whatsapp" boolean DEFAULT false NOT NULL,
    "acepta_privacidad_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "es_camarero" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Perfil de cada miembro del club de La Alameda.';



COMMENT ON COLUMN "public"."profiles"."role" IS 'user = cliente; admin = puede ver el panel de socios. Se cambia solo desde el panel de Supabase.';



COMMENT ON COLUMN "public"."profiles"."es_camarero" IS 'Puede canjear tickets en el bar. Se cambia desde el panel de Supabase o con admin_set_camarero().';



CREATE TABLE IF NOT EXISTS "public"."promo_segments" (
    "id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "publico" "text",
    "orden" integer DEFAULT 0 NOT NULL,
    "visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promo_segments_id_check" CHECK (("id" ~ '^[a-z0-9-]+$'::"text"))
);


ALTER TABLE "public"."promo_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotion_items" (
    "promo_id" "text" NOT NULL,
    "cantidad" integer DEFAULT 1 NOT NULL,
    "product_id" integer NOT NULL,
    CONSTRAINT "promotion_items_cantidad_check" CHECK (("cantidad" > 0))
);


ALTER TABLE "public"."promotion_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotion_segments" (
    "promo_id" "text" NOT NULL,
    "segment_id" "text" NOT NULL
);


ALTER TABLE "public"."promotion_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "descuento_texto" "text" DEFAULT ''::"text" NOT NULL,
    "solo_club" boolean DEFAULT true NOT NULL,
    "activa" boolean DEFAULT false NOT NULL,
    "inicio" timestamp with time zone,
    "fin" timestamp with time zone,
    "dias_semana" integer[],
    "hora_inicio" time without time zone,
    "hora_fin" time without time zone,
    "max_usos" integer,
    "ventana_usos" "text" DEFAULT 'dia'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "publicada" boolean DEFAULT true NOT NULL,
    "tipo" "text" DEFAULT 'pack'::"text" NOT NULL,
    "precio_centimos" integer,
    "descuento_pct" integer,
    "descripcion" "text",
    "contenidos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "personas" integer,
    "texto_horario" "text",
    "mensaje_reserva" "text",
    "visible_hasta" timestamp with time zone,
    "exclusiva" boolean DEFAULT false NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "promotions_descuento_check" CHECK ((("descuento_pct" IS NULL) OR (("descuento_pct" >= 0) AND ("descuento_pct" <= 100)))),
    CONSTRAINT "promotions_dias_semana_check" CHECK ((("dias_semana" IS NULL) OR ("dias_semana" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]))),
    CONSTRAINT "promotions_franja_check" CHECK ((("hora_inicio" IS NULL) = ("hora_fin" IS NULL))),
    CONSTRAINT "promotions_max_usos_check" CHECK ((("max_usos" IS NULL) OR ("max_usos" > 0))),
    CONSTRAINT "promotions_periodo_check" CHECK ((("inicio" IS NULL) OR ("fin" IS NULL) OR ("inicio" < "fin"))),
    CONSTRAINT "promotions_personas_check" CHECK ((("personas" IS NULL) OR ("personas" > 0))),
    CONSTRAINT "promotions_precio_check" CHECK ((("precio_centimos" IS NULL) OR ("precio_centimos" >= 0))),
    CONSTRAINT "promotions_tipo_check" CHECK (("tipo" = ANY (ARRAY['pack'::"text", 'obsequio'::"text", 'sorteo'::"text"]))),
    CONSTRAINT "promotions_ventana_usos_check" CHECK (("ventana_usos" = ANY (ARRAY['total'::"text", 'dia'::"text", 'semana'::"text", 'mes'::"text"])))
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


COMMENT ON TABLE "public"."promotions" IS 'Promos del bar. Mismo id que src/data/promos.ts. activa = interruptor manual.';



CREATE TABLE IF NOT EXISTS "public"."sale_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "importe_centimos" integer NOT NULL,
    "motivo" "text" NOT NULL,
    "por" "uuid",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sale_refunds_importe_centimos_check" CHECK (("importe_centimos" > 0)),
    CONSTRAINT "sale_refunds_motivo_check" CHECK (("length"(TRIM(BOTH FROM "motivo")) > 0))
);


ALTER TABLE "public"."sale_refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero" bigint NOT NULL,
    "order_id" "uuid" NOT NULL,
    "bruto_centimos" integer NOT NULL,
    "descuentos_centimos" integer DEFAULT 0 NOT NULL,
    "total_centimos" integer NOT NULL,
    "metodo" "text" NOT NULL,
    "cobrado_por" "uuid",
    "cobrado_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "jornada" "date" NOT NULL,
    CONSTRAINT "sales_bruto_centimos_check" CHECK (("bruto_centimos" >= 0)),
    CONSTRAINT "sales_descuentos_centimos_check" CHECK (("descuentos_centimos" >= 0)),
    CONSTRAINT "sales_metodo_check" CHECK (("metodo" = ANY (ARRAY['efectivo'::"text", 'tarjeta'::"text", 'otro'::"text"]))),
    CONSTRAINT "sales_total_centimos_check" CHECK (("total_centimos" >= 0))
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


ALTER TABLE "public"."sales" ALTER COLUMN "numero" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sales_numero_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ticket_events" (
    "id" bigint NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "actor" "uuid",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "detalle" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "ticket_events_tipo_check" CHECK (("tipo" = ANY (ARRAY['creado'::"text", 'canjeado'::"text", 'caducado'::"text", 'anulado'::"text", 'reabierto'::"text"])))
);


ALTER TABLE "public"."ticket_events" OWNER TO "postgres";


ALTER TABLE "public"."ticket_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ticket_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalogo_migraciones"
    ADD CONSTRAINT "catalogo_migraciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cierres_jornada"
    ADD CONSTRAINT "cierres_jornada_jornada_version_key" UNIQUE ("jornada", "version");



ALTER TABLE ONLY "public"."cierres_jornada"
    ADD CONSTRAINT "cierres_jornada_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_sections"
    ADD CONSTRAINT "menu_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_client_request_id_key" UNIQUE ("client_request_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_events"
    ADD CONSTRAINT "pos_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_solicitudes"
    ADD CONSTRAINT "pos_solicitudes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promo_segments"
    ADD CONSTRAINT "promo_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_items"
    ADD CONSTRAINT "promotion_items_pkey" PRIMARY KEY ("promo_id", "product_id");



ALTER TABLE ONLY "public"."promotion_segments"
    ADD CONSTRAINT "promotion_segments_pkey" PRIMARY KEY ("promo_id", "segment_id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_refunds"
    ADD CONSTRAINT "sale_refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_numero_key" UNIQUE ("numero");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



CREATE INDEX "cierres_jornada_jornada_idx" ON "public"."cierres_jornada" USING "btree" ("jornada" DESC, "version" DESC);



CREATE INDEX "order_items_order_idx" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "order_items_pedido_por_idx" ON "public"."order_items" USING "btree" ("pedido_por");



CREATE INDEX "order_items_ronda_idx" ON "public"."order_items" USING "btree" ("order_id", "ronda");



CREATE UNIQUE INDEX "order_items_un_ticket_vivo" ON "public"."order_items" USING "btree" ("ticket_id") WHERE (("ticket_id" IS NOT NULL) AND ("estado" <> 'anulada'::"text"));



CREATE INDEX "orders_jornada_idx" ON "public"."orders" USING "btree" ("jornada", "created_at" DESC);



CREATE UNIQUE INDEX "orders_una_abierta_por_mesa" ON "public"."orders" USING "btree" ("mesa_id") WHERE ("estado" = 'abierta'::"text");



CREATE INDEX "pos_events_order_idx" ON "public"."pos_events" USING "btree" ("order_id", "at");



CREATE INDEX "products_categoria_idx" ON "public"."products" USING "btree" ("categoria_id", "orden");



CREATE INDEX "sale_refunds_sale_idx" ON "public"."sale_refunds" USING "btree" ("sale_id");



CREATE INDEX "sales_cobrado_idx" ON "public"."sales" USING "btree" ("cobrado_at" DESC);



CREATE INDEX "sales_jornada_idx" ON "public"."sales" USING "btree" ("jornada");



CREATE INDEX "ticket_events_ticket_idx" ON "public"."ticket_events" USING "btree" ("ticket_id", "at");



CREATE INDEX "tickets_order_item_idx" ON "public"."tickets" USING "btree" ("order_item_id");



CREATE INDEX "tickets_promo_created_idx" ON "public"."tickets" USING "btree" ("promo_id", "created_at" DESC);



CREATE UNIQUE INDEX "tickets_un_disponible_por_promo" ON "public"."tickets" USING "btree" ("user_id", "promo_id") WHERE ("estado" = 'disponible'::"text");



CREATE INDEX "tickets_user_created_idx" ON "public"."tickets" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "app_settings_set_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "cierres_jornada_inmutable" BEFORE DELETE OR UPDATE ON "public"."cierres_jornada" FOR EACH ROW EXECUTE FUNCTION "public"."cierres_jornada_inmutable"();



CREATE OR REPLACE TRIGGER "menu_categories_set_updated_at" BEFORE UPDATE ON "public"."menu_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "menu_sections_set_updated_at" BEFORE UPDATE ON "public"."menu_sections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "mesas_set_updated_at" BEFORE UPDATE ON "public"."mesas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "order_items_set_updated_at" BEFORE UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "orders_set_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "products_set_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "products_set_updated_by" BEFORE INSERT OR UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_by"();



CREATE OR REPLACE TRIGGER "profiles_protect_role" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_role"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "promo_segments_set_updated_at" BEFORE UPDATE ON "public"."promo_segments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "promotions_set_updated_at" BEFORE UPDATE ON "public"."promotions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "promotions_set_updated_by" BEFORE INSERT OR UPDATE ON "public"."promotions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_by"();



CREATE OR REPLACE TRIGGER "sale_refunds_inmutable" BEFORE DELETE OR UPDATE ON "public"."sale_refunds" FOR EACH ROW EXECUTE FUNCTION "public"."sale_refunds_inmutable"();



CREATE OR REPLACE TRIGGER "sales_inmutable" BEFORE DELETE OR UPDATE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."sales_inmutable"();



ALTER TABLE ONLY "public"."cierres_jornada"
    ADD CONSTRAINT "cierres_jornada_cerrado_por_fkey" FOREIGN KEY ("cerrado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_sections"
    ADD CONSTRAINT "menu_sections_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."menu_categories"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_anadida_por_fkey" FOREIGN KEY ("anadida_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pedido_por_fkey" FOREIGN KEY ("pedido_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "public"."promotions"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_abierta_por_fkey" FOREIGN KEY ("abierta_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_events"
    ADD CONSTRAINT "pos_events_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_events"
    ADD CONSTRAINT "pos_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_events"
    ADD CONSTRAINT "pos_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_events"
    ADD CONSTRAINT "pos_events_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."menu_categories"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_seccion_id_fkey" FOREIGN KEY ("seccion_id") REFERENCES "public"."menu_sections"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_items"
    ADD CONSTRAINT "promotion_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_items"
    ADD CONSTRAINT "promotion_items_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "public"."promotions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_segments"
    ADD CONSTRAINT "promotion_segments_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "public"."promotions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_segments"
    ADD CONSTRAINT "promotion_segments_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."promo_segments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sale_refunds"
    ADD CONSTRAINT "sale_refunds_por_fkey" FOREIGN KEY ("por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sale_refunds"
    ADD CONSTRAINT "sale_refunds_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_cobrado_por_fkey" FOREIGN KEY ("cobrado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_canjeado_por_fkey" FOREIGN KEY ("canjeado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "public"."promotions"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins gestionan categorías" ON "public"."menu_categories" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins gestionan franjas" ON "public"."promo_segments" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins gestionan las mesas" ON "public"."mesas" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins gestionan productos" ON "public"."products" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins gestionan productos de promo" ON "public"."promotion_items" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins gestionan promo-franja" ON "public"."promotion_segments" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Admins gestionan separadores" ON "public"."menu_sections" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Cada socio ve sus tickets" ON "public"."tickets" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Cada usuario edita su perfil" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Cada usuario ve su perfil" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Los admins cambian los ajustes" ON "public"."app_settings" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Los admins gestionan las promos" ON "public"."promotions" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Los admins ven el registro" ON "public"."ticket_events" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Los admins ven los ajustes" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Los admins ven todos los perfiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Los admins ven todos los tickets" ON "public"."tickets" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Personal lee el registro" ON "public"."pos_events" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Personal lee las cuentas" ON "public"."orders" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Personal lee las devoluciones" ON "public"."sale_refunds" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Personal lee las líneas" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Personal lee las mesas" ON "public"."mesas" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Personal lee las ventas" ON "public"."sales" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Personal lee los cierres" ON "public"."cierres_jornada" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_camarero"() AS "is_camarero") OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Se ven con su promo" ON "public"."promotion_items" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."promotions" "p"
  WHERE ("p"."id" = "promotion_items"."promo_id"))));



CREATE POLICY "Se ven con su promo" ON "public"."promotion_segments" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."promotions" "p"
  WHERE ("p"."id" = "promotion_segments"."promo_id"))));



CREATE POLICY "Socio lee sus cuentas" ON "public"."orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."order_items" "oi"
  WHERE (("oi"."order_id" = "orders"."id") AND ("oi"."pedido_por" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Socio lee sus líneas" ON "public"."order_items" FOR SELECT TO "authenticated" USING (("pedido_por" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Socios y admins: categorías" ON "public"."menu_categories" FOR SELECT TO "authenticated" USING (("visible" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Socios y admins: franjas" ON "public"."promo_segments" FOR SELECT TO "authenticated" USING (("visible" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Socios y admins: productos" ON "public"."products" FOR SELECT TO "authenticated" USING (("activo" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Socios y admins: promos" ON "public"."promotions" FOR SELECT TO "authenticated" USING (("publicada" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Socios y admins: separadores" ON "public"."menu_sections" FOR SELECT TO "authenticated" USING (("visible" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Web: categorías visibles" ON "public"."menu_categories" FOR SELECT TO "anon" USING ("visible");



CREATE POLICY "Web: franjas visibles" ON "public"."promo_segments" FOR SELECT TO "anon" USING ("visible");



CREATE POLICY "Web: productos activos" ON "public"."products" FOR SELECT TO "anon" USING ("activo");



CREATE POLICY "Web: promos publicadas" ON "public"."promotions" FOR SELECT TO "anon" USING ("publicada");



CREATE POLICY "Web: separadores visibles" ON "public"."menu_sections" FOR SELECT TO "anon" USING ("visible");



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalogo_migraciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cierres_jornada" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mesas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_solicitudes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promo_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tickets";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."_caducar_tickets"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_caducar_tickets"("p_user" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "service_role";
GRANT SELECT ON TABLE "public"."tickets" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."_canjear_ticket"("p_ticket_id" "uuid", "p_camarero" "uuid", "p_importe" integer, "p_item" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_canjear_ticket"("p_ticket_id" "uuid", "p_camarero" "uuid", "p_importe" integer, "p_item" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_cierre_jornada"("p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_cierre_jornada"("p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_fin_franja"("p_id" "text", "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_fin_franja"("p_id" "text", "p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_generar_codigo_ticket"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_generar_codigo_ticket"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_inicio_ventana_usos"("p_ventana" "text", "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_inicio_ventana_usos"("p_ventana" "text", "p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_jornada_fecha"("p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_jornada_fecha"("p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_jornada_inicio"("p_fecha" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_jornada_inicio"("p_fecha" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_normalizar_codigo"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_normalizar_codigo"("p_codigo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pos_cantidad"("p_e" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_cantidad"("p_e" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT SELECT ON TABLE "public"."orders" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pos_cuenta_abierta"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_cuenta_abierta"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pos_exigir_camarero"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_exigir_camarero"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pos_exigir_personal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_exigir_personal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pos_items_validos"("p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_items_validos"("p_items" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "service_role";
GRANT SELECT ON TABLE "public"."order_items" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."_pos_liberar_ticket"("p_item" "public"."order_items", "p_actor" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_liberar_ticket"("p_item" "public"."order_items", "p_actor" "uuid", "p_motivo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pos_linea_promo"("p_order_id" "uuid", "p_promo_id" "text", "p_cantidad" integer, "p_notas" "text", "p_ticket_codigo" "text", "p_estado" "text", "p_actor" "uuid", "p_socio" boolean, "p_socio_nombre" "text", "p_ronda" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_linea_promo"("p_order_id" "uuid", "p_promo_id" "text", "p_cantidad" integer, "p_notas" "text", "p_ticket_codigo" "text", "p_estado" "text", "p_actor" "uuid", "p_socio" boolean, "p_socio_nombre" "text", "p_ronda" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_promo_descuento_unidad"("p_promo_id" "text", "p_precio" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_promo_descuento_unidad"("p_promo_id" "text", "p_precio" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_socio_pedir_ronda"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid", "p_a_mano" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_socio_pedir_ronda"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid", "p_a_mano" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_ticket_motivo"("p_t" "public"."tickets", "p_camarero" "uuid", "p_item" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_ticket_motivo"("p_t" "public"."tickets", "p_camarero" "uuid", "p_item" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_token_mesa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_token_mesa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_token_mesa"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."aceptar_privacidad"("p_acepta_email" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aceptar_privacidad"("p_acepta_email" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."aceptar_privacidad"("p_acepta_email" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_devolver_venta"("p_sale_id" "uuid", "p_importe_centimos" integer, "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_devolver_venta"("p_sale_id" "uuid", "p_importe_centimos" integer, "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_devolver_venta"("p_sale_id" "uuid", "p_importe_centimos" integer, "p_motivo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_users"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_regenerar_qr_mesa"("p_mesa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_regenerar_qr_mesa"("p_mesa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_regenerar_qr_mesa"("p_mesa_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_reopen_ticket"("p_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_reopen_ticket"("p_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reopen_ticket"("p_id" "uuid", "p_motivo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_camarero"("p_user" "uuid", "p_valor" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_camarero"("p_user" "uuid", "p_valor" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_camarero"("p_user" "uuid", "p_valor" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_ticket_stats"("p_desde" timestamp with time zone, "p_hasta" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_ticket_stats"("p_desde" timestamp with time zone, "p_hasta" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_ticket_stats"("p_desde" timestamp with time zone, "p_hasta" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_void_ticket"("p_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_void_ticket"("p_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_void_ticket"("p_id" "uuid", "p_motivo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."catalogo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."catalogo"() TO "anon";
GRANT ALL ON FUNCTION "public"."catalogo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."catalogo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cierres_jornada_inmutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cierres_jornada_inmutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_ticket"("p_promo_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_ticket"("p_promo_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ticket"("p_promo_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_camarero"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_camarero"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_camarero"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lookup_ticket"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lookup_ticket"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_ticket"("p_codigo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mesa_info"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mesa_info"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mesa_info"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mesa_info"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mesas_para_pedir"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mesas_para_pedir"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mesas_para_pedir"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_abrir_mesa"("p_mesa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_abrir_mesa"("p_mesa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_abrir_mesa"("p_mesa_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_aceptar_ronda"("p_order_id" "uuid", "p_ronda" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_aceptar_ronda"("p_order_id" "uuid", "p_ronda" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_aceptar_ronda"("p_order_id" "uuid", "p_ronda" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_anadir_lineas"("p_order_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_anadir_lineas"("p_order_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_anadir_lineas"("p_order_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_cambiar_mesa"("p_order_id" "uuid", "p_mesa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_cambiar_mesa"("p_order_id" "uuid", "p_mesa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cambiar_mesa"("p_order_id" "uuid", "p_mesa_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") TO "service_role";



GRANT ALL ON TABLE "public"."cierres_jornada" TO "service_role";
GRANT SELECT ON TABLE "public"."cierres_jornada" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_jornadas_sin_cerrar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_jornadas_sin_cerrar"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_jornadas_sin_cerrar"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_rechazar_ronda"("p_order_id" "uuid", "p_ronda" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_rechazar_ronda"("p_order_id" "uuid", "p_ronda" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_rechazar_ronda"("p_order_id" "uuid", "p_ronda" "uuid", "p_motivo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_servir_lineas"("p_item_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_servir_lineas"("p_item_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_servir_lineas"("p_item_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_venta_barra"("p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_venta_barra"("p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_venta_barra"("p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."promos_estado"() TO "anon";
GRANT ALL ON FUNCTION "public"."promos_estado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."promos_estado"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_ticket"("p_codigo" "text", "p_importe_centimos" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_ticket"("p_codigo" "text", "p_importe_centimos" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_ticket"("p_codigo" "text", "p_importe_centimos" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sale_refunds_inmutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sale_refunds_inmutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sales_inmutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sales_inmutable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_by"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_by"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."socio_pedir_ronda"("p_token" "text", "p_items" "jsonb", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."socio_pedir_ronda"("p_token" "text", "p_items" "jsonb", "p_client_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."socio_pedir_ronda"("p_token" "text", "p_items" "jsonb", "p_client_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."socio_pedir_ronda_mesa"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."socio_pedir_ronda_mesa"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."socio_pedir_ronda_mesa"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."app_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."app_settings" TO "authenticated";



GRANT UPDATE("hora_cierre") ON TABLE "public"."app_settings" TO "authenticated";



GRANT UPDATE("margen_cortesia_min") ON TABLE "public"."app_settings" TO "authenticated";



GRANT ALL ON TABLE "public"."catalogo_migraciones" TO "service_role";



GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";
GRANT SELECT ON TABLE "public"."menu_categories" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."menu_categories" TO "authenticated";



GRANT ALL ON TABLE "public"."menu_sections" TO "service_role";
GRANT SELECT ON TABLE "public"."menu_sections" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."menu_sections" TO "authenticated";



GRANT ALL ON TABLE "public"."mesas" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."mesas" TO "authenticated";



GRANT ALL ON TABLE "public"."pos_events" TO "service_role";
GRANT SELECT ON TABLE "public"."pos_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."pos_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pos_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pos_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pos_solicitudes" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "service_role";
GRANT SELECT ON TABLE "public"."products" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."products" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("nombre") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("telefono") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("fecha_nacimiento") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("acepta_email") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("acepta_whatsapp") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."promo_segments" TO "service_role";
GRANT SELECT ON TABLE "public"."promo_segments" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promo_segments" TO "authenticated";



GRANT ALL ON TABLE "public"."promotion_items" TO "service_role";
GRANT SELECT ON TABLE "public"."promotion_items" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promotion_items" TO "authenticated";



GRANT ALL ON TABLE "public"."promotion_segments" TO "service_role";
GRANT SELECT ON TABLE "public"."promotion_segments" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promotion_segments" TO "authenticated";



GRANT ALL ON TABLE "public"."promotions" TO "service_role";
GRANT SELECT ON TABLE "public"."promotions" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promotions" TO "authenticated";



GRANT ALL ON TABLE "public"."sale_refunds" TO "service_role";
GRANT SELECT ON TABLE "public"."sale_refunds" TO "authenticated";



GRANT ALL ON TABLE "public"."sales" TO "service_role";
GRANT SELECT ON TABLE "public"."sales" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."sales_numero_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_numero_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_numero_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_events" TO "service_role";
GRANT SELECT ON TABLE "public"."ticket_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."ticket_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ticket_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ticket_events_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































