// Copia la carta PÚBLICA de la web real a PRUEBAS (ENTORNOS.md, fase E4).
//
// 1. Descarga catalogo.json de la web real (el archivo público que descarga cualquier visitante;
//    sin claves de producción). Se regenera en cada publicación de la web real.
// 2. Escribe un .sql que la carga en PRUEBAS: actualiza lo que ya existe y añade lo nuevo, sin
//    borrar (puede haber ventas o tickets de prueba que apunten a un producto o una promo). Lo que
//    ya no está en la carta real se oculta. Las promos quedan encendidas, para poder probarlas.
//
// Uso: node scripts/pruebas/carta-a-sql.mjs <salida.sql>   (lo lanza el workflow «Datos de PRUEBAS»)

import { writeFileSync } from 'node:fs';

const ORIGEN = process.env.CARTA_URL ?? 'https://rivenliclub25-prog.github.io/Laalameda/catalogo.json';
const salida = process.argv[2];
if (!salida) {
  console.error('Uso: node scripts/pruebas/carta-a-sql.mjs <salida.sql>');
  process.exit(1);
}

const respuesta = await fetch(`${ORIGEN}?t=${Date.now()}`);
if (!respuesta.ok) throw new Error(`No se pudo descargar la carta (${respuesta.status}) desde ${ORIGEN}`);
const carta = await respuesta.json();
for (const clave of ['categorias', 'secciones', 'productos', 'franjas', 'promos']) {
  if (!Array.isArray(carta[clave])) throw new Error(`La carta no tiene "${clave}": ¿es catalogo.json?`);
}

const json = JSON.stringify(carta);
if (json.includes('$carta$')) throw new Error('La carta contiene el delimitador $carta$');

const sql = `-- Generado por scripts/pruebas/carta-a-sql.mjs desde ${ORIGEN}
-- Carta del ${carta.generado_at}: ${carta.productos.length} productos y ${carta.promos.length} promos.
-- SOLO para PRUEBAS (lo ejecuta el workflow «Datos de PRUEBAS»).

create temporary table carta_publica (datos jsonb) on commit drop;
insert into carta_publica values ($carta$${json}$carta$::jsonb);

-- Categorías y secciones
insert into public.menu_categories (id, nombre, orden, visible)
select c.id, c.nombre, c.orden, true
from carta_publica, jsonb_to_recordset(datos -> 'categorias') as c (id text, nombre text, orden int)
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, visible = true;
update public.menu_categories set visible = false
where id not in (select x ->> 'id' from carta_publica, jsonb_array_elements(datos -> 'categorias') x);

insert into public.menu_sections (id, categoria_id, nombre, subtitulo, orden, visible)
select s.id, s.categoria_id, s.nombre, s.subtitulo, s.orden, true
from carta_publica, jsonb_to_recordset(datos -> 'secciones') as s (id text, categoria_id text, nombre text, subtitulo text, orden int)
on conflict (id) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre,
  subtitulo = excluded.subtitulo, orden = excluded.orden, visible = true;
update public.menu_sections set visible = false
where id not in (select x ->> 'id' from carta_publica, jsonb_array_elements(datos -> 'secciones') x);

-- Por si un producto de la carta pública está en una categoría o sección oculta (que no viene en la carta):
-- la categoría se crea oculta y la sección se deja vacía.
insert into public.menu_categories (id, nombre, visible)
select distinct x ->> 'categoria_id', x ->> 'categoria_id', false
from carta_publica, jsonb_array_elements(datos -> 'productos') x
where not exists (select 1 from public.menu_categories c where c.id = x ->> 'categoria_id');

-- Productos (mismo código que en la web real)
insert into public.products (id, categoria_id, seccion_id, nombre, descripcion, precio_centimos, recomendado, disponible, orden, activo)
select p.id, p.categoria_id,
  case when exists (select 1 from public.menu_sections s where s.id = p.seccion_id) then p.seccion_id end,
  p.nombre, p.descripcion, p.precio_centimos, p.recomendado, p.disponible, p.orden, true
from carta_publica, jsonb_to_recordset(datos -> 'productos') as p (
  id int, categoria_id text, seccion_id text, nombre text, descripcion text, precio_centimos int,
  recomendado boolean, disponible boolean, orden int)
on conflict (id) do update set categoria_id = excluded.categoria_id, seccion_id = excluded.seccion_id,
  nombre = excluded.nombre, descripcion = excluded.descripcion, precio_centimos = excluded.precio_centimos,
  recomendado = excluded.recomendado, disponible = excluded.disponible, orden = excluded.orden, activo = true;
update public.products set activo = false
where id not in (select (x ->> 'id')::int from carta_publica, jsonb_array_elements(datos -> 'productos') x);
select setval(pg_get_serial_sequence('public.products', 'id'), greatest((select max(id) from public.products), 1));

-- Franjas de las promos
insert into public.promo_segments (id, nombre, publico, orden, visible)
select f.id, f.nombre, f.publico, f.orden, true
from carta_publica, jsonb_to_recordset(datos -> 'franjas') as f (id text, nombre text, publico text, orden int)
on conflict (id) do update set nombre = excluded.nombre, publico = excluded.publico, orden = excluded.orden, visible = true;
update public.promo_segments set visible = false
where id not in (select x ->> 'id' from carta_publica, jsonb_array_elements(datos -> 'franjas') x);

-- Promos: encendidas para poder probarlas. Las nuevas, con el límite habitual (1 por jornada);
-- en las que ya existen no se tocan los límites (se pueden ajustar en el panel de PRUEBAS).
insert into public.promotions (id, nombre, tipo, solo_club, precio_centimos, descuento_pct, descripcion, contenidos,
  personas, texto_horario, mensaje_reserva, visible_hasta, exclusiva, orden, inicio, fin, dias_semana,
  hora_inicio, hora_fin, publicada, activa, max_usos, ventana_usos)
select p.id, p.nombre, p.tipo, p.solo_club, p.precio_centimos, p.descuento_pct, p.descripcion, coalesce(p.contenidos, '{}'),
  p.personas, p.texto_horario, p.mensaje_reserva, p.visible_hasta, p.exclusiva, p.orden, p.inicio, p.fin, p.dias_semana,
  p.hora_inicio, p.hora_fin, true, true, 1, 'dia'
from carta_publica, jsonb_to_recordset(datos -> 'promos') as p (
  id text, nombre text, tipo text, solo_club boolean, precio_centimos int, descuento_pct int, descripcion text,
  contenidos text[], personas int, texto_horario text, mensaje_reserva text, visible_hasta timestamptz,
  exclusiva boolean, orden int, inicio timestamptz, fin timestamptz, dias_semana int[], hora_inicio time, hora_fin time)
on conflict (id) do update set nombre = excluded.nombre, tipo = excluded.tipo, solo_club = excluded.solo_club,
  precio_centimos = excluded.precio_centimos, descuento_pct = excluded.descuento_pct, descripcion = excluded.descripcion,
  contenidos = excluded.contenidos, personas = excluded.personas, texto_horario = excluded.texto_horario,
  mensaje_reserva = excluded.mensaje_reserva, visible_hasta = excluded.visible_hasta, exclusiva = excluded.exclusiva,
  orden = excluded.orden, inicio = excluded.inicio, fin = excluded.fin, dias_semana = excluded.dias_semana,
  hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, publicada = true, activa = true;
update public.promotions set publicada = false, activa = false
where id not in (select x ->> 'id' from carta_publica, jsonb_array_elements(datos -> 'promos') x);

-- En qué franjas sale cada promo y qué productos lleva
delete from public.promotion_segments
where promo_id in (select x ->> 'id' from carta_publica, jsonb_array_elements(datos -> 'promos') x);
insert into public.promotion_segments (promo_id, segment_id)
select x ->> 'id', f
from carta_publica, jsonb_array_elements(datos -> 'promos') x, jsonb_array_elements_text(x -> 'franjas') f
where exists (select 1 from public.promo_segments s where s.id = f)
on conflict do nothing;

delete from public.promotion_items
where promo_id in (select x ->> 'id' from carta_publica, jsonb_array_elements(datos -> 'promos') x);
insert into public.promotion_items (promo_id, product_id, cantidad)
select x ->> 'id', (i ->> 'product_id')::int, (i ->> 'cantidad')::int
from carta_publica, jsonb_array_elements(datos -> 'promos') x, jsonb_array_elements(x -> 'items') i
where exists (select 1 from public.products p where p.id = (i ->> 'product_id')::int)
on conflict do nothing;

select (select count(*) from public.products where activo) as productos,
       (select count(*) from public.promotions where publicada) as promos;
`;

writeFileSync(salida, sql);
console.log(`✓ Carta del ${carta.generado_at}: ${carta.productos.length} productos y ${carta.promos.length} promos → ${salida}`);
