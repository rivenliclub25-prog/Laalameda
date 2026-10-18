import { authRedirectUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { translateAuthError } from '@/lib/authErrors';

export interface AuthResult {
  error: string | null;
}

const notConfigured: AuthResult = { error: 'El club no está disponible en este momento.' };

export interface SignUpData {
  nombre: string;
  email: string;
  password: string;
  aceptaEmail: boolean;
}

/** Registra al usuario. Los datos de `options.data` los usa el trigger de la base de datos para crear el perfil. */
export async function signUp({ nombre, email, password, aceptaEmail }: SignUpData): Promise<AuthResult & { needsConfirmation: boolean }> {
  if (!isSupabaseConfigured) return { ...notConfigured, needsConfirmation: false };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: { nombre: nombre.trim(), acepta_email: aceptaEmail, acepta_privacidad: true },
    },
  });

  if (error) return { error: translateAuthError(error), needsConfirmation: false };

  // Con la confirmación activada, Supabase no da error si el email ya existe: devuelve un usuario sin identidades.
  if (data.user && data.user.identities?.length === 0) {
    return { error: 'Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña.', needsConfirmation: false };
  }

  return { error: null, needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return notConfigured;
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return { error: error ? translateAuthError(error) : null };
}

/** Cambiar a true cuando el proveedor Google esté activado en Supabase (ver guía). */
export const googleEnabled = false;

/** Preparado para cuando se active Google en Supabase (ver guía). */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isSupabaseConfigured) return notConfigured;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl() },
  });
  return { error: error ? translateAuthError(error) : null };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return notConfigured;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: authRedirectUrl(),
  });
  return { error: error ? translateAuthError(error) : null };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return notConfigured;
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error ? translateAuthError(error) : null };
}

/**
 * Borra de verdad la cuenta: la función SQL delete_user() elimina al usuario de auth.users
 * (solo el que tiene la sesión) y su perfil se borra en cascada.
 */
export async function deleteAccount(): Promise<AuthResult> {
  if (!isSupabaseConfigured) return notConfigured;
  const { error } = await supabase.rpc('delete_user');
  if (error) {
    console.error('[club] Error al borrar la cuenta:', error);
    const text = 'No hemos podido borrar la cuenta. Inténtalo de nuevo en unos minutos.';
    return { error: import.meta.env.DEV ? `${text} [${error.code} · ${error.message}]` : text };
  }
  // El usuario ya no existe en el servidor: basta con borrar la sesión guardada en este navegador.
  await supabase.auth.signOut({ scope: 'local' });
  return { error: null };
}

export async function signOut(): Promise<AuthResult> {
  if (!isSupabaseConfigured) return notConfigured;
  const { error } = await supabase.auth.signOut();
  return { error: error ? translateAuthError(error) : null };
}
