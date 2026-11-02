import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface Profile {
  id: string;
  nombre: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  acepta_email: boolean;
  acepta_whatsapp: boolean;
  acepta_privacidad_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Columnas que el usuario puede editar (coinciden con el "grant update" de schema.sql). */
export type EditableProfile = Pick<Profile, 'nombre' | 'telefono' | 'fecha_nacimiento' | 'acepta_email' | 'acepta_whatsapp'>;

function translateDbError(error: PostgrestError): string {
  console.error('[club] Error de base de datos:', error);
  const text = 'No hemos podido guardar los cambios. Inténtalo de nuevo en unos minutos.';
  return import.meta.env.DEV ? `${text} [${error.code} · ${error.message}]` : text;
}

export async function fetchProfile(userId: string): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    return { profile: null, error: translateDbError(error).replace('guardar los cambios', 'cargar tu perfil') };
  }
  return { profile: data as Profile | null, error: null };
}

export async function updateProfile(
  userId: string,
  changes: EditableProfile
): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase.from('profiles').update(changes).eq('id', userId).select('*').single();
  if (error) return { profile: null, error: translateDbError(error) };
  return { profile: data as Profile, error: null };
}

// ---------------------------------------------------------------------
// Teléfono: se guarda siempre en formato internacional ("+34612345678"), listo para WhatsApp.
// En el formulario se elige el país (prefijo) y se escribe el número aparte.
// ---------------------------------------------------------------------

/** Prefijos del selector: España primero, luego vecinos y los países de donde más gente viene. */
export const PREFIJOS: { code: string; pais: string }[] = [
  { code: '+34', pais: 'España' },
  { code: '+351', pais: 'Portugal' },
  { code: '+33', pais: 'Francia' },
  { code: '+39', pais: 'Italia' },
  { code: '+49', pais: 'Alemania' },
  { code: '+44', pais: 'Reino Unido' },
  { code: '+353', pais: 'Irlanda' },
  { code: '+31', pais: 'Países Bajos' },
  { code: '+32', pais: 'Bélgica' },
  { code: '+41', pais: 'Suiza' },
  { code: '+376', pais: 'Andorra' },
  { code: '+40', pais: 'Rumanía' },
  { code: '+48', pais: 'Polonia' },
  { code: '+380', pais: 'Ucrania' },
  { code: '+212', pais: 'Marruecos' },
  { code: '+1', pais: 'EE. UU. / Canadá' },
  { code: '+52', pais: 'México' },
  { code: '+53', pais: 'Cuba' },
  { code: '+57', pais: 'Colombia' },
  { code: '+58', pais: 'Venezuela' },
  { code: '+593', pais: 'Ecuador' },
  { code: '+51', pais: 'Perú' },
  { code: '+591', pais: 'Bolivia' },
  { code: '+56', pais: 'Chile' },
  { code: '+54', pais: 'Argentina' },
  { code: '+598', pais: 'Uruguay' },
  { code: '+595', pais: 'Paraguay' },
  { code: '+55', pais: 'Brasil' },
  { code: '+86', pais: 'China' },
];

export const PREFIJO_POR_DEFECTO = '+34';
/** Valor del selector para escribir el número completo con un prefijo que no está en la lista. */
export const OTRO_PREFIJO = 'otro';

/** Separa el teléfono guardado en prefijo y número (el prefijo más largo que encaje). */
export function splitPhone(stored: string | null): { prefijo: string; numero: string } {
  const value = (stored ?? '').trim();
  if (!value) return { prefijo: PREFIJO_POR_DEFECTO, numero: '' };
  const match = [...PREFIJOS].sort((a, b) => b.code.length - a.code.length).find((p) => value.startsWith(p.code));
  return match ? { prefijo: match.code, numero: value.slice(match.code.length) } : { prefijo: OTRO_PREFIJO, numero: value };
}

/**
 * Junta prefijo y número en formato internacional. Devuelve null si está vacío y undefined si no
 * es válido. Si en el número se pega uno completo (+33… o 0033…), se usa tal cual.
 */
export function buildPhone(prefijo: string, numero: string): string | null | undefined {
  const compact = numero.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  if (!compact) return null;
  if (compact.startsWith('+') || prefijo === OTRO_PREFIJO) return /^\+\d{8,15}$/.test(compact) ? compact : undefined;
  if (!/^\d+$/.test(compact)) return undefined;
  if (prefijo === '+34') return /^[6789]\d{8}$/.test(compact) ? `+34${compact}` : undefined;
  // En casi todos los países el 0 inicial (p. ej. 07… en Reino Unido) no se marca con el prefijo; Italia sí lo mantiene.
  const nacional = prefijo === '+39' ? compact : compact.replace(/^0/, '');
  const full = `${prefijo}${nacional}`;
  return /^\+\d{8,15}$/.test(full) ? full : undefined;
}

/** "+34 612 345 678" para mostrar. */
export function formatPhone(stored: string | null): string {
  if (!stored) return '';
  const { prefijo, numero } = splitPhone(stored);
  if (prefijo === OTRO_PREFIJO) return stored;
  // De 3 en 3; si al final sobraría una cifra suelta, el último grupo va de 4 ("791 112 3456").
  const grupos = numero.match(/\d{1,3}/g) ?? [numero];
  if (grupos.length > 1 && grupos[grupos.length - 1].length === 1) {
    grupos.splice(-2, 2, grupos[grupos.length - 2] + grupos[grupos.length - 1]);
  }
  return `${prefijo} ${grupos.join(' ')}`;
}
