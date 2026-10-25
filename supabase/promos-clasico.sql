-- =====================================================================
--  Promos de El Clásico (domingo 25 de octubre de 2026)
--
--  Requisito: haber ejecutado antes tickets.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces.
--
--  Crea (o actualiza) las dos promos del partido, ya ENCENDIDAS:
--    · 4 cañones Estrella (7 € en la web)
--    · 4 tercios Estrella (8,50 € en la web)
--  Valen solo esta jornada: desde ahora hasta el cierre (03:00 del lunes),
--  1 ticket por socio y promo. Los precios están en src/data/promos.ts
--  (no en esta tabla, como el resto de promos).
-- =====================================================================

insert into public.promotions
  (id, nombre, descuento_texto, solo_club, activa, inicio, fin, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos)
values
  ('clasico-4-canones', '4 cañones · El Clásico', '4 cañones Estrella',
   true, true, null, '2026-10-26 03:00 Europe/Madrid', null, null, null, 1, 'dia'),
  ('clasico-4-tercios', '4 tercios · El Clásico', '4 tercios Estrella',
   true, true, null, '2026-10-26 03:00 Europe/Madrid', null, null, null, 1, 'dia')
on conflict (id) do update set
  nombre          = excluded.nombre,
  descuento_texto = excluded.descuento_texto,
  solo_club       = excluded.solo_club,
  activa          = excluded.activa,
  inicio          = excluded.inicio,
  fin             = excluded.fin,
  dias_semana     = excluded.dias_semana,
  hora_inicio     = excluded.hora_inicio,
  hora_fin        = excluded.hora_fin,
  max_usos        = excluded.max_usos,
  ventana_usos    = excluded.ventana_usos;

-- Comprobación: deben salir las dos con disponible_ahora = true.
select * from public.promos_estado() where id like 'clasico-%';
