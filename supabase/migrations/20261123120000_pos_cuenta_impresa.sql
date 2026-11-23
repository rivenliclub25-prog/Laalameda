-- =====================================================================
--  TPV, entrega C: imprimir la cuenta antes de cobrar (POS.md)
--
--  Imprimir la cuenta (pre-cuenta) no cambia nada de la cuenta: solo se
--  apunta un evento «cuenta_impresa» para que el TPV muestre
--  «Cuenta entregada a las 23:10». La impresión no depende de esto.
--  Solo camareros, y solo con la cuenta abierta.
-- =====================================================================

ALTER TABLE "public"."pos_events" DROP CONSTRAINT IF EXISTS "pos_events_tipo_check";
ALTER TABLE "public"."pos_events" ADD CONSTRAINT "pos_events_tipo_check" CHECK (("tipo" = ANY (ARRAY[
  'abierta'::"text", 'linea_anadida'::"text", 'linea_aceptada'::"text", 'linea_servida'::"text", 'linea_anulada'::"text",
  'pagada'::"text", 'cancelada'::"text", 'devuelta'::"text", 'mesa_cambiada'::"text", 'cuenta_impresa'::"text"])));

-- Apunta que se ha impreso la cuenta (con lo que quedaba por cobrar en ese momento) y devuelve la hora.
CREATE OR REPLACE FUNCTION "public"."pos_cuenta_impresa"("p_order_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid     uuid := public._pos_exigir_camarero();
  o       public.orders%rowtype;
  v_total integer;
  v_lineas integer;
  v_at    timestamptz := now();
begin
  o := public._pos_cuenta_abierta(p_order_id);
  select coalesce(sum(precio_unitario_centimos * cantidad), 0)::integer, count(*)::integer
  into v_total, v_lineas
  from public.order_items
  where order_id = o.id and estado in ('aceptada', 'servida') and sale_id is null;

  insert into public.pos_events (order_id, tipo, actor, at, detalle)
  values (o.id, 'cuenta_impresa', uid, v_at, jsonb_build_object('total_centimos', v_total, 'lineas', v_lineas));
  return v_at;
end;
$$;

REVOKE ALL ON FUNCTION "public"."pos_cuenta_impresa"("p_order_id" "uuid") FROM PUBLIC, "anon";
GRANT ALL ON FUNCTION "public"."pos_cuenta_impresa"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cuenta_impresa"("p_order_id" "uuid") TO "service_role";
