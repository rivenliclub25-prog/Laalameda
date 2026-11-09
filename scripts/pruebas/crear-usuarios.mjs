// Crea los usuarios de PRUEBAS (ENTORNOS.md, fase E4): admin, camarero, socio1 y socio2.
//
// Se registran como cualquier cliente (PRUEBAS no pide confirmación de email), con la clave pública
// de PRUEBAS; no hace falta ninguna clave secreta. Si un usuario ya existe, se deja como está.
// Escribe además el SQL que les da el rol de admin y el permiso de camarero (lo ejecuta el workflow).
//
// Variables (entorno "pruebas" de GitHub):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  Supabase de PRUEBAS
//   PRUEBAS_USUARIOS_CLAVE                     contraseña común de los usuarios de prueba
//   PRUEBAS_USUARIOS_EMAIL (opcional)          un correo real, p. ej. ana@gmail.com → ana+admin@gmail.com…
//                                              (solo si Supabase no acepta los @prueba.test)
//
// Uso: node scripts/pruebas/crear-usuarios.mjs <salida-roles.sql>

import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PROYECTO_PRUEBAS = 'hrhhkzajweggpnupytms';
const PROYECTO_PRODUCCION = 'hinebaxynlpjisteuaus';

const url = (process.env.VITE_SUPABASE_URL ?? '').trim();
const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const clave = process.env.PRUEBAS_USUARIOS_CLAVE ?? '';
const base = (process.env.PRUEBAS_USUARIOS_EMAIL ?? '').trim();
const salida = process.argv[2];

const fallo = (texto) => {
  console.error(`::error::${texto}`);
  process.exit(1);
};
if (!salida) fallo('Uso: node scripts/pruebas/crear-usuarios.mjs <salida-roles.sql>');
if (url.includes(PROYECTO_PRODUCCION) || !url.includes(PROYECTO_PRUEBAS)) fallo('VITE_SUPABASE_URL no es la de PRUEBAS.');
if (!anon) fallo('Falta VITE_SUPABASE_ANON_KEY (la de PRUEBAS).');
if (clave.length < 8) fallo('PRUEBAS_USUARIOS_CLAVE tiene que tener al menos 8 caracteres.');

function correo(usuario) {
  if (!base) return `${usuario}@prueba.test`;
  const [nombre, dominio] = base.split('@');
  if (!nombre || !dominio) fallo('PRUEBAS_USUARIOS_EMAIL no es un correo válido.');
  return `${nombre}+${usuario}@${dominio}`;
}

const USUARIOS = [
  { usuario: 'admin', nombre: 'Admin Pruebas', admin: true, camarero: true },
  { usuario: 'camarero', nombre: 'Camarero Pruebas', admin: false, camarero: true },
  { usuario: 'socio1', nombre: 'Socio Uno', admin: false, camarero: false },
  { usuario: 'socio2', nombre: 'Socio Dos', admin: false, camarero: false },
];

const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const filas = [];

for (const u of USUARIOS) {
  const email = correo(u.usuario);
  const { error } = await supabase.auth.signUp({
    email,
    password: clave,
    options: { data: { nombre: u.nombre, acepta_privacidad: true, acepta_email: false } },
  });
  if (!error) console.log(`✓ Creado ${email}`);
  else if (error.code === 'user_already_exists' || /already registered/i.test(error.message)) console.log(`· Ya existía ${email} (se deja como está)`);
  else if (error.code === 'email_address_invalid')
    fallo(`Supabase no acepta ${email}. Crea en el entorno pruebas el secreto PRUEBAS_USUARIOS_EMAIL con un correo tuyo (se usará con +admin, +camarero…) y vuelve a lanzarlo.`);
  else fallo(`No se pudo crear ${email}: ${error.code ?? ''} ${error.message}`);
  await supabase.auth.signOut();
  filas.push({ ...u, email });
}

const lista = (cond) => filas.filter(cond).map((f) => `'${f.email.replace(/'/g, "''")}'`).join(', ') || "''";
writeFileSync(
  salida,
  `-- Roles de los usuarios de PRUEBAS (generado por scripts/pruebas/crear-usuarios.mjs)
update public.profiles p set role = case when u.email in (${lista((f) => f.admin)}) then 'admin' else 'user' end,
  es_camarero = u.email in (${lista((f) => f.camarero)})
from auth.users u
where u.id = p.id and u.email in (${lista(() => true)});

select u.email, p.role, p.es_camarero from public.profiles p join auth.users u on u.id = p.id
where u.email in (${lista(() => true)}) order by u.email;
`
);
console.log(`✓ Roles preparados para ${filas.length} usuarios → ${salida}`);
