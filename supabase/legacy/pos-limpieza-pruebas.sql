-- =====================================================================
--  🔒 BLOQUEADO DESDE EL 2026-11-07 (ENTORNOS.md, E-D2 y E-D13)
--  Este script ya se usó una vez (2026-11-02, antes de abrir). Hoy los datos
--  de producción son REALES: ejecutarlo borraría la caja del bar. Por eso
--  falla al instante. Se conserva solo como historia (en E1 pasa a
--  supabase/legacy/). Para vaciar PRUEBAS se usará «Reiniciar pruebas» (E4).
-- =====================================================================
--
--  La Alameda — POS: borrar las ventas de PRUEBA (un solo uso, antes de
--  empezar a vender de verdad)
--
--  ⚠️  BORRA PARA SIEMPRE todas las ventas, cuentas, líneas, devoluciones,
--  cierres de jornada y el registro de eventos del TPV, y reinicia la
--  numeración (la primera venta real será la nº 1).
--
--  NO toca: carta, precios, promos, mesas (ni sus QR), socios, camareros,
--  tickets ni ajustes. Los tickets que se canjearon en las pruebas siguen
--  canjeados; solo pierden el enlace a la venta borrada.
--
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Ejecútalo SOLO cuando no haya nadie usando el TPV.
--  Al final muestra cuántas filas quedan en cada tabla (todas a 0).
-- =====================================================================

begin;

-- Bloqueo: falla aquí y la transacción queda anulada, así que nada de lo
-- que sigue se aplica (ni en el SQL Editor ni con psql).
do $$
begin
  raise exception 'BLOQUEADO: este script ya se usó y hoy borraría las ventas REALES del bar. No se ejecuta (ENTORNOS.md, E-D2).';
end;
$$;

-- Las ventas, devoluciones y cierres no se pueden borrar (están protegidos
-- a propósito): se quita la protección solo durante esta limpieza.
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

-- Numeración desde 1.
alter table public.sales      alter column numero restart with 1;
alter table public.pos_events alter column id     restart with 1;

-- Se vuelve a proteger todo.
alter table public.sales           enable trigger sales_inmutable;
alter table public.sale_refunds    enable trigger sale_refunds_inmutable;
alter table public.cierres_jornada enable trigger cierres_jornada_inmutable;

commit;

-- Comprobación: todo a 0.
select 'ventas' as tabla, count(*) as filas from public.sales
union all select 'cuentas', count(*) from public.orders
union all select 'líneas', count(*) from public.order_items
union all select 'devoluciones', count(*) from public.sale_refunds
union all select 'cierres', count(*) from public.cierres_jornada
union all select 'eventos', count(*) from public.pos_events;
