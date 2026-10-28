// Genera la copia de respaldo de la carta y las promos: public/catalogo.json (POS.md, D11).
//
//   npm run catalog-snapshot
//
// 1. La pide a Supabase (función catalogo(), con la clave pública).
// 2. Si Supabase no responde, descarga la copia de la web publicada.
// 3. Si tampoco, deja la que ya haya.
// Nunca termina con error: la publicación de la web no debe fallar por esto.
//
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del entorno (GitHub Secrets en la publicación) o,
// en local, del archivo .env.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OUTPUT = new URL('../public/catalogo.json', import.meta.url);
const ENV_FILE = new URL('../.env', import.meta.url);
const PUBLISHED_COPY =
  process.env.CATALOG_FALLBACK_URL ?? 'https://rivenliclub25-prog.github.io/Laalameda/catalogo.json';
const TIMEOUT_MS = 15_000;

function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  if (!existsSync(ENV_FILE)) return '';
  const line = readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${name}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

function isCatalog(value) {
  return Boolean(
    value &&
      typeof value.generado_at === 'string' &&
      ['categorias', 'secciones', 'productos', 'franjas', 'promos'].every((key) => Array.isArray(value[key]))
  );
}

async function fromSupabase() {
  const rawUrl = readEnv('VITE_SUPABASE_URL');
  const key = readEnv('VITE_SUPABASE_ANON_KEY');
  if (!rawUrl || !key) {
    console.log('· Sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: no se consulta Supabase.');
    return null;
  }
  const origin = new URL(rawUrl).origin; // por si la URL lleva /rest/v1/ detrás
  const response = await fetch(`${origin}/rest/v1/rpc/catalogo`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

async function fromPublishedSite() {
  const response = await fetch(PUBLISHED_COPY, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`La web publicada respondió ${response.status}`);
  return response.json();
}

async function main() {
  for (const [label, source] of [
    ['Supabase', fromSupabase],
    ['la web publicada', fromPublishedSite],
  ]) {
    try {
      const data = await source();
      if (data === null) continue;
      if (!isCatalog(data)) throw new Error('la respuesta no tiene la forma de catalogo()');
      writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
      console.log(
        `✓ Copia de la carta desde ${label}: ${data.productos.length} productos y ${data.promos.length} promos (${data.generado_at}).`
      );
      return;
    } catch (error) {
      console.warn(`· No se pudo obtener la copia desde ${label}: ${error.message}`);
    }
  }
  console.warn(
    existsSync(OUTPUT)
      ? '· Se mantiene la copia que ya había en public/catalogo.json.'
      : '· No hay copia de la carta: la web funcionará, pero sin respaldo si Supabase falla.'
  );
}

main().catch((error) => console.warn('· Error inesperado generando la copia de la carta:', error));
