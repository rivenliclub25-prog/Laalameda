-- =====================================================================
--  Permisos de anon y authenticated iguales que en producción (E1b, 2026-11-09)
--
--  En un proyecto nuevo, Supabase da por defecto todos los permisos a anon
--  y authenticated sobre lo que se crea en public. En producción se quitaron
--  con los .sql antiguos (revoke … from anon, authenticated), pero el volcado
--  de la migración base solo recoge lo permitido, no lo quitado. Esta
--  migración quita todo a anon y authenticated y vuelve a dar EXACTAMENTE lo
--  que tiene producción (copiado de la migración base).
--
--  En producción no cambia nada: los permisos ya son estos.
--  Generada a partir de 20261108194540_base.sql: 20 tablas, 4 secuencias y 65 funciones.
-- =====================================================================

REVOKE ALL ON TABLE "public"."tickets" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."tickets" TO "authenticated";

REVOKE ALL ON TABLE "public"."orders" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."orders" TO "authenticated";

REVOKE ALL ON TABLE "public"."order_items" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."order_items" TO "authenticated";

REVOKE ALL ON TABLE "public"."cierres_jornada" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."cierres_jornada" TO "authenticated";

REVOKE ALL ON TABLE "public"."app_settings" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."app_settings" TO "authenticated";
GRANT UPDATE("hora_cierre") ON TABLE "public"."app_settings" TO "authenticated";
GRANT UPDATE("margen_cortesia_min") ON TABLE "public"."app_settings" TO "authenticated";

REVOKE ALL ON TABLE "public"."catalogo_migraciones" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."menu_categories" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."menu_categories" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."menu_categories" TO "authenticated";

REVOKE ALL ON TABLE "public"."menu_sections" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."menu_sections" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."menu_sections" TO "authenticated";

REVOKE ALL ON TABLE "public"."mesas" FROM "anon", "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."mesas" TO "authenticated";

REVOKE ALL ON TABLE "public"."pos_events" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."pos_events" TO "authenticated";

REVOKE ALL ON TABLE "public"."pos_solicitudes" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."products" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."products" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."products" TO "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "anon", "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE("nombre") ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE("telefono") ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE("fecha_nacimiento") ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE("acepta_email") ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE("acepta_whatsapp") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."promo_segments" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."promo_segments" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promo_segments" TO "authenticated";

REVOKE ALL ON TABLE "public"."promotion_items" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."promotion_items" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promotion_items" TO "authenticated";

REVOKE ALL ON TABLE "public"."promotion_segments" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."promotion_segments" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promotion_segments" TO "authenticated";

REVOKE ALL ON TABLE "public"."promotions" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."promotions" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promotions" TO "authenticated";

REVOKE ALL ON TABLE "public"."sale_refunds" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."sale_refunds" TO "authenticated";

REVOKE ALL ON TABLE "public"."sales" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."sales" TO "authenticated";

REVOKE ALL ON TABLE "public"."ticket_events" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."ticket_events" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."pos_events_id_seq" FROM "anon", "authenticated";
GRANT ALL ON SEQUENCE "public"."pos_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pos_events_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."products_id_seq" FROM "anon", "authenticated";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."sales_numero_seq" FROM "anon", "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_numero_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_numero_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."ticket_events_id_seq" FROM "anon", "authenticated";
GRANT ALL ON SEQUENCE "public"."ticket_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ticket_events_id_seq" TO "authenticated";

REVOKE ALL ON FUNCTION "public"."_caducar_tickets"("p_user" "uuid") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_canjear_ticket"("p_ticket_id" "uuid", "p_camarero" "uuid", "p_importe" integer, "p_item" "uuid") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_cierre_jornada"("p_at" timestamp with time zone) FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_fin_franja"("p_id" "text", "p_at" timestamp with time zone) FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_generar_codigo_ticket"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_inicio_ventana_usos"("p_ventana" "text", "p_at" timestamp with time zone) FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_jornada_fecha"("p_at" timestamp with time zone) FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_jornada_inicio"("p_fecha" "date") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_normalizar_codigo"("p_codigo" "text") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_cantidad"("p_e" "jsonb") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_crear_venta"("p_order" "public"."orders", "p_metodo" "text", "p_actor" "uuid") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_cuenta_abierta"("p_order_id" "uuid") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_exigir_camarero"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_exigir_personal"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_items_validos"("p_items" "jsonb") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_liberar_ticket"("p_item" "public"."order_items", "p_actor" "uuid", "p_motivo" "text") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_linea_promo"("p_order_id" "uuid", "p_promo_id" "text", "p_cantidad" integer, "p_notas" "text", "p_ticket_codigo" "text", "p_estado" "text", "p_actor" "uuid", "p_socio" boolean, "p_socio_nombre" "text", "p_ronda" "uuid") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_pos_venta_json"("p_order_id" "uuid", "p_repetida" boolean) FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_promo_descuento_unidad"("p_promo_id" "text", "p_precio" integer) FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_resumen_caja"("p_desde" "date", "p_hasta" "date") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_socio_pedir_ronda"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid", "p_a_mano" boolean) FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_ticket_motivo"("p_t" "public"."tickets", "p_camarero" "uuid", "p_item" "uuid") FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."_token_mesa"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."_token_mesa"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."aceptar_privacidad"("p_acepta_email" boolean) FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."aceptar_privacidad"("p_acepta_email" boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_devolver_venta"("p_sale_id" "uuid", "p_importe_centimos" integer, "p_motivo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_devolver_venta"("p_sale_id" "uuid", "p_importe_centimos" integer, "p_motivo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_informe"("p_desde" "date", "p_hasta" "date") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_list_users"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_users"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_regenerar_qr_mesa"("p_mesa_id" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_regenerar_qr_mesa"("p_mesa_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_reopen_ticket"("p_id" "uuid", "p_motivo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reopen_ticket"("p_id" "uuid", "p_motivo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_set_camarero"("p_user" "uuid", "p_valor" boolean) FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_camarero"("p_user" "uuid", "p_valor" boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_ticket_stats"("p_desde" timestamp with time zone, "p_hasta" timestamp with time zone) FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_ticket_stats"("p_desde" timestamp with time zone, "p_hasta" timestamp with time zone) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_void_ticket"("p_id" "uuid", "p_motivo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."admin_void_ticket"("p_id" "uuid", "p_motivo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."catalogo"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."catalogo"() TO "anon";
GRANT ALL ON FUNCTION "public"."catalogo"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."cierres_jornada_inmutable"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."create_ticket"("p_promo_id" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."create_ticket"("p_promo_id" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_user"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."is_camarero"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."is_camarero"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."lookup_ticket"("p_codigo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_ticket"("p_codigo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mesa_info"("p_token" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."mesa_info"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mesa_info"("p_token" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mesas_para_pedir"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."mesas_para_pedir"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_abrir_mesa"("p_mesa_id" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_abrir_mesa"("p_mesa_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_aceptar_ronda"("p_order_id" "uuid", "p_ronda" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_aceptar_ronda"("p_order_id" "uuid", "p_ronda" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_anadir_lineas"("p_order_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_anadir_lineas"("p_order_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_anular_linea"("p_item_id" "uuid", "p_motivo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_cambiar_mesa"("p_order_id" "uuid", "p_mesa_id" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cambiar_mesa"("p_order_id" "uuid", "p_mesa_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cancelar_cuenta"("p_order_id" "uuid", "p_motivo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cerrar_jornada"("p_jornada" "date", "p_efectivo_contado_centimos" integer, "p_notas" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cobrar_cuenta"("p_order_id" "uuid", "p_metodo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_estado_jornada"("p_jornada" "date") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_jornadas_sin_cerrar"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_jornadas_sin_cerrar"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_rechazar_ronda"("p_order_id" "uuid", "p_ronda" "uuid", "p_motivo" "text") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_rechazar_ronda"("p_order_id" "uuid", "p_ronda" "uuid", "p_motivo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_servir_lineas"("p_item_ids" "uuid"[]) FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_servir_lineas"("p_item_ids" "uuid"[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pos_venta_barra"("p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."pos_venta_barra"("p_items" "jsonb", "p_metodo" "text", "p_client_request_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone) FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."promo_activa"("p_id" "text", "p_at" timestamp with time zone) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."promos_estado"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."promos_estado"() TO "anon";
GRANT ALL ON FUNCTION "public"."promos_estado"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."protect_role"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."protect_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_role"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."redeem_ticket"("p_codigo" "text", "p_importe_centimos" integer) FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_ticket"("p_codigo" "text", "p_importe_centimos" integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."sale_refunds_inmutable"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."sales_inmutable"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_updated_by"() FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."socio_pedir_ronda"("p_token" "text", "p_items" "jsonb", "p_client_request_id" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."socio_pedir_ronda"("p_token" "text", "p_items" "jsonb", "p_client_request_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."socio_pedir_ronda_mesa"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") FROM "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."socio_pedir_ronda_mesa"("p_mesa_id" "uuid", "p_items" "jsonb", "p_client_request_id" "uuid") TO "authenticated";
