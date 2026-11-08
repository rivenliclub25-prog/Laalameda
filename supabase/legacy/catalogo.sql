-- =====================================================================
--  La Alameda — carta y promos en Supabase (fase P1a del POS)
--
--  Requisito: haber ejecutado antes schema.sql, admin.sql y tickets.sql
--  (y promos-clasico.sql si se usó).
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
--  archivo → Run. Se puede ejecutar varias veces:
--    · las tablas, funciones y permisos se recrean sin perder nada;
--    · los DATOS (productos, precios, promos…) se copian UNA sola vez.
--      Si lo vuelves a ejecutar, no pisa nada de lo cambiado en el panel.
--
--  Qué hace:
--    1. Crea las tablas de la carta (categorías, separadores, productos)
--       y de las promos (franjas, promo ↔ franja, productos de cada promo).
--    2. Amplía la tabla promotions (de tickets.sql) con lo que la web
--       necesita para pintarlas: precio, textos, franjas, visibilidad…
--    3. Permisos: la web (sin sesión) solo ve lo publicado; solo los
--       admins pueden cambiar algo.
--    4. Función catalogo(): toda la carta y las promos en una petición.
--    5. Copia la carta y las promos que hoy tiene la web (src/data):
--       precios de la hoja de cálculo; El Clásico con sus precios fijos.
--
--  Dinero en céntimos (enteros). Horas en Europe/Madrid.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Control de la migración de datos
--    Guarda qué copias de datos ya se hicieron, para no repetirlas.
-- ---------------------------------------------------------------------
create table if not exists public.catalogo_migraciones (
  id text primary key,
  at timestamptz not null default now()
);

alter table public.catalogo_migraciones enable row level security;
revoke all on public.catalogo_migraciones from anon, authenticated;


-- ---------------------------------------------------------------------
-- 1. Carta: categorías (pestañas), separadores y productos
-- ---------------------------------------------------------------------
create table if not exists public.menu_categories (
  id         text primary key check (id ~ '^[a-z0-9-]+$'),
  nombre     text not null,
  orden      integer not null default 0,
  visible    boolean not null default true,     -- false = pestaña oculta en la web
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Separadores dentro de una categoría (p. ej. Ginebras, Rones… en Copas).
create table if not exists public.menu_sections (
  id           text primary key check (id ~ '^[a-z0-9-]+$'),
  categoria_id text not null references public.menu_categories (id) on update cascade on delete cascade,
  nombre       text not null,
  subtitulo    text,                            -- p. ej. "solas o con tónica/refresco"
  orden        integer not null default 0,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.products (
  id              text primary key check (id ~ '^[a-z0-9-]+$'),  -- identificador estable (lo usará el POS)
  categoria_id    text not null references public.menu_categories (id) on update cascade,
  seccion_id      text references public.menu_sections (id) on update cascade on delete set null,
  nombre          text not null,
  descripcion     text,
  precio_centimos integer check (precio_centimos is null or precio_centimos >= 0),
  recomendado     boolean not null default false,
  activo          boolean not null default true,   -- false = no sale en la carta
  disponible      boolean not null default true,   -- false = agotado hoy (sigue en la carta)
  orden           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null  -- quién lo cambió por última vez
);

create index if not exists products_categoria_idx on public.products (categoria_id, orden);


-- ---------------------------------------------------------------------
-- 2. Promos: franjas, ampliación de promotions y sus relaciones
-- ---------------------------------------------------------------------
create table if not exists public.promo_segments (
  id         text primary key check (id ~ '^[a-z0-9-]+$'),
  nombre     text not null,                     -- p. ej. "☕ Mañanas"
  publico    text,                              -- p. ej. "Vecinos y trabajadores"
  orden      integer not null default 0,
  visible    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- promotions ya existe (tickets.sql). Solo se AÑADEN columnas; las que
-- ya tenía (activa, horario, límites…) no se tocan.
alter table public.promotions
  add column if not exists publicada       boolean not null default true,   -- se ve en la web
  add column if not exists tipo            text not null default 'pack',    -- pack | obsequio | sorteo
  add column if not exists precio_centimos integer,                         -- null = "Consulta condiciones"
  add column if not exists descuento_pct   integer,                         -- etiqueta "-29 %" (manual)
  add column if not exists descripcion     text,
  add column if not exists contenidos      text[] not null default '{}',
  add column if not exists personas        integer,                         -- "Para 4" y precio por persona
  add column if not exists texto_horario   text,                            -- "L-V · 16:00-20:00"
  add column if not exists mensaje_reserva text,                            -- WhatsApp de "Reservar"
  add column if not exists visible_hasta   timestamptz,                     -- deja de verse en la web
  add column if not exists exclusiva       boolean not null default false,  -- si hay alguna visible, oculta las demás
  add column if not exists orden           integer not null default 0,
  add column if not exists updated_by      uuid references auth.users (id) on delete set null;

alter table public.promotions drop constraint if exists promotions_tipo_check;
alter table public.promotions add constraint promotions_tipo_check check (tipo in ('pack', 'obsequio', 'sorteo'));
alter table public.promotions drop constraint if exists promotions_precio_check;
alter table public.promotions add constraint promotions_precio_check check (precio_centimos is null or precio_centimos >= 0);
alter table public.promotions drop constraint if exists promotions_descuento_check;
alter table public.promotions add constraint promotions_descuento_check check (descuento_pct is null or descuento_pct between 0 and 100);
alter table public.promotions drop constraint if exists promotions_personas_check;
alter table public.promotions add constraint promotions_personas_check check (personas is null or personas > 0);

-- En qué franjas aparece cada promo.
create table if not exists public.promotion_segments (
  promo_id   text not null references public.promotions (id) on update cascade on delete cascade,
  segment_id text not null references public.promo_segments (id) on update cascade on delete cascade,
  primary key (promo_id, segment_id)
);

-- Qué productos de la carta lleva cada promo (etiqueta "En promo" y,
-- en el futuro, el cálculo del descuento real en las ventas).
create table if not exists public.promotion_items (
  promo_id   text not null references public.promotions (id) on update cascade on delete cascade,
  product_id text not null references public.products (id) on update cascade on delete cascade,
  cantidad   integer not null default 1 check (cantidad > 0),
  primary key (promo_id, product_id)
);


-- ---------------------------------------------------------------------
-- 3. Fechas de cambio y quién cambió qué
-- ---------------------------------------------------------------------
create or replace function public.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by = auth.uid();   -- null si el cambio se hace desde el SQL Editor
  return new;
end;
$$;

drop trigger if exists menu_categories_set_updated_at on public.menu_categories;
create trigger menu_categories_set_updated_at before update on public.menu_categories
  for each row execute function public.set_updated_at();

drop trigger if exists menu_sections_set_updated_at on public.menu_sections;
create trigger menu_sections_set_updated_at before update on public.menu_sections
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_by on public.products;
create trigger products_set_updated_by before insert or update on public.products
  for each row execute function public.set_updated_by();

drop trigger if exists promo_segments_set_updated_at on public.promo_segments;
create trigger promo_segments_set_updated_at before update on public.promo_segments
  for each row execute function public.set_updated_at();

drop trigger if exists promotions_set_updated_by on public.promotions;
create trigger promotions_set_updated_by before insert or update on public.promotions
  for each row execute function public.set_updated_by();


-- ---------------------------------------------------------------------
-- 4. Seguridad (RLS)
--    · Sin sesión (anon) y socios: solo lo publicado/visible/activo.
--    · Admins: lo ven todo y pueden cambiarlo.
--    Las políticas de anon y de authenticated van separadas porque anon
--    no puede ejecutar is_admin().
-- ---------------------------------------------------------------------
alter table public.menu_categories    enable row level security;
alter table public.menu_sections      enable row level security;
alter table public.products           enable row level security;
alter table public.promo_segments     enable row level security;
alter table public.promotion_segments enable row level security;
alter table public.promotion_items    enable row level security;

-- Categorías
drop policy if exists "Web: categorías visibles" on public.menu_categories;
create policy "Web: categorías visibles" on public.menu_categories for select to anon
  using (visible);
drop policy if exists "Socios y admins: categorías" on public.menu_categories;
create policy "Socios y admins: categorías" on public.menu_categories for select to authenticated
  using (visible or (select public.is_admin()));
drop policy if exists "Admins gestionan categorías" on public.menu_categories;
create policy "Admins gestionan categorías" on public.menu_categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Separadores
drop policy if exists "Web: separadores visibles" on public.menu_sections;
create policy "Web: separadores visibles" on public.menu_sections for select to anon
  using (visible);
drop policy if exists "Socios y admins: separadores" on public.menu_sections;
create policy "Socios y admins: separadores" on public.menu_sections for select to authenticated
  using (visible or (select public.is_admin()));
drop policy if exists "Admins gestionan separadores" on public.menu_sections;
create policy "Admins gestionan separadores" on public.menu_sections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Productos
drop policy if exists "Web: productos activos" on public.products;
create policy "Web: productos activos" on public.products for select to anon
  using (activo);
drop policy if exists "Socios y admins: productos" on public.products;
create policy "Socios y admins: productos" on public.products for select to authenticated
  using (activo or (select public.is_admin()));
drop policy if exists "Admins gestionan productos" on public.products;
create policy "Admins gestionan productos" on public.products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Franjas
drop policy if exists "Web: franjas visibles" on public.promo_segments;
create policy "Web: franjas visibles" on public.promo_segments for select to anon
  using (visible);
drop policy if exists "Socios y admins: franjas" on public.promo_segments;
create policy "Socios y admins: franjas" on public.promo_segments for select to authenticated
  using (visible or (select public.is_admin()));
drop policy if exists "Admins gestionan franjas" on public.promo_segments;
create policy "Admins gestionan franjas" on public.promo_segments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Promos: sustituye la política de tickets.sql ("Todos ven las promos")
-- para que sin sesión solo se vean las PUBLICADAS. La de admins
-- ("Los admins gestionan las promos") se mantiene.
drop policy if exists "Todos ven las promos" on public.promotions;
drop policy if exists "Web: promos publicadas" on public.promotions;
create policy "Web: promos publicadas" on public.promotions for select to anon
  using (publicada);
drop policy if exists "Socios y admins: promos" on public.promotions;
create policy "Socios y admins: promos" on public.promotions for select to authenticated
  using (publicada or (select public.is_admin()));

-- Relaciones de promos: se ven si se ve la promo (la RLS de promotions se aplica dentro).
drop policy if exists "Se ven con su promo" on public.promotion_segments;
create policy "Se ven con su promo" on public.promotion_segments for select to anon, authenticated
  using (exists (select 1 from public.promotions p where p.id = promo_id));
drop policy if exists "Admins gestionan promo-franja" on public.promotion_segments;
create policy "Admins gestionan promo-franja" on public.promotion_segments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Se ven con su promo" on public.promotion_items;
create policy "Se ven con su promo" on public.promotion_items for select to anon, authenticated
  using (exists (select 1 from public.promotions p where p.id = promo_id));
drop policy if exists "Admins gestionan productos de promo" on public.promotion_items;
create policy "Admins gestionan productos de promo" on public.promotion_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Permisos de tabla (las políticas de arriba deciden qué filas).
revoke all on public.menu_categories, public.menu_sections, public.products, public.promo_segments,
              public.promotion_segments, public.promotion_items from anon, authenticated;
grant select on public.menu_categories, public.menu_sections, public.products, public.promo_segments,
                public.promotion_segments, public.promotion_items to anon, authenticated;
grant insert, update, delete on public.menu_categories, public.menu_sections, public.products,
                                public.promo_segments, public.promotion_segments, public.promotion_items
  to authenticated;


-- ---------------------------------------------------------------------
-- 5. promos_estado() (de tickets.sql), ahora sin promos sin publicar
--    para quien no es admin (el panel de admin las sigue viendo todas).
-- ---------------------------------------------------------------------
create or replace function public.promos_estado()
returns table (id text, solo_club boolean, activa boolean, disponible_ahora boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.solo_club, p.activa, public.promo_activa(p.id)
  from public.promotions p
  where p.publicada or public.is_admin();
$$;

grant execute on function public.promos_estado() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. catalogo(): la carta y las promos publicadas en UNA petición.
--    La usan la web y la copia de respaldo (public/catalogo.json), así
--    las dos tienen siempre la misma forma.
--    security invoker: se aplican también los permisos de arriba.
-- ---------------------------------------------------------------------
create or replace function public.catalogo()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'generado_at', now(),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'orden', c.orden) order by c.orden, c.id)
      from public.menu_categories c
      where c.visible
    ), '[]'::jsonb),
    'secciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'categoria_id', s.categoria_id, 'nombre', s.nombre, 'subtitulo', s.subtitulo, 'orden', s.orden
      ) order by s.orden, s.id)
      from public.menu_sections s
      where s.visible
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'categoria_id', p.categoria_id, 'seccion_id', p.seccion_id, 'nombre', p.nombre,
        'descripcion', p.descripcion, 'precio_centimos', p.precio_centimos, 'recomendado', p.recomendado,
        'disponible', p.disponible, 'orden', p.orden
      ) order by p.orden, p.id)
      from public.products p
      where p.activo
    ), '[]'::jsonb),
    'franjas', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre, 'publico', f.publico, 'orden', f.orden)
                       order by f.orden, f.id)
      from public.promo_segments f
      where f.visible
    ), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nombre', p.nombre, 'tipo', p.tipo, 'solo_club', p.solo_club,
        'precio_centimos', p.precio_centimos, 'descuento_pct', p.descuento_pct,
        'descripcion', p.descripcion, 'contenidos', to_jsonb(p.contenidos), 'personas', p.personas,
        'texto_horario', p.texto_horario, 'mensaje_reserva', p.mensaje_reserva,
        'visible_hasta', p.visible_hasta, 'exclusiva', p.exclusiva, 'orden', p.orden,
        'inicio', p.inicio, 'fin', p.fin, 'dias_semana', to_jsonb(p.dias_semana),
        'hora_inicio', p.hora_inicio, 'hora_fin', p.hora_fin,
        'franjas', coalesce((
          select jsonb_agg(ps.segment_id order by ps.segment_id)
          from public.promotion_segments ps where ps.promo_id = p.id
        ), '[]'::jsonb),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('product_id', pi.product_id, 'cantidad', pi.cantidad) order by pi.product_id)
          from public.promotion_items pi where pi.promo_id = p.id
        ), '[]'::jsonb)
      ) order by p.orden, p.id)
      from public.promotions p
      where p.publicada
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.catalogo() from public;
grant execute on function public.catalogo() to anon, authenticated;
revoke execute on function public.set_updated_by() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. Copia de la carta y las promos que hoy tiene la web (UNA sola vez)
--    Datos sacados de src/data tal como los ve el cliente: precios de la
--    hoja de cálculo y, en El Clásico, sus precios fijos de promos.ts.
--    En las promos que ya existen solo se rellenan las columnas nuevas:
--    no se tocan el interruptor, el horario ni los límites.
-- ---------------------------------------------------------------------
do $migracion$
begin
  if exists (select 1 from public.catalogo_migraciones where id = 'p1a-carta-y-promos') then
    raise notice 'La carta ya se copió antes: no se toca ningún dato.';
    return;
  end if;

  insert into public.menu_categories (id, nombre, orden) values
    ('cafeteria', 'Cafetería', 0),
    ('pinchos', 'Pinchos', 1),
    ('montaditos', 'Montaditos', 2),
    ('cervezas', 'Cervezas', 3),
    ('copas', 'Copas', 4),
    ('vinos', 'Vinos', 5),
    ('refrescos', 'Refrescos', 6)
  on conflict (id) do nothing;

  insert into public.menu_sections (id, categoria_id, nombre, subtitulo, orden) values
    ('copas-ginebras', 'copas', 'Ginebras', 'solas o con tónica/refresco', 0),
    ('copas-rones', 'copas', 'Rones', 'solos o con tónica/refresco', 1),
    ('copas-whisky', 'copas', 'Whisky', 'solo o con tónica/refresco', 2),
    ('copas-otros', 'copas', 'Otros', null, 3)
  on conflict (id) do nothing;

  insert into public.products (id, categoria_id, seccion_id, nombre, descripcion, precio_centimos, recomendado, orden) values
    ('cafeteria-solo', 'cafeteria', null, 'Solo', 'Café de especialidad, 100% origen colombiano', 190, false, 0),
    ('cafeteria-con-leche', 'cafeteria', null, 'Con leche', 'Café de especialidad, 100% origen colombiano', 300, false, 1),
    ('cafeteria-cortado', 'cafeteria', null, 'Cortado', 'Espresso con leche', 190, false, 2),
    ('cafeteria-irish-coffee', 'cafeteria', null, 'Irish Coffee', 'Café con nata', 350, true, 3),
    ('pinchos-patatas', 'pinchos', null, 'Patatas', 'Bravas / alioli', 300, false, 0),
    ('pinchos-jeta', 'pinchos', null, 'Jeta', null, 200, false, 1),
    ('pinchos-tortilla-de-patatas', 'pinchos', null, 'Tortilla de patatas', null, 300, false, 2),
    ('pinchos-mini-burguer', 'pinchos', null, 'Mini burguer', null, 200, false, 3),
    ('pinchos-perritos', 'pinchos', null, 'Perritos', null, 250, false, 4),
    ('pinchos-croquetas-de-jamon', 'pinchos', null, 'Croquetas de jamón', '1 unidad', 300, false, 5),
    ('montaditos-lomo-y-queso', 'montaditos', null, 'Lomo y queso', null, 200, false, 0),
    ('montaditos-bacon-y-queso', 'montaditos', null, 'Bacon y queso', null, 200, false, 1),
    ('montaditos-lomo-y-pimiento', 'montaditos', null, 'Lomo y pimiento', null, 200, false, 2),
    ('montaditos-pan-unidad', 'montaditos', null, 'Pan unidad', null, 50, false, 3),
    ('cervezas-cana', 'cervezas', null, 'Caña', 'Estrella, 25cl', 200, false, 0),
    ('cervezas-cana-1906', 'cervezas', null, 'Caña 1906', null, 300, false, 1),
    ('cervezas-canon', 'cervezas', null, 'Cañón', 'Estrella, 31cl', 200, false, 2),
    ('cervezas-canon-1906', 'cervezas', null, 'Cañón 1906', null, 300, false, 3),
    ('cervezas-botellin', 'cervezas', null, 'Botellín', 'Estrella, 25cl', 200, false, 4),
    ('cervezas-botellin-estrella-sin-gluten', 'cervezas', null, 'Botellín Estrella sin gluten', null, 250, false, 5),
    ('cervezas-tercio', 'cervezas', null, 'Tercio', 'Estrella — también sin alcohol y sin gluten', 250, false, 6),
    ('cervezas-premium-ipa', 'cervezas', null, 'Premium IPA', 'Baskeland', 350, true, 7),
    ('cervezas-radler', 'cervezas', null, 'Radler', 'Blemon', 300, false, 8),
    ('copas-seagram-s', 'copas', 'copas-ginebras', 'Seagram''s', null, 700, false, 0),
    ('copas-beefeater', 'copas', 'copas-ginebras', 'Beefeater', null, 700, false, 1),
    ('copas-bombay', 'copas', 'copas-ginebras', 'Bombay', null, 700, false, 2),
    ('copas-puerto-de-indias', 'copas', 'copas-ginebras', 'Puerto de Indias', null, 700, false, 3),
    ('copas-tanqueray', 'copas', 'copas-ginebras', 'Tanqueray', null, 700, false, 4),
    ('copas-larios', 'copas', 'copas-ginebras', 'Larios', null, 700, false, 5),
    ('copas-hendrick-s', 'copas', 'copas-ginebras', 'Hendrick''s', null, 800, true, 6),
    ('copas-barcelo', 'copas', 'copas-rones', 'Barceló', null, 700, false, 7),
    ('copas-brugal', 'copas', 'copas-rones', 'Brugal', null, 700, false, 8),
    ('copas-cacique', 'copas', 'copas-rones', 'Cacique', null, 700, false, 9),
    ('copas-bacardi-carta-blanca', 'copas', 'copas-rones', 'Bacardi Carta Blanca', null, 700, false, 10),
    ('copas-arehucas', 'copas', 'copas-rones', 'Arehucas', null, 700, false, 11),
    ('copas-capitan-morgan', 'copas', 'copas-rones', 'Capitán Morgan', null, 700, false, 12),
    ('copas-white-label', 'copas', 'copas-whisky', 'White Label', null, 700, false, 13),
    ('copas-red-label', 'copas', 'copas-whisky', 'Red Label', null, 700, false, 14),
    ('copas-dyc', 'copas', 'copas-whisky', 'DYC', null, 700, false, 15),
    ('copas-ballantine-s', 'copas', 'copas-whisky', 'Ballantine''s', null, 700, false, 16),
    ('copas-cutty-sark', 'copas', 'copas-whisky', 'Cutty Sark', null, 700, false, 17),
    ('copas-jb', 'copas', 'copas-whisky', 'JB', null, 700, false, 18),
    ('copas-dyc-8-anos', 'copas', 'copas-whisky', 'DYC 8 años', null, 800, false, 19),
    ('copas-black-label', 'copas', 'copas-whisky', 'Black Label', null, 900, false, 20),
    ('copas-gentleman-jack', 'copas', 'copas-whisky', 'Gentleman Jack', null, 900, false, 21),
    ('copas-glenfiddich', 'copas', 'copas-whisky', 'Glenfiddich', null, 1100, false, 22),
    ('copas-bailey-s', 'copas', 'copas-otros', 'Bailey''s', 'Solo / con hielo', 350, false, 23),
    ('copas-chupito-licor-de-cafe', 'copas', 'copas-otros', 'Chupito licor de café', null, 200, false, 24),
    ('copas-licor-de-hierbas', 'copas', 'copas-otros', 'Licor de hierbas', null, 200, false, 25),
    ('vinos-godello', 'vinos', null, 'Godello', 'Blanco', 350, false, 0),
    ('vinos-verdejo', 'vinos', null, 'Verdejo', 'Blanco', 300, false, 1),
    ('vinos-ribera', 'vinos', null, 'Ribera', 'Tinto', 300, false, 2),
    ('vinos-toro', 'vinos', null, 'Toro', 'Tinto', 350, false, 3),
    ('vinos-rioja', 'vinos', null, 'Rioja', 'Tinto', 300, false, 4),
    ('vinos-tinto-de-verano', 'vinos', null, 'Tinto de verano', null, 350, false, 5),
    ('vinos-vermut-izaguirre', 'vinos', null, 'Vermut Izaguirre', 'Blanco o Rosso', 250, false, 6),
    ('refrescos-coca-cola', 'refrescos', null, 'Coca-Cola', null, 250, false, 0),
    ('refrescos-coca-cola-zero', 'refrescos', null, 'Coca-Cola Zero', null, 250, false, 1),
    ('refrescos-coca-cola-zero-zero', 'refrescos', null, 'Coca-Cola Zero Zero', null, 250, false, 2),
    ('refrescos-fanta-naranja', 'refrescos', null, 'Fanta Naranja', null, 250, false, 3),
    ('refrescos-fanta-limon', 'refrescos', null, 'Fanta Limón', null, 250, false, 4),
    ('refrescos-fuze-limon', 'refrescos', null, 'Fuze Limón', null, 250, false, 5),
    ('refrescos-tonica', 'refrescos', null, 'Tónica', null, 250, false, 6),
    ('refrescos-aquarius', 'refrescos', null, 'Aquarius', null, 250, false, 7),
    ('refrescos-aquarius-naranja', 'refrescos', null, 'Aquarius Naranja', null, 250, false, 8),
    ('refrescos-agua', 'refrescos', null, 'Agua', null, 250, false, 9),
    ('refrescos-zumo', 'refrescos', null, 'Zumo', 'Piña, naranja o melocotón', 200, false, 10)
  on conflict (id) do nothing;

  insert into public.promo_segments (id, nombre, publico, orden) values
    ('el-clasico', '⚽ El Clásico', 'Hoy hay partido: promos solo para socios del club', 0),
    ('mananas', '☕ Mañanas', 'Vecinos y trabajadores', 1),
    ('tarde', '🍺 Tarde', 'Parejas y compañeros', 2),
    ('noche', '🌙 Noche', 'Grupos', 3),
    ('fin-de-semana', '🥂 Fin de semana', 'Planes de sábado y domingo', 4),
    ('universitarios', '🎓 Universitarios', 'Estudiantes', 5),
    ('31-octubre', '🎃 31 de octubre', 'Especial de inauguración', 6)
  on conflict (id) do nothing;

  -- Desayuno Salmantino
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('desayuno-salmantino', 'Desayuno Salmantino', 'Café con leche, cortado o solo + Pincho de tortilla', true, false, '{1,2,3,4}', '08:00', '12:00', 1, 'dia',
     true, 'pack', 400, 33, null, array['Café con leche, cortado o solo', 'Pincho de tortilla']::text[], null, 'L-J · 8:00-12:00',
     null, null, false, 0)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Desayuno Fuerte
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('desayuno-fuerte', 'Desayuno Fuerte', 'Café con leche + Montadito de lomo y queso o de bacon y queso', true, false, '{1,2,3,4}', '08:00', '12:00', 1, 'dia',
     true, 'pack', 400, 20, null, array['Café con leche', 'Montadito de lomo y queso o de bacon y queso']::text[], null, 'L-J · 8:00-12:00',
     null, null, false, 1)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Dos cañas y bravas
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('dos-canas-y-bravas', 'Dos cañas y bravas', '2 cañas Estrella + Patatas bravas', true, false, '{1,2,3,4,5}', '16:00', '20:00', 1, 'dia',
     true, 'pack', 500, 29, null, array['2 cañas Estrella', 'Patatas bravas']::text[], null, 'L-V · 16:00-20:00',
     null, null, false, 2)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Pack Partido
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('pack-partido', 'Pack Partido', '2 cañones Estrella + Patatas bravas + Pincho de tortilla', true, false, null, '20:00', '03:00', 1, 'dia',
     true, 'pack', 900, 10, 'Pack para 2', array['2 cañones Estrella', 'Patatas bravas', 'Pincho de tortilla']::text[], 2, 'Cada noche · 20:00-3:00',
     'Hola, quiero reservar para 2 con el Pack Partido', null, false, 3)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Previa Alameda
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('previa-alameda', 'Previa Alameda', '4 cañones Estrella + Patatas bravas', true, false, null, '20:00', '03:00', 1, 'dia',
     true, 'pack', 1100, 0, 'Pack para 4', array['4 cañones Estrella', 'Patatas bravas']::text[], 4, 'Cada noche · 20:00-3:00',
     'Hola, quiero reservar para 4 con la Previa Alameda', null, false, 4)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Vermut Alameda
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('vermut-alameda', 'Vermut Alameda', '2 vermuts Izaguirre + Patatas bravas + Jeta', true, false, '{6,7}', null, null, 1, 'dia',
     true, 'pack', 750, 25, null, array['2 vermuts Izaguirre', 'Patatas bravas', 'Jeta']::text[], null, 'S-D · fin de semana',
     null, null, false, 5)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Picoteo para 4
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('picoteo-para-4', 'Picoteo para 4', '4 cañones Estrella + Patatas bravas + Pincho de tortilla + Croquetas de jamón', true, false, '{6,7}', null, null, 1, 'dia',
     true, 'pack', 1700, 0, 'Para compartir entre 4', array['4 cañones Estrella', 'Patatas bravas', 'Pincho de tortilla', 'Croquetas de jamón']::text[], 4, 'S-D · fin de semana',
     'Hola, quiero reservar para 4 con el Picoteo para 4', null, false, 6)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Cubo 5 Botellines
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('cubo-5-botellines', 'Cubo 5 Botellines', '5 botellines Estrella Galicia', true, false, '{6,7}', null, null, 1, 'dia',
     true, 'pack', 900, 10, null, array['5 botellines Estrella Galicia']::text[], null, 'S-D · fin de semana',
     null, null, false, 7)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Mesa Universitaria
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('mesa-universitaria', 'Mesa Universitaria', '10 botellines Estrella', true, false, '{2}', '18:00', '21:00', 1, 'dia',
     true, 'pack', 1800, 10, 'Martes · de 18:00 a 21:00', array['10 botellines Estrella']::text[], null, 'Martes · 18:00-21:00',
     null, null, false, 8)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Aperitivo de inauguración
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('aperitivo-inauguracion', 'Aperitivo de inauguración', 'Vermut Izaguirre + Patatas bravas', true, false, '{6}', null, null, 1, 'dia',
     true, 'pack', 450, 18, null, array['Vermut Izaguirre', 'Patatas bravas']::text[], null, '31 de octubre',
     null, '2026-11-01 00:00 Europe/Madrid', false, 9)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Chupito disfrazado
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('chupito-disfrazado', 'Chupito disfrazado', 'Chupito de licor de café + Uno por persona si vienes disfrazado', true, false, '{6}', null, null, 1, 'dia',
     true, 'obsequio', 100, 50, null, array['Chupito de licor de café', 'Uno por persona si vienes disfrazado']::text[], null, '31 de octubre',
     null, '2026-11-01 00:00 Europe/Madrid', false, 10)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Ronda de 4 · Halloween
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('ronda-4-halloween', 'Ronda de 4 · Halloween', '4 cañas Estrella + Patatas bravas + Pincho de tortilla', true, false, '{6}', null, null, 1, 'dia',
     true, 'pack', 1200, 14, null, array['4 cañas Estrella', 'Patatas bravas', 'Pincho de tortilla']::text[], null, '31 de octubre',
     null, '2026-11-01 00:00 Europe/Madrid', false, 11)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- Ronda gratis + sorteo
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('ronda-gratis-sorteo', 'Ronda gratis + sorteo', 'Ronda de 4 cañas gratis para la mesa ganadora del sorteo', true, false, '{6}', null, null, 1, 'dia',
     true, 'sorteo', 0, 100, 'Participa en el sorteo de inauguración', array['Ronda de 4 cañas gratis para la mesa ganadora del sorteo']::text[], null, '31 de octubre',
     null, '2026-11-01 00:00 Europe/Madrid', false, 12)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- 4 cañones · El Clásico
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('clasico-4-canones', '4 cañones · El Clásico', '4 cañones Estrella', true, false, '{7}', '03:00', '03:00', 1, 'dia',
     true, 'pack', 900, null, 'Ronda para ver el partido', array['4 cañones Estrella']::text[], null, 'Hoy · hasta el cierre',
     null, '2026-10-26T03:00:00+01:00', true, 13)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  -- 4 tercios · El Clásico
  insert into public.promotions
    (id, nombre, descuento_texto, solo_club, activa, dias_semana, hora_inicio, hora_fin, max_usos, ventana_usos,
     publicada, tipo, precio_centimos, descuento_pct, descripcion, contenidos, personas, texto_horario,
     mensaje_reserva, visible_hasta, exclusiva, orden)
  values
    ('clasico-4-tercios', '4 tercios · El Clásico', '4 tercios Estrella', true, false, '{7}', '03:00', '03:00', 1, 'dia',
     true, 'pack', 1000, null, 'Ronda para ver el partido', array['4 tercios Estrella']::text[], null, 'Hoy · hasta el cierre',
     null, '2026-10-26T03:00:00+01:00', true, 14)
  on conflict (id) do update set
    publicada = excluded.publicada, tipo = excluded.tipo, precio_centimos = excluded.precio_centimos,
    descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion, contenidos = excluded.contenidos,
    personas = excluded.personas, texto_horario = excluded.texto_horario, mensaje_reserva = excluded.mensaje_reserva,
    visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva, orden = excluded.orden;

  insert into public.promotion_segments (promo_id, segment_id) values
    ('desayuno-salmantino', 'mananas'),
    ('desayuno-fuerte', 'mananas'),
    ('dos-canas-y-bravas', 'tarde'),
    ('pack-partido', 'noche'),
    ('previa-alameda', 'noche'),
    ('previa-alameda', 'universitarios'),
    ('vermut-alameda', 'fin-de-semana'),
    ('picoteo-para-4', 'fin-de-semana'),
    ('picoteo-para-4', 'universitarios'),
    ('cubo-5-botellines', 'fin-de-semana'),
    ('mesa-universitaria', 'universitarios'),
    ('aperitivo-inauguracion', '31-octubre'),
    ('chupito-disfrazado', '31-octubre'),
    ('ronda-4-halloween', '31-octubre'),
    ('ronda-gratis-sorteo', '31-octubre'),
    ('clasico-4-canones', 'el-clasico'),
    ('clasico-4-tercios', 'el-clasico')
  on conflict do nothing;

  insert into public.promotion_items (promo_id, product_id, cantidad) values
    ('dos-canas-y-bravas', 'cervezas-cana', 2),
    ('dos-canas-y-bravas', 'pinchos-patatas', 1),
    ('cubo-5-botellines', 'cervezas-botellin', 5)
  on conflict do nothing;

  insert into public.catalogo_migraciones (id) values ('p1a-carta-y-promos');
  raise notice 'Carta y promos copiadas.';
end;
$migracion$;


-- =====================================================================
--  COMPROBACIÓN RÁPIDA (puedes ejecutarla aparte)
--
--    select jsonb_array_length(c -> 'productos') as productos,
--           jsonb_array_length(c -> 'promos')    as promos
--    from (select public.catalogo() as c) x;
--
--  Debe dar 67 productos y 15 promos.
-- =====================================================================


-- =====================================================================
--  PRUEBAS MANUALES (opcionales; NO cambian nada)
--
--  Cada bloque va entre "begin" y "rollback". Sustituye ID-SOCIO por el
--  id de una cuenta normal e ID-ADMIN por el de tu cuenta de admin
--  (Authentication → Users).
--
--  1) Sin sesión se lee la carta → devuelve 67 y 15
--    begin;
--    set local role anon;
--    select jsonb_array_length(public.catalogo() -> 'productos'),
--           jsonb_array_length(public.catalogo() -> 'promos');
--    rollback;
--
--  2) Sin sesión NO se ve una promo sin publicar → devuelve 0
--    begin;
--    update public.promotions set publicada = false where id = 'pack-partido';
--    set local role anon;
--    select count(*) from public.promotions where id = 'pack-partido';
--    rollback;
--
--  3) Un socio no puede cambiar precios → 0 filas cambiadas (UPDATE 0)
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-SOCIO","role":"authenticated"}', true);
--    set local role authenticated;
--    update public.products set precio_centimos = 1 where id = 'cervezas-cana';
--    rollback;
--
--  4) Un admin sí puede → UPDATE 1, y queda registrado quién lo cambió
--    begin;
--    select set_config('request.jwt.claims', '{"sub":"ID-ADMIN","role":"authenticated"}', true);
--    set local role authenticated;
--    update public.products set precio_centimos = 250 where id = 'cervezas-cana'
--      returning precio_centimos, updated_by;
--    rollback;
--
--  5) Volver a ejecutar el archivo no pisa los cambios: cambia un precio
--     en el panel (o con un update), ejecuta otra vez todo el archivo y
--     comprueba que el precio sigue siendo el tuyo.
-- =====================================================================
