-- =====================================================================
--  Puestos de barra (Barra 1, Barra 2…): las mesas pasan a tener tipo
--
--  - tipo 'mesa'  : las mesas de siempre (con QR para pedir desde el móvil).
--  - tipo 'barra' : puestos de barra. En el TPV funcionan igual que una
--                   mesa (cuenta abierta, añadir, servir, cobrar al final),
--                   pero los socios no los ven para pedir desde el móvil.
--  Las mesas que ya existen quedan como 'mesa'.
-- =====================================================================

ALTER TABLE "public"."mesas" ADD COLUMN IF NOT EXISTS "tipo" "text" DEFAULT 'mesa'::"text" NOT NULL;
ALTER TABLE "public"."mesas" DROP CONSTRAINT IF EXISTS "mesas_tipo_check";
ALTER TABLE "public"."mesas" ADD CONSTRAINT "mesas_tipo_check" CHECK ("tipo" = ANY (ARRAY['mesa'::"text", 'barra'::"text"]));

-- «Pedir» desde la carta: solo mesas, no puestos de barra.
CREATE OR REPLACE FUNCTION "public"."mesas_para_pedir"() RETURNS TABLE("id" "uuid", "nombre" "text", "orden" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select m.id, m.nombre, m.orden
  from public.mesas m
  where m.activa and m.tipo = 'mesa' and auth.uid() is not null
  order by m.orden, m.nombre;
$$;

-- QR de la mesa: un puesto de barra se trata como no disponible para pedir desde el móvil.
CREATE OR REPLACE FUNCTION "public"."mesa_info"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('id', m.id, 'nombre', m.nombre, 'activa', m.activa and m.tipo = 'mesa')
  from public.mesas m
  where m.token = p_token;
$$;

-- Permisos explícitos (los mismos que tenían).
REVOKE ALL ON FUNCTION "public"."mesas_para_pedir"() FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."mesas_para_pedir"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."mesa_info"("p_token" "text") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."mesa_info"("p_token" "text") TO "anon", "authenticated";
