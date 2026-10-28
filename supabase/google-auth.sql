-- =====================================================================
--  La Alameda — Inicio de sesión con Google
--
--  Requisito: haber ejecutado antes schema.sql (y admin.sql).
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
--
--  Qué añade:
--    · Quien se registra con Google no pasa por el formulario, así que no
--      marca la casilla de privacidad ni elige si quiere recibir ofertas.
--      La web le muestra «Un último paso» y llama a aceptar_privacidad(),
--      que guarda la fecha de aceptación y su elección de email.
--    · La fecha de aceptación sigue sin poder cambiarse directamente desde
--      el navegador (schema.sql solo deja editar nombre, teléfono,
--      cumpleaños y consentimientos): solo esta función la rellena, una
--      vez y con la hora del servidor.
--    · Las cuentas con el mismo email se unen solas (lo hace Supabase): no
--      hace falta nada aquí para eso.
-- =====================================================================

create or replace function public.aceptar_privacidad(p_acepta_email boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

revoke execute on function public.aceptar_privacidad(boolean) from public, anon;
grant  execute on function public.aceptar_privacidad(boolean) to authenticated;
