-- =====================================================================
--  Club de clientes de La Alameda — rol de administrador
--
--  Requisito: haber ejecutado antes schema.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columna "role" en los perfiles
--    Cada perfil es 'user' (cliente normal) o 'admin' (gente del bar).
--    Todos los perfiles que ya existen pasan a ser 'user'.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin'));

comment on column public.profiles.role is 'user = cliente; admin = puede ver el panel de socios. Se cambia solo desde el panel de Supabase.';

-- Nota: en schema.sql el usuario solo tiene permiso para editar
-- nombre, telefono, fecha_nacimiento, acepta_email y acepta_whatsapp.
-- "role" no está en esa lista, así que ya no puede tocarlo desde la web.
-- El trigger del paso 2 es una segunda barrera por si eso cambia algún día.


-- ---------------------------------------------------------------------
-- 2. Nadie puede cambiarse el rol desde la web
--    Si una petición viene de un usuario con sesión (auth.uid() no es
--    nulo) e intenta cambiar "role", se cancela con un error.
--    Desde el SQL Editor o el Table Editor de Supabase no hay sesión
--    de usuario (auth.uid() es nulo), así que tú sí puedes cambiarlo.
-- ---------------------------------------------------------------------
create or replace function public.protect_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'No está permitido cambiar el rol desde la web'
      using errcode = '42501';  -- código estándar de "permiso denegado"
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();


-- ---------------------------------------------------------------------
-- 3. El registro siempre crea perfiles con role = 'user'
--    Misma función que en schema.sql, pero ahora pone el rol de forma
--    explícita. Aunque alguien mande "role": "admin" en los datos del
--    registro, aquí no se lee: se ignora.
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
  insert into public.profiles (id, nombre, acepta_email, acepta_privacidad_at, role)
  values (
    new.id,
    nullif(trim(coalesce(meta->>'nombre', meta->>'full_name', meta->>'name', '')), ''),
    coalesce(meta->>'acepta_email', '') = 'true',
    case when coalesce(meta->>'acepta_privacidad', '') = 'true' then now() end,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. ¿Es admin quien hace la petición?
--    Devuelve true/false para el usuario con sesión.
--    "security definer": lee profiles saltándose RLS. Si las políticas
--    de profiles consultaran profiles directamente, Postgres entraría en
--    un bucle (recursión infinita); con esta función no pasa.
--    "stable": dentro de una misma consulta devuelve siempre lo mismo,
--    así Postgres puede calcularla una sola vez.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------
-- 5. Los admins pueden LEER todos los perfiles
--    Se suma a "Cada usuario ve su perfil" (las políticas de lectura se
--    combinan con OR). No hay política nueva de update ni delete: un
--    admin solo puede editar su propio perfil, como cualquiera.
-- ---------------------------------------------------------------------
drop policy if exists "Los admins ven todos los perfiles" on public.profiles;
create policy "Los admins ven todos los perfiles"
  on public.profiles for select
  to authenticated
  using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 6. Lista de socios para el panel
--    Une profiles con auth.users para tener también el email y los
--    datos de acceso. Si quien la llama no es admin, da error y no
--    devuelve nada.
--    Desde la web se llama con: supabase.rpc('admin_list_users')
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id                 uuid,
  nombre             text,
  email              text,
  telefono           text,
  fecha_nacimiento   date,
  acepta_email       boolean,
  acepta_whatsapp    boolean,
  role               text,
  created_at         timestamptz,   -- fecha de alta
  email_confirmed_at timestamptz,   -- null si no ha confirmado el email
  last_sign_in_at    timestamptz    -- último inicio de sesión
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso solo para administradores'
      using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.nombre,
      u.email::text,
      p.telefono,
      p.fecha_nacimiento,
      p.acepta_email,
      p.acepta_whatsapp,
      p.role,
      p.created_at,
      u.email_confirmed_at,
      u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- Solo usuarios con sesión pueden llamarla (y dentro se comprueba que
-- sean admin). Los anónimos, nunca.
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;


-- =====================================================================
--  HACER ADMIN A ALGUIEN (ejecútalo aparte, cambiando el email)
--  La persona tiene que haberse registrado antes en la web.
--
--  update public.profiles
--  set role = 'admin'
--  where id = (select id from auth.users where email = 'persona@ejemplo.com');
--
--  QUITAR EL ROL DE ADMIN:
--
--  update public.profiles
--  set role = 'user'
--  where id = (select id from auth.users where email = 'persona@ejemplo.com');
--
--  VER QUIÉN ES ADMIN:
--
--  select u.email, p.nombre
--  from public.profiles p
--  join auth.users u on u.id = p.id
--  where p.role = 'admin';
-- =====================================================================
