-- =====================================================================
--  Reiniciar PRUEBAS (ENTORNOS.md, fase E4). NUNCA en producción.
--
--  Lo ejecuta SOLO el workflow «Datos de PRUEBAS» (acción reiniciar), que
--  antes comprueba que la conexión es la de PRUEBAS y se niega si es la de
--  producción. No pegar en el SQL Editor.
--
--  Vacía: ventas, cuentas y líneas, devoluciones, cierres, registro del
--  TPV, solicitudes, tickets y su registro. Reinicia la numeración.
--  Rehace: las mesas 1–4 (con QR nuevos) y los ajustes (seed.sql, a
--  continuación en la misma transacción).
--  Conserva: la carta, las promos y los usuarios.
-- =====================================================================

-- Ventas, devoluciones y cierres están protegidos contra borrados: se quita
-- la protección solo mientras dura esta transacción.
alter table public.sales           disable trigger sales_inmutable;
alter table public.sale_refunds    disable trigger sale_refunds_inmutable;
alter table public.cierres_jornada disable trigger cierres_jornada_inmutable;

delete from public.cierres_jornada;
delete from public.pos_events;
delete from public.sale_refunds;
update public.tickets set sale_id = null, order_item_id = null
  where sale_id is not null or order_item_id is not null;
delete from public.sales;
delete from public.order_items;
delete from public.orders;
delete from public.pos_solicitudes;
delete from public.ticket_events;
delete from public.tickets;
delete from public.mesas;

alter table public.sales         alter column numero restart with 1;
alter table public.pos_events    alter column id     restart with 1;
alter table public.ticket_events alter column id     restart with 1;

alter table public.sales           enable trigger sales_inmutable;
alter table public.sale_refunds    enable trigger sale_refunds_inmutable;
alter table public.cierres_jornada enable trigger cierres_jornada_inmutable;
