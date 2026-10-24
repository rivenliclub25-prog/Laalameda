import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';

/** Una fila de admin_list_users() (ver supabase/admin.sql). */
export interface AdminUser {
  id: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  fecha_nacimiento: string | null;
  acepta_email: boolean;
  acepta_whatsapp: boolean;
  role: 'user' | 'admin';
  /** Desde tickets.sql. Si aún no se ha ejecutado, llega undefined (se trata como false). */
  es_camarero?: boolean;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
}

export async function fetchAdminUsers(): Promise<{ users: AdminUser[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) {
    console.error('[club] Error al cargar los socios:', error);
    const text =
      error.code === '42501'
        ? 'Tu cuenta no tiene permisos de administrador.'
        : 'No hemos podido cargar los socios. Inténtalo de nuevo en unos minutos.';
    return { users: [], error: import.meta.env.DEV ? `${text} [${error.code} · ${error.message}]` : text };
  }
  return { users: (data ?? []) as AdminUser[], error: null };
}

/** Da o quita el permiso de camarero (RPC admin_set_camarero, solo admins). */
export async function setCamarero(userId: string, valor: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_camarero', { p_user: userId, p_valor: valor });
  return { error: error ? translateTicketError(error) : null };
}

// ---------------------------------------------------------------------
// Filtros, orden y contadores
// ---------------------------------------------------------------------

export interface AdminFilters {
  search: string;
  aceptaEmail: boolean;
  aceptaWhatsapp: boolean;
  cumpleEsteMes: boolean;
  camareros: boolean;
  sort: 'recientes' | 'antiguos';
}

export const defaultFilters: AdminFilters = {
  search: '',
  aceptaEmail: false,
  aceptaWhatsapp: false,
  cumpleEsteMes: false,
  camareros: false,
  sort: 'recientes',
};

/** Minúsculas y sin tildes, para que "jose" encuentre "José". */
function normalizeText(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Mes (1-12) de una fecha "AAAA-MM-DD", sin pasar por Date para evitar desfases de zona horaria. */
function birthMonth(fecha: string | null) {
  return fecha ? Number(fecha.slice(5, 7)) : null;
}

export function isBirthdayThisMonth(user: AdminUser, now = new Date()) {
  return birthMonth(user.fecha_nacimiento) === now.getMonth() + 1;
}

export function filterUsers(users: AdminUser[], filters: AdminFilters, now = new Date()): AdminUser[] {
  const query = normalizeText(filters.search.trim());
  const queryDigits = filters.search.replace(/\D/g, '');

  const result = users.filter((user) => {
    if (filters.aceptaEmail && !user.acepta_email) return false;
    if (filters.aceptaWhatsapp && !user.acepta_whatsapp) return false;
    if (filters.cumpleEsteMes && !isBirthdayThisMonth(user, now)) return false;
    if (filters.camareros && !user.es_camarero) return false;
    if (!query) return true;

    const inText = normalizeText(`${user.nombre ?? ''} ${user.email}`).includes(query);
    const inPhone = queryDigits.length >= 3 && (user.telefono ?? '').replace(/\D/g, '').includes(queryDigits);
    return inText || inPhone;
  });

  const direction = filters.sort === 'recientes' ? -1 : 1;
  return result.sort((a, b) => direction * a.created_at.localeCompare(b.created_at));
}

export function computeStats(users: AdminUser[], now = new Date()) {
  const since = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return {
    total: users.length,
    email: users.filter((u) => u.acepta_email).length,
    whatsapp: users.filter((u) => u.acepta_whatsapp).length,
    ultimos30: users.filter((u) => new Date(u.created_at).getTime() >= since).length,
  };
}

// ---------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------

export function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "12 de marzo" (sin año: para el panel basta con saber cuándo felicitar). */
export function formatBirthday(fecha: string | null) {
  if (!fecha) return '—';
  const [year, month, day] = fecha.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

// ---------------------------------------------------------------------
// Exportar CSV
// ---------------------------------------------------------------------

/**
 * Escapa un valor para CSV. Se evita además la "inyección de fórmulas":
 * si un texto empieza por =, @, + o - (seguido de algo que no sea un número), Excel podría
 * ejecutarlo como fórmula, así que se antepone una comilla simple.
 */
function csvCell(value: string | number | boolean | null) {
  let text = value === null ? '' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
  if (/^[=@\t\r]/.test(text) || /^[+-][^\d]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('es-ES') : '';
}

/** Marca de orden de bytes (BOM) para que Excel reconozca el UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** CSV separado por ";" y con BOM UTF-8, para que Excel en español lo abra con columnas y tildes bien. */
export function buildCsv(users: AdminUser[]) {
  const header = [
    'Nombre',
    'Email',
    'Teléfono',
    'Cumpleaños',
    'Acepta email',
    'Acepta WhatsApp',
    'Fecha de alta',
    'Email confirmado',
    'Rol',
    'Camarero',
  ];
  const rows = users.map((u) => [
    u.nombre,
    u.email,
    u.telefono,
    u.fecha_nacimiento ? u.fecha_nacimiento.split('-').reverse().join('/') : null,
    u.acepta_email,
    u.acepta_whatsapp,
    csvDate(u.created_at),
    u.email_confirmed_at !== null,
    u.role === 'admin' ? 'Admin' : 'Socio',
    u.es_camarero === true,
  ]);
  return BOM + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}

export function downloadCsv(users: AdminUser[], filters: AdminFilters) {
  const parts = ['socios-la-alameda'];
  if (filters.aceptaEmail) parts.push('email');
  if (filters.aceptaWhatsapp) parts.push('whatsapp');
  if (filters.cumpleEsteMes) parts.push('cumple-mes');
  if (filters.camareros) parts.push('camareros');
  parts.push(new Date().toISOString().slice(0, 10));

  const blob = new Blob([buildCsv(users)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${parts.join('-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
