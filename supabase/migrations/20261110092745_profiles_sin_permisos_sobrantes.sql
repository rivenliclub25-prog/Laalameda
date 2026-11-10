-- =====================================================================
--  profiles: fuera los permisos que anon y authenticated no usan
--  (ENTORNOS.md, E5 — primera migración que recorre todo el camino:
--  rama → staging → PRUEBAS → main → aprobación → producción)
--
--  Supabase dio por defecto a anon y authenticated TRUNCATE (vaciar la
--  tabla entera, sin pasar por la seguridad por filas), REFERENCES,
--  TRIGGER y MAINTAIN sobre profiles, y nunca se quitaron. La web no los
--  usa (y la API no permite TRUNCATE), pero no deben estar.
--
--  Se mantiene lo que la web sí usa: SELECT (con sus políticas RLS) y
--  UPDATE solo de nombre, teléfono, cumpleaños y consentimientos.
-- =====================================================================

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."profiles" FROM "anon", "authenticated";
