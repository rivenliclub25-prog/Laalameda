-- =====================================================================
--  Club de clientes de La Alameda — esquema de base de datos
--
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabla de perfiles
--    Supabase guarda el email y la contraseña en auth.users (tabla
--    interna). Aquí guardamos los datos del club, uno por usuario.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  -- Mismo id que el usuario de auth.users. "on delete cascade": si se
  -- borra el usuario, su perfil se borra automáticamente.
  id                   uuid primary key references auth.users (id) on delete cascade,

  nombre               text,
  telefono             text,          -- para futuras comunicaciones por WhatsApp
  fecha_nacimiento     date,          -- opcional, para ofertas de cumpleaños

  -- Consentimientos de comunicaciones comerciales, uno por canal.
  -- Por defecto NO: el cliente tiene que marcarlos expresamente (RGPD).
  acepta_email         boolean not null default false,
  acepta_whatsapp      boolean not null default false,

  -- Momento en que aceptó la política de privacidad al registrarse.
  acepta_privacidad_at timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de cada miembro del club de La Alameda.';


-- ---------------------------------------------------------------------
-- 2. Seguridad a nivel de fila (RLS)
--    Con RLS activado, nadie puede leer ni tocar la tabla salvo lo que
--    permitan las políticas. La clave pública del frontend solo podrá
--    ver y editar el perfil del usuario que ha iniciado sesión.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Cada usuario ve su perfil" on public.profiles;
create policy "Cada usuario ve su perfil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Cada usuario edita su perfil" on public.profiles;
create policy "Cada usuario edita su perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No hay políticas de insert ni delete: el perfil lo crea el trigger
-- (paso 4) y se borra junto con el usuario (paso 5).

-- Además, el usuario solo puede modificar estas columnas. Así no puede
-- cambiar desde el navegador la fecha de aceptación de la privacidad
-- ni las fechas de creación.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nombre, telefono, fecha_nacimiento, acepta_email, acepta_whatsapp)
  on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- 3. updated_at automático
--    Cada vez que se modifica un perfil, se guarda la fecha.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Crear el perfil automáticamente al registrarse
--    Al crear un usuario en auth.users, copiamos al perfil los datos
--    que manda el formulario de registro (raw_user_meta_data):
--      nombre, acepta_email, acepta_privacidad
--    Con Google (más adelante) el nombre llega como full_name o name.
--
--    "security definer" hace que la función se ejecute con permisos
--    del propietario, porque el usuario nuevo aún no puede escribir
--    en profiles. "search_path = ''" evita que se suplanten tablas.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, nombre, acepta_email, acepta_privacidad_at)
  values (
    new.id,
    nullif(trim(coalesce(meta->>'nombre', meta->>'full_name', meta->>'name', '')), ''),
    coalesce(meta->>'acepta_email', '') = 'true',
    case when coalesce(meta->>'acepta_privacidad', '') = 'true' then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 5. Borrar la propia cuenta
--    Desde el navegador no se puede usar la clave service_role, así que
--    esta función (security definer) borra en auth.users ÚNICAMENTE al
--    usuario que la llama (auth.uid()). El perfil se borra solo por el
--    "on delete cascade".
--    Desde la web se llama con: supabase.rpc('delete_user')
-- ---------------------------------------------------------------------
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No hay ninguna sesión iniciada';
  end if;

  delete from auth.users where id = uid;
end;
$$;

-- Solo los usuarios con sesión pueden llamarla (nunca los anónimos).
revoke execute on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;

-- La función del trigger no debe poder llamarse desde la API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. Perfiles de usuarios que ya existían (por si creaste alguno antes
--    de ejecutar este archivo). Si no hay ninguno, no hace nada.
-- ---------------------------------------------------------------------
insert into public.profiles (id, nombre)
select u.id, nullif(trim(coalesce(u.raw_user_meta_data->>'nombre', '')), '')
from auth.users u
on conflict (id) do nothing;


-- =====================================================================
--  CONSULTA ÚTIL PARA EL BAR (no hace falta ejecutarla ahora)
--  Lista de clientes que aceptan comunicaciones, con su email.
--  Ejecútala en el SQL Editor cuando quieras exportar contactos:
--
--  select p.nombre, u.email, p.telefono, p.fecha_nacimiento,
--         p.acepta_email, p.acepta_whatsapp, p.created_at
--  from public.profiles p
--  join auth.users u on u.id = p.id
--  where p.acepta_email or p.acepta_whatsapp
--  order by p.created_at desc;
-- =====================================================================
