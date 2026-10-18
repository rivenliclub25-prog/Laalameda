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

/**
 * Normaliza un teléfono para poder usarlo con WhatsApp: sin espacios ni guiones y con prefijo.
 * Los móviles y fijos españoles de 9 cifras reciben +34 automáticamente.
 * Devuelve null si está vacío y undefined si no es válido.
 */
export function normalizePhone(value: string): string | null | undefined {
  const compact = value.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  if (!compact) return null;
  if (/^[6789]\d{8}$/.test(compact)) return `+34${compact}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  return undefined;
}
