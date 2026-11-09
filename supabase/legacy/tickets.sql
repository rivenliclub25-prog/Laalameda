-- =====================================================================
--  Club de clientes de La Alameda — tickets de promociones (fase T1)
--
--  Requisito: haber ejecutado antes schema.sql y admin.sql.
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces sin romper nada (no
--  borra datos ni pisa los cambios que hagáis en las promos).
--
--  Idea general:
--    · Un socio pide un ticket para una promo de club  → create_ticket()
--    · Lo enseña en el bar (código ALA-XXXX o QR)
--    · Un camarero lo comprueba y lo canjea           → lookup_ticket() / redeem_ticket()
--    · Toda la validación ocurre AQUÍ, en la base de datos.
--
--  Todas las horas se interpretan en Europe/Madrid y el dinero va en
--  céntimos (números enteros).
-- =====================================================================


-- Para generar códigos aleatorios seguros (en Supabase ya suele estar activa).
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 1. Ajustes generales del bar (una sola fila)
--    hora_cierre: cuándo termina la jornada. Si es de madrugada (antes
--      de las 12:00), lo que pase entre medianoche y esa hora cuenta
--      como la jornada del día anterior.
--    margen_cortesia_min: minutos extra de validez de los tickets.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id                  boolean primary key default true check (id),  -- fuerza una única fila
  hora_cierre         time    not null default '03:00',
  margen_cortesia_min integer not null default 30 check (margen_cortesia_min between 0 and 240),
  updated_at          timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Los admins ven los ajustes" on public.app_settings;
create policy "Los admins ven los ajustes"
  on public.app_settings for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Los admins cambian los ajustes" on public.app_settings;
create policy "Los admins cambian los ajustes"
  on public.app_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.app_settings from anon, authenticated;
grant select, update (hora_cierre, margen_cortesia_min) on public.app_settings to authenticated;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. Promociones (tabla mínima)
--    La web sigue pintando las promos desde src/data/promos.ts. Esta
--    tabla usa el MISMO id y sirve para que el servidor sepa si una
--    promo está encendida, en qué horario y con qué límites.
--    Los precios NO se guardan aquí todavía (vienen del Excel).
--
--    Horario:
--      · inicio / fin: periodo o evento (null = sin límite).
--      · dias_semana: 1 = lunes … 7 = domingo (null = todos los días).
--        Es el día en que EMPIEZA la franja.
--      · hora_inicio / hora_fin: franja horaria (null = todo el día).
--        Si hora_fin es menor que hora_inicio, la franja cruza la
--        medianoche: 22:00–02:00 del viernes sigue valiendo el sábado
--        a la 01:00.
--    Límite de usos por socio: max_usos (null = sin límite) dentro de
--    ventana_usos: 'total', 'dia' (jornada del bar), 'semana' (de lunes
--    a domingo) o 'mes'. Se cuentan los tickets canjeados y el que esté
--    disponible.
-- ---------------------------------------------------------------------
create table if not exists public.promotions (
  id              text primary key,
  nombre          text not null,
  descuento_texto text not null default '',
  solo_club       boolean not null default true,
  activa          boolean not null default false,
  inicio          timestamptz,
  fin             timestamptz,
  dias_semana     integer[] check (dias_semana is null or dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]),
  hora_inicio     time,
  hora_fin        time,
  max_usos        integer check (max_usos is null or max_usos > 0),
  ventana_usos    text not null default 'dia' check (ventana_usos in ('total', 'dia', 'semana', 'mes')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint promotions_periodo_check check (inicio is null or fin is null or inicio < fin),
  constraint promotions_franja_check check ((hora_inicio is null) = (hora_fin is null))
);

comment on table public.promotions is 'Promos del bar. Mismo id que src/data/promos.ts. activa = interruptor manual.';

alter table public.promotions enable row level security;

-- Cualquiera (incluso sin sesión) puede ver las promos.
drop policy if exists "Todos ven las promos" on public.promotions;
create policy "Todos ven las promos"
  on public.promotions for select to anon, authenticated
  using (true);

-- Solo los admins las crean, cambian o borran.
drop policy if exists "Los admins gestionan las promos" on public.promotions;
create policy "Los admins gestionan las promos"
  on public.promotions for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.promotions from anon, authenticated;
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;

drop trigger if exists promotions_set_updated_at on public.promotions;
create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 3. Funciones de horario (todas en hora de Madrid)
-- ---------------------------------------------------------------------

-- Fecha de la "jornada" a la que pertenece un momento.
-- Con cierre a las 03:00, el sábado a la 01:30 es la jornada del viernes.
create or replace function public._jornada_fecha(p_at timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_at at time zone 'Europe/Madrid')
          - case when s.hora_cierre < time '12:00' then s.hora_cierre - time '00:00' else interval '0' end
         )::date
  from public.app_settings s
  where s.id;
$$;

-- Momento en que empieza la jornada de una fecha dada.
create or replace function public._jornada_inicio(p_fecha date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (p_fecha
          + case when s.hora_cierre < time '12:00' then s.hora_cierre else time '00:00' end
         ) at time zone 'Europe/Madrid'
  from public.app_settings s
  where s.id;
$$;

-- Momento en que cierra la jornada actual (sin margen de cortesía).
create or replace function public._cierre_jornada(p_at timestamptz default now())
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (public._jornada_fecha(p_at)
          + case when s.hora_cierre < time '12:00' then 1 else 0 end
          + s.hora_cierre
         ) at time zone 'Europe/Madrid'
  from public.app_settings s
  where s.id;
$$;

-- Desde cuándo se cuentan los usos según la ventana de la promo.
create or replace function public._inicio_ventana_usos(p_ventana text, p_at timestamptz default now())
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := public._jornada_fecha(p_at);
begin
  return case p_ventana
    when 'dia'    then public._jornada_inicio(d)
    when 'semana' then public._jornada_inicio(date_trunc('week', d)::date)   -- lunes
    when 'mes'    then public._jornada_inicio(date_trunc('month', d)::date)
    else '-infinity'::timestamptz                                           -- 'total'
  end;
end;
$$;

-- ¿Está la promo disponible en este momento? Comprueba el interruptor
-- manual, el periodo, el día de la semana y la franja horaria.
create or replace function public.promo_activa(p_id text, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p       public.promotions%rowtype;
  v_local timestamp := p_at at time zone 'Europe/Madrid';
  t       time      := v_local::time;
  dia     integer   := extract(isodow from v_local)::integer;
  previo  integer   := case when dia = 1 then 7 else dia - 1 end;
begin
  select * into p from public.promotions where id = p_id;
  if not found or not p.activa then
    return false;
  end if;

  if p.inicio is not null and p_at < p.inicio then return false; end if;
  if p.fin    is not null and p_at >= p.fin   then return false; end if;

  -- Sin franja: vale todo el día (de los días indicados).
  if p.hora_inicio is null then
    return p.dias_semana is null or dia = any (p.dias_semana);
  end if;

  -- Franja normal, p. ej. 16:00–20:00.
  if p.hora_inicio < p.hora_fin then
    return (p.dias_semana is null or dia = any (p.dias_semana))
       and t >= p.hora_inicio and t < p.hora_fin;
  end if;

  -- Franja que cruza la medianoche, p. ej. 20:00–03:00.
  return ((p.dias_semana is null or dia    = any (p.dias_semana)) and t >= p.hora_inicio)
      or ((p.dias_semana is null or previo = any (p.dias_semana)) and t <  p.hora_fin);
end;
$$;

-- Final de la franja horaria en curso (null si la promo no tiene franja).
create or replace function public._fin_franja(p_id text, p_at timestamptz default now())
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p       public.promotions%rowtype;
  v_local timestamp := p_at at time zone 'Europe/Madrid';
  t       time      := v_local::time;
  d       date      := v_local::date;
begin
  select * into p from public.promotions where id = p_id;
  if not found or p.hora_inicio is null then
    return null;
  end if;

  if p.hora_inicio < p.hora_fin or t < p.hora_fin then
    return (d + p.hora_fin) at time zone 'Europe/Madrid';        -- termina hoy
  end if;
  return (d + 1 + p.hora_fin) at time zone 'Europe/Madrid';      -- cruza la medianoche
end;
$$;

-- Estado de todas las promos en una sola petición (para la web).
create or replace function public.promos_estado()
returns table (id text, solo_club boolean, activa boolean, disponible_ahora boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.solo_club, p.activa, public.promo_activa(p.id)
  from public.promotions p;
$$;


-- ---------------------------------------------------------------------
-- 4. Permiso de camarero
--    Ser camarero es independiente del rol: un camarero también es
--    socio (puede tener sus tickets) y un admin puede ser camarero.
--    Solo quien tiene es_camarero = true puede canjear.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists es_camarero boolean not null default false;

comment on column public.profiles.es_camarero is 'Puede canjear tickets en el bar. Se cambia desde el panel de Supabase o con admin_set_camarero().';

-- Nota: es_camarero NO está en los permisos de columna del usuario
-- (schema.sql), así que nadie puede cambiárselo desde la web.

-- protect_role ampliado (sustituye al de admin.sql).
-- Antes bloqueaba si había sesión (auth.uid() no nulo). Ahora bloquea si
-- el cambio llega DIRECTAMENTE desde la API (roles anon/authenticated).
-- Así se permite:
--   · el SQL Editor y el Table Editor de Supabase (rol postgres), y
--   · las funciones security definer como admin_set_camarero(), que
--     comprueban por dentro que quien llama es admin.
create or replace function public.protect_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.es_camarero is distinct from old.es_camarero)
     and current_user in ('anon', 'authenticated') then
    raise exception 'No está permitido cambiar el rol ni el permiso de camarero desde la web'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ¿Es camarero quien hace la petición? (análoga a is_admin)
create or replace function public.is_camarero()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and es_camarero
  );
$$;

-- Dar o quitar el permiso de camarero (solo admins).
create or replace function public.admin_set_camarero(p_user uuid, p_valor boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;

  update public.profiles set es_camarero = p_valor where id = p_user;
  if not found then
    raise exception 'USUARIO_NO_EXISTE';
  end if;
end;
$$;

-- admin_list_users ahora devuelve también es_camarero (para el panel).
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
  es_camarero        boolean,
  created_at         timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso solo para administradores' using errcode = '42501';
  end if;

  return query
    select p.id, p.nombre, u.email::text, p.telefono, p.fecha_nacimiento,
           p.acepta_email, p.acepta_whatsapp, p.role, p.es_camarero,
           p.created_at, u.email_confirmed_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Tickets
--    Estados: disponible → canjeado | caducado | anulado
--    (un admin puede "reabrir" un canje hecho por error).
--    Si el socio borra su cuenta, user_id pasa a null: el historial se
--    conserva para las estadísticas, pero sin datos personales.
--    Los packs (Pack Partido, Previa…) se cubren con UN ticket del socio
--    que hace el pedido; el resto de promos son por persona.
-- ---------------------------------------------------------------------
create table if not exists public.tickets (
  id                         uuid primary key default gen_random_uuid(),
  codigo                     text not null unique check (codigo ~ '^ALA-[2-9A-HJKMNP-Z]{4}$'),
  user_id                    uuid references auth.users (id) on delete set null,
  promo_id                   text not null references public.promotions (id) on update cascade,
  -- Copia de las condiciones al crear el ticket (el historial no cambia
  -- aunque la promo se edite después).
  promo_nombre               text not null,
  promo_descuento            text not null,
  estado                     text not null default 'disponible'
                               check (estado in ('disponible', 'canjeado', 'caducado', 'anulado')),
  created_at                 timestamptz not null default now(),
  expires_at                 timestamptz not null,
  canjeado_at                timestamptz,
  canjeado_por               uuid references auth.users (id) on delete set null,  -- el camarero
  anulado_at                 timestamptz,
  anulado_por                uuid references auth.users (id) on delete set null,
  motivo_anulacion           text,
  importe_descuento_centimos integer check (importe_descuento_centimos is null or importe_descuento_centimos >= 0),
  sale_id                    uuid   -- hueco para el futuro TPV (sin FK todavía)
);

comment on table public.tickets is 'Tickets de promos del club. Solo se crean/cambian mediante las funciones RPC.';

-- Un único ticket DISPONIBLE por socio y promo.
create unique index if not exists tickets_un_disponible_por_promo
  on public.tickets (user_id, promo_id)
  where estado = 'disponible';

-- "codigo" ya tiene índice por ser unique. Estos aceleran las consultas habituales.
create index if not exists tickets_user_created_idx  on public.tickets (user_id, created_at desc);
create index if not exists tickets_promo_created_idx on public.tickets (promo_id, created_at desc);

alter table public.tickets enable row level security;

-- Cada socio ve solo sus tickets; los admins los ven todos (para el panel).
drop policy if exists "Cada socio ve sus tickets" on public.tickets;
create policy "Cada socio ve sus tickets"
  on public.tickets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Los admins ven todos los tickets" on public.tickets;
create policy "Los admins ven todos los tickets"
  on public.tickets for select to authenticated
  using ((select public.is_admin()));

-- Nadie inserta, cambia ni borra directamente: todo pasa por las RPC.
revoke all on public.tickets from anon, authenticated;
grant select on public.tickets to authenticated;

-- Realtime: "Mis tickets" se entera al instante cuando un camarero canjea.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
     ) then
    alter publication supabase_realtime add table public.tickets;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Registro de eventos de cada ticket
--    Solo lo leen los admins y solo escriben en él las funciones RPC.
-- ---------------------------------------------------------------------
create table if not exists public.ticket_events (
  id        bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  tipo      text not null check (tipo in ('creado', 'canjeado', 'caducado', 'anulado', 'reabierto')),
  actor     uuid references auth.users (id) on delete set null,  -- quién lo hizo (null = el sistema)
  at        timestamptz not null default now(),
  detalle   jsonb not null default '{}'::jsonb
);

create index if not exists ticket_events_ticket_idx on public.ticket_events (ticket_id, at);

alter table public.ticket_events enable row level security;

drop policy if exists "Los admins ven el registro" on public.ticket_events;
create policy "Los admins ven el registro"
  on public.ticket_events for select to authenticated
  using ((select public.is_admin()));

revoke all on public.ticket_events from anon, authenticated;
grant select on public.ticket_events to authenticated;


-- ---------------------------------------------------------------------
-- 7. Funciones internas
-- ---------------------------------------------------------------------

-- Código ALA-XXXX con aleatoriedad criptográfica. Alfabeto de 31
-- caracteres sin los que se confunden (0/O, 1/I/L). Se descartan los
-- bytes >= 248 para que todas las letras tengan la misma probabilidad.
create or replace function public._generar_codigo_ticket()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  resultado text := '';
  bytes     bytea;
  b         integer;
  i         integer;
begin
  while length(resultado) < 4 loop
    bytes := extensions.gen_random_bytes(8);
    for i in 0 .. 7 loop
      b := get_byte(bytes, i);
      if b < 248 and length(resultado) < 4 then
        resultado := resultado || substr(alfabeto, (b % 31) + 1, 1);
      end if;
    end loop;
  end loop;
  return 'ALA-' || resultado;
end;
$$;

-- Acepta "ala-7k3p", " ALA-7K3P " o "7k3p".
create or replace function public._normalizar_codigo(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(trim(coalesce(p_codigo, ''))) ~ '^[2-9A-HJKMNP-Z]{4}$' then 'ALA-' || upper(trim(p_codigo))
    else upper(trim(coalesce(p_codigo, '')))
  end;
$$;

-- Marca como caducados los tickets disponibles que ya expiraron
-- (de un socio, o de todos si p_user es null) y lo deja registrado.
create or replace function public._caducar_tickets(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with caducados as (
    update public.tickets t
    set estado = 'caducado'
    where t.estado = 'disponible'
      and t.expires_at <= now()
      and (p_user is null or t.user_id = p_user)
    returning t.id
  )
  insert into public.ticket_events (ticket_id, tipo, detalle)
  select c.id, 'caducado', '{}'::jsonb from caducados c;

  get diagnostics n = row_count;
  return n;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. Funciones RPC (las que usa la web)
--    Los errores usan códigos estables en el mensaje para que la web los
--    traduzca: NO_AUTENTICADO, NO_ES_ADMIN, NO_ES_CAMARERO,
--    PROMO_NO_EXISTE, PROMO_NO_CLUB, PROMO_INACTIVA,
--    PROMO_FUERA_DE_HORARIO, LIMITE_USOS, TICKET_YA_DISPONIBLE,
--    TICKET_NO_EXISTE, TICKET_YA_CANJEADO, TICKET_CADUCADO,
--    TICKET_ANULADO, TICKET_PROPIO, TICKET_NO_VALIDO,
--    TICKET_NO_DISPONIBLE, TICKET_NO_CANJEADO, MOTIVO_OBLIGATORIO,
--    IMPORTE_INVALIDO, USUARIO_NO_EXISTE.
-- ---------------------------------------------------------------------

-- 8.1 El socio pide un ticket.
create or replace function public.create_ticket(p_promo_id text)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  p        public.promotions%rowtype;
  usados   integer;
  margen   integer;
  caduca   timestamptz;
  nuevo    public.tickets%rowtype;
  intento  integer := 0;
  restr    text;
begin
  if uid is null then
    raise exception 'NO_AUTENTICADO' using errcode = '42501';
  end if;

  -- Antes de nada, se ponen al día sus tickets caducados.
  perform public._caducar_tickets(uid);

  select * into p from public.promotions where id = p_promo_id;
  if not found then raise exception 'PROMO_NO_EXISTE'; end if;
  if not p.solo_club then raise exception 'PROMO_NO_CLUB'; end if;
  if not p.activa then raise exception 'PROMO_INACTIVA'; end if;
  if not public.promo_activa(p.id) then raise exception 'PROMO_FUERA_DE_HORARIO'; end if;

  if exists (
    select 1 from public.tickets t
    where t.user_id = uid and t.promo_id = p.id and t.estado = 'disponible'
  ) then
    raise exception 'TICKET_YA_DISPONIBLE';
  end if;

  -- Límite de usos: cuentan los canjeados dentro de la ventana.
  if p.max_usos is not null then
    select count(*) into usados
    from public.tickets t
    where t.user_id = uid
      and t.promo_id = p.id
      and t.estado in ('canjeado', 'disponible')
      and t.created_at >= public._inicio_ventana_usos(p.ventana_usos);
    if usados >= p.max_usos then
      raise exception 'LIMITE_USOS';
    end if;
  end if;

  -- Caducidad: lo primero que llegue entre el fin de la franja, el fin
  -- de la promo y el cierre de la jornada, más el margen de cortesía.
  select s.margen_cortesia_min into margen from public.app_settings s where s.id;
  caduca := least(public._fin_franja(p.id), p.fin, public._cierre_jornada())
            + make_interval(mins => coalesce(margen, 0));

  -- Inserta con un código nuevo; si coincide con uno existente, reintenta.
  loop
    intento := intento + 1;
    begin
      insert into public.tickets (codigo, user_id, promo_id, promo_nombre, promo_descuento, expires_at)
      values (public._generar_codigo_ticket(), uid, p.id, p.nombre, p.descuento_texto, caduca)
      returning * into nuevo;
      exit;
    exception when unique_violation then
      get stacked diagnostics restr = constraint_name;
      if restr = 'tickets_un_disponible_por_promo' then
        raise exception 'TICKET_YA_DISPONIBLE';   -- dos peticiones a la vez
      end if;
      if intento >= 20 then
        raise;
      end if;
    end;
  end loop;

  insert into public.ticket_events (ticket_id, tipo, actor, detalle)
  values (nuevo.id, 'creado', uid, jsonb_build_object('expires_at', nuevo.expires_at));

  return nuevo;
end;
$$;

-- 8.2 El camarero consulta un ticket (no cambia nada).
create or replace function public.lookup_ticket(p_codigo text)
returns table (
  valido          boolean,
  motivo          text,      -- null si es válido; si no, uno de los códigos de error
  codigo          text,
  estado          text,
  promo_id        text,
  promo_nombre    text,
  promo_descuento text,
  socio_nombre    text,      -- solo el nombre de pila
  created_at      timestamptz,
  expires_at      timestamptz,
  canjeado_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  t   public.tickets%rowtype;
  activa_promo boolean;
  nombre_socio text;
  m   text;
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;

  select * into t from public.tickets where tickets.codigo = public._normalizar_codigo(p_codigo);
  if not found then
    return query select false, 'TICKET_NO_EXISTE'::text, public._normalizar_codigo(p_codigo),
      null::text, null::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  select pr.activa into activa_promo from public.promotions pr where pr.id = t.promo_id;
  select nullif(split_part(trim(coalesce(pf.nombre, '')), ' ', 1), '') into nombre_socio
  from public.profiles pf where pf.id = t.user_id;

  m := case
    when t.estado = 'canjeado' then 'TICKET_YA_CANJEADO'
    when t.estado = 'anulado'  then 'TICKET_ANULADO'
    when t.estado = 'caducado' or t.expires_at <= now() then 'TICKET_CADUCADO'
    when t.user_id = uid       then 'TICKET_PROPIO'
    when t.user_id is null     then 'TICKET_NO_VALIDO'
    when not coalesce(activa_promo, false) then 'PROMO_INACTIVA'
    else null
  end;

  return query select m is null, m, t.codigo,
    case when t.estado = 'disponible' and t.expires_at <= now() then 'caducado' else t.estado end,
    t.promo_id, t.promo_nombre, t.promo_descuento, nombre_socio,
    t.created_at, t.expires_at, t.canjeado_at;
end;
$$;

-- 8.3 El camarero canjea un ticket.
--     Un único UPDATE con todas las condiciones: si dos camareros lo
--     intentan a la vez, solo uno lo consigue (el otro ve "ya canjeado").
--     Nota: aquí se comprueba el interruptor manual "activa", no la
--     franja horaria; la franja ya está reflejada en expires_at (así el
--     margen de cortesía funciona).
create or replace function public.redeem_ticket(p_codigo text, p_importe_centimos integer default null)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  cod  text := public._normalizar_codigo(p_codigo);
  t    public.tickets%rowtype;
  activa_promo boolean;
begin
  if not public.is_camarero() then
    raise exception 'NO_ES_CAMARERO' using errcode = '42501';
  end if;
  if p_importe_centimos is not null and p_importe_centimos < 0 then
    raise exception 'IMPORTE_INVALIDO';
  end if;

  update public.tickets tk
  set estado = 'canjeado',
      canjeado_at = now(),
      canjeado_por = uid,
      importe_descuento_centimos = p_importe_centimos
  where tk.codigo = cod
    and tk.estado = 'disponible'
    and tk.expires_at > now()
    and tk.user_id <> uid
    and exists (select 1 from public.promotions pr where pr.id = tk.promo_id and pr.activa)
  returning * into t;

  if found then
    insert into public.ticket_events (ticket_id, tipo, actor, detalle)
    values (t.id, 'canjeado', uid, jsonb_build_object('importe_descuento_centimos', p_importe_centimos));
    return t;
  end if;

  -- No se ha canjeado: averiguamos por qué.
  select * into t from public.tickets tk where tk.codigo = cod;
  if not found then raise exception 'TICKET_NO_EXISTE'; end if;
  if t.estado = 'canjeado' then raise exception 'TICKET_YA_CANJEADO'; end if;
  if t.estado = 'anulado'  then raise exception 'TICKET_ANULADO'; end if;
  if t.estado = 'caducado' or t.expires_at <= now() then raise exception 'TICKET_CADUCADO'; end if;
  if t.user_id = uid then raise exception 'TICKET_PROPIO'; end if;
  select pr.activa into activa_promo from public.promotions pr where pr.id = t.promo_id;
  if not coalesce(activa_promo, false) then raise exception 'PROMO_INACTIVA'; end if;
  raise exception 'TICKET_NO_VALIDO';
end;
$$;

-- 8.4 Un admin anula un ticket disponible (con motivo).
create or replace function public.admin_void_ticket(p_id uuid, p_motivo text)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t   public.tickets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_OBLIGATORIO';
  end if;

  update public.tickets tk
  set estado = 'anulado', anulado_at = now(), anulado_por = uid, motivo_anulacion = trim(p_motivo)
  where tk.id = p_id and tk.estado = 'disponible'
  returning * into t;

  if not found then
    if not exists (select 1 from public.tickets tk where tk.id = p_id) then
      raise exception 'TICKET_NO_EXISTE';
    end if;
    raise exception 'TICKET_NO_DISPONIBLE';
  end if;

  insert into public.ticket_events (ticket_id, tipo, actor, detalle)
  values (t.id, 'anulado', uid, jsonb_build_object('motivo', trim(p_motivo)));
  return t;
end;
$$;

-- 8.5 Un admin deshace un canje hecho por error (si aún no ha caducado).
create or replace function public.admin_reopen_ticket(p_id uuid, p_motivo text)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  antes public.tickets%rowtype;
  t     public.tickets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_OBLIGATORIO';
  end if;

  select * into antes from public.tickets tk where tk.id = p_id for update;
  if not found then raise exception 'TICKET_NO_EXISTE'; end if;
  if antes.estado <> 'canjeado' then raise exception 'TICKET_NO_CANJEADO'; end if;
  if antes.expires_at <= now() then raise exception 'TICKET_CADUCADO'; end if;

  begin
    update public.tickets tk
    set estado = 'disponible', canjeado_at = null, canjeado_por = null, importe_descuento_centimos = null
    where tk.id = p_id
    returning * into t;
  exception when unique_violation then
    raise exception 'TICKET_YA_DISPONIBLE';  -- el socio ya tiene otro disponible de esa promo
  end;

  insert into public.ticket_events (ticket_id, tipo, actor, detalle)
  values (t.id, 'reabierto', uid, jsonb_build_object(
    'motivo', trim(p_motivo),
    'canjeado_at_anterior', antes.canjeado_at,
    'canjeado_por_anterior', antes.canjeado_por,
    'importe_anterior', antes.importe_descuento_centimos
  ));
  return t;
end;
$$;

-- 8.6 Estadísticas por promo en un periodo (por defecto, últimos 30 días).
--     canjes_por_hora: {"20": 5, "21": 8, …} con la hora de Madrid.
create or replace function public.admin_ticket_stats(
  p_desde timestamptz default now() - interval '30 days',
  p_hasta timestamptz default now()
)
returns table (
  promo_id        text,
  promo_nombre    text,
  generados       bigint,
  canjeados       bigint,
  caducados       bigint,
  anulados        bigint,
  canjes_por_hora jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'NO_ES_ADMIN' using errcode = '42501';
  end if;

  return query
    select
      pr.id,
      pr.nombre,
      count(tk.id) filter (where tk.created_at  >= p_desde and tk.created_at  < p_hasta),
      count(tk.id) filter (where tk.canjeado_at >= p_desde and tk.canjeado_at < p_hasta),
      count(tk.id) filter (where (tk.estado = 'caducado' or (tk.estado = 'disponible' and tk.expires_at <= now()))
                             and tk.expires_at >= p_desde and tk.expires_at < p_hasta),
      count(tk.id) filter (where tk.anulado_at  >= p_desde and tk.anulado_at  < p_hasta),
      coalesce((
        select jsonb_object_agg(h.hora, h.n)
        from (
          select extract(hour from t2.canjeado_at at time zone 'Europe/Madrid')::integer as hora, count(*) as n
          from public.tickets t2
          where t2.promo_id = pr.id and t2.canjeado_at >= p_desde and t2.canjeado_at < p_hasta
          group by 1
        ) h
      ), '{}'::jsonb)
    from public.promotions pr
    left join public.tickets tk on tk.promo_id = pr.id
    group by pr.id, pr.nombre
    order by pr.nombre;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. Permisos de ejecución
--    Supabase deja por defecto que cualquiera ejecute las funciones
--    nuevas; aquí se ajusta quién puede llamar a cada una.
-- ---------------------------------------------------------------------
-- Funciones internas: nadie desde la web.
revoke execute on function public._jornada_fecha(timestamptz)                  from public, anon, authenticated;
revoke execute on function public._jornada_inicio(date)                        from public, anon, authenticated;
revoke execute on function public._cierre_jornada(timestamptz)                 from public, anon, authenticated;
revoke execute on function public._inicio_ventana_usos(text, timestamptz)      from public, anon, authenticated;
revoke execute on function public._fin_franja(text, timestamptz)               from public, anon, authenticated;
revoke execute on function public._generar_codigo_ticket()                     from public, anon, authenticated;
revoke execute on function public._normalizar_codigo(text)                     from public, anon, authenticated;
revoke execute on function public._caducar_tickets(uuid)                       from public, anon, authenticated;

-- Consultas públicas sobre promos: cualquiera (también sin sesión).
grant execute on function public.promo_activa(text, timestamptz) to anon, authenticated;
grant execute on function public.promos_estado()                to anon, authenticated;

-- Funciones para usuarios con sesión (cada una comprueba sus permisos dentro).
revoke execute on function public.is_camarero()                               from public, anon;
revoke execute on function public.admin_set_camarero(uuid, boolean)           from public, anon;
revoke execute on function public.admin_list_users()                          from public, anon;
revoke execute on function public.create_ticket(text)                         from public, anon;
revoke execute on function public.lookup_ticket(text)                         from public, anon;
revoke execute on function public.redeem_ticket(text, integer)                from public, anon;
revoke execute on function public.admin_void_ticket(uuid, text)               from public, anon;
revoke execute on function public.admin_reopen_ticket(uuid, text)             from public, anon;
revoke execute on function public.admin_ticket_stats(timestamptz, timestamptz) from public, anon;

grant execute on function public.is_camarero()                               to authenticated;
grant execute on function public.admin_set_camarero(uuid, boolean)           to authenticated;
grant execute on function public.admin_list_users()                          to authenticated;
grant execute on function public.create_ticket(text)                         to authenticated;
grant execute on function public.lookup_ticket(text)                         to authenticated;
grant execute on function public.redeem_ticket(text, integer)                to authenticated;
grant execute on function public.admin_void_ticket(uuid, text)               to authenticated;
grant execute on function public.admin_reopen_ticket(uuid, text)             to authenticated;
grant execute on function public.admin_ticket_stats(timestamptz, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- 10. Semilla: las 13 promos de src/data/promos.ts
--     Todas son de club (solo_club = true) y empiezan APAGADAS
--     (activa = false): el bar decide cuáles encender.
--     Límite inicial: 1 uso por socio y jornada (se cambia por promo).
--     Sin precios: descuento_texto describe el contenido.
--     "on conflict do nothing": volver a ejecutar el archivo no pisa los
--     cambios que hagáis después en estas promos.
-- ---------------------------------------------------------------------
insert into public.promotions
  (id, nombre, descuento_texto, solo_club, activa, inicio, fin, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos)
values
  ('desayuno-salmantino', 'Desayuno Salmantino',
   'Café con leche, cortado o solo + pincho de tortilla',
   true, false, null, null, '{1,2,3,4}', '08:00', '12:00', 1, 'dia'),
  ('desayuno-fuerte', 'Desayuno Fuerte',
   'Café con leche + montadito de lomo y queso o de bacon y queso',
   true, false, null, null, '{1,2,3,4}', '08:00', '12:00', 1, 'dia'),
  ('dos-canas-y-bravas', 'Dos cañas y bravas',
   '2 cañas Estrella + patatas bravas',
   true, false, null, null, '{1,2,3,4,5}', '16:00', '20:00', 1, 'dia'),
  ('pack-partido', 'Pack Partido',
   'Pack para 2: 2 cañones Estrella + patatas bravas + pincho de tortilla',
   true, false, null, null, null, '20:00', '03:00', 1, 'dia'),
  ('previa-alameda', 'Previa Alameda',
   'Pack para 4: 4 cañones Estrella + patatas bravas',
   true, false, null, null, null, '20:00', '03:00', 1, 'dia'),
  ('vermut-alameda', 'Vermut Alameda',
   '2 vermuts Izaguirre + patatas bravas + jeta',
   true, false, null, null, '{6,7}', null, null, 1, 'dia'),
  ('picoteo-para-4', 'Picoteo para 4',
   'Para compartir entre 4: 4 cañones Estrella + patatas bravas + pincho de tortilla + croquetas de jamón',
   true, false, null, null, '{6,7}', null, null, 1, 'dia'),
  ('cubo-5-botellines', 'Cubo 5 Botellines',
   '5 botellines Estrella Galicia',
   true, false, null, null, '{6,7}', null, null, 1, 'dia'),
  ('mesa-universitaria', 'Mesa Universitaria',
   '10 botellines Estrella',
   true, false, null, null, '{2}', '18:00', '21:00', 1, 'dia'),
  ('aperitivo-inauguracion', 'Aperitivo de inauguración',
   'Vermut Izaguirre + patatas bravas',
   true, false, '2026-10-31 00:00 Europe/Madrid', '2026-11-01 00:00 Europe/Madrid', '{6}', null, null, 1, 'dia'),
  ('chupito-disfrazado', 'Chupito disfrazado',
   'Chupito de licor de café (uno por persona si vienes disfrazado)',
   true, false, '2026-10-31 00:00 Europe/Madrid', '2026-11-01 00:00 Europe/Madrid', '{6}', null, null, 1, 'dia'),
  ('ronda-4-halloween', 'Ronda de 4 · Halloween',
   '4 cañas Estrella + patatas bravas + pincho de tortilla',
   true, false, '2026-10-31 00:00 Europe/Madrid', '2026-11-01 00:00 Europe/Madrid', '{6}', null, null, 1, 'dia'),
  ('ronda-gratis-sorteo', 'Ronda gratis + sorteo',
   'Ronda de 4 cañas gratis para la mesa ganadora del sorteo',
   true, false, '2026-10-31 00:00 Europe/Madrid', '2026-11-01 00:00 Europe/Madrid', '{6}', null, null, 1, 'dia')
on conflict (id) do nothing;


-- =====================================================================
--  EJEMPLOS (ejecútalos aparte, cambiando los datos)
--
--  · Dar el permiso de camarero a alguien (por su email):
--      update public.profiles set es_camarero = true
--      where id = (select id from auth.users where email = 'camarero@ejemplo.com');
--
--  · Quitarlo:
--      update public.profiles set es_camarero = false
--      where id = (select id from auth.users where email = 'camarero@ejemplo.com');
--
--  · Ver quién es camarero:
--      select u.email, p.nombre from public.profiles p
--      join auth.users u on u.id = p.id where p.es_camarero;
--
--  · Encender / apagar una promo:
--      update public.promotions set activa = true  where id = 'dos-canas-y-bravas';
--      update public.promotions set activa = false where id = 'dos-canas-y-bravas';
--
--  · Cambiar el límite de una promo (2 por semana, o sin límite):
--      update public.promotions set max_usos = 2, ventana_usos = 'semana' where id = 'vermut-alameda';
--      update public.promotions set max_usos = null where id = 'vermut-alameda';
--
--  · Cambiar la hora de cierre o el margen de cortesía:
--      update public.app_settings set hora_cierre = '02:30', margen_cortesia_min = 15;
--
--  · ¿Qué promos están disponibles ahora mismo?
--      select * from public.promos_estado() order by id;
--
--  · Tickets de la jornada de hoy:
--      select t.codigo, t.promo_nombre, t.estado, p.nombre as socio,
--             t.created_at at time zone 'Europe/Madrid' as creado,
--             t.canjeado_at at time zone 'Europe/Madrid' as canjeado
--      from public.tickets t
--      left join public.profiles p on p.id = t.user_id
--      where t.created_at >= public._jornada_inicio(public._jornada_fecha())
--      order by t.created_at desc;
-- =====================================================================


-- =====================================================================
--  PRUEBAS MANUALES (opcionales; NO cambian nada)
--
--  Cada bloque va entre "begin" y "rollback": al final se deshace todo.
--  Sustituye:
--    ID-SOCIO    → id de la cuenta de prueba normal
--    ID-CAMARERO → id de tu cuenta (en la prueba se le da el permiso)
--  (los ids están en Authentication → Users).
--  Ejecuta un bloque cada vez: el último SELECT debe dar el error indicado.
--
--  Preparación común (va al principio de cada bloque):
--    begin;
--    update public.promotions
--      set activa = true, inicio = null, fin = null, dias_semana = null,
--          hora_inicio = null, hora_fin = null, max_usos = 1, ventana_usos = 'dia'
--      where id = 'cubo-5-botellines';
--    update public.profiles set es_camarero = true where id = 'ID-CAMARERO';
--    set local role authenticated;
--
--  1) Canjear dos veces → TICKET_YA_CANJEADO
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    select set_config('prueba.codigo', (select codigo from public.create_ticket('cubo-5-botellines')), true);
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    select estado from public.redeem_ticket(current_setting('prueba.codigo'));   -- canjeado
--    select estado from public.redeem_ticket(current_setting('prueba.codigo'));   -- ERROR
--    rollback;
--
--  2) Canjear sin ser camarero → NO_ES_CAMARERO
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    select set_config('prueba.codigo', (select codigo from public.create_ticket('cubo-5-botellines')), true);
--    select estado from public.redeem_ticket(current_setting('prueba.codigo'));   -- ERROR
--    rollback;
--
--  3) Canjear un ticket propio → TICKET_PROPIO
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    select set_config('prueba.codigo', (select codigo from public.create_ticket('cubo-5-botellines')), true);
--    select estado from public.redeem_ticket(current_setting('prueba.codigo'));   -- ERROR
--    rollback;
--
--  4) Ticket de una promo apagada → PROMO_INACTIVA
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    select codigo from public.create_ticket('mesa-universitaria');               -- ERROR
--    rollback;
--
--  5) Superar el límite de usos → LIMITE_USOS
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    select set_config('prueba.codigo', (select codigo from public.create_ticket('cubo-5-botellines')), true);
--    select set_config('request.jwt.claims', '{"sub":"ID-CAMARERO","role":"authenticated"}', true);
--    select estado from public.redeem_ticket(current_setting('prueba.codigo'));   -- canjeado
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    select codigo from public.create_ticket('cubo-5-botellines');                -- ERROR
--    rollback;
--
--  6) Darse el permiso de camarero → permission denied
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    update public.profiles set es_camarero = true where id = 'ID-SOCIO';        -- ERROR
--    rollback;
--
--  (Extra) Ticket válido de principio a fin:
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    select codigo, estado, expires_at at time zone 'Europe/Madrid' as caduca
--      from public.create_ticket('cubo-5-botellines');
--    rollback;
-- =====================================================================
