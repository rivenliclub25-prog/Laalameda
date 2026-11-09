-- =====================================================================
--  Datos de partida de PRUEBAS (ENTORNOS.md, fase E4). NUNCA en producción.
--
--  Lo carga el workflow «Datos de PRUEBAS» (acción reiniciar), que antes
--  comprueba que la conexión es la de PRUEBAS. También lo usaría
--  `supabase db reset` en un Supabase local (no se usa por ahora, E-P4).
--  La carta no está aquí: se copia de la web real (acción copiar-carta).
-- =====================================================================

-- Ajustes de la jornada: cierre a las 03:00 y 30 minutos de cortesía.
insert into public.app_settings (id, hora_cierre, margen_cortesia_min)
values (true, '03:00', 30)
on conflict (id) do update set hora_cierre = excluded.hora_cierre, margen_cortesia_min = excluded.margen_cortesia_min;

-- Mesas 1 a 4, como en el bar (solo si no hay ninguna).
insert into public.mesas (nombre, orden)
select m.nombre, m.orden
from (values ('Mesa 1', 1), ('Mesa 2', 2), ('Mesa 3', 3), ('Mesa 4', 4)) as m (nombre, orden)
where not exists (select 1 from public.mesas);
