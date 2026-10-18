import { createClient } from '@supabase/supabase-js';
import { publicBaseUrl } from '@/data/site';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** false si faltan las variables de entorno: la web sigue funcionando, pero el club se muestra como no disponible. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('[club] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY: el club de clientes está desactivado.');
}

/**
 * Datos que traen los enlaces de los correos de Supabase (confirmación, recuperación, OAuth).
 * Se leen antes de crear el cliente porque este limpia el hash de la URL al procesarlos.
 */
export interface AuthCallback {
  type: string | null;
  hasSession: boolean;
  errorCode: string | null;
  errorDescription: string | null;
}

function readAuthCallback(): AuthCallback | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  new URLSearchParams(window.location.search).forEach((value, key) => params.set(key, value));

  const hasSession = params.has('access_token');
  const errorCode = params.get('error_code') ?? params.get('error');
  if (!hasSession && !errorCode) return null;

  return {
    type: params.get('type'),
    hasSession,
    errorCode,
    errorDescription: params.get('error_description'),
  };
}

let pendingAuthCallback = readAuthCallback();

/** Devuelve el callback de la URL inicial una sola vez (StrictMode ejecuta los efectos dos veces). */
export function consumeAuthCallback(): AuthCallback | null {
  const callback = pendingAuthCallback;
  pendingAuthCallback = null;
  return callback;
}

/** URL a la que vuelven los enlaces de los correos. Funciona igual en localhost y en GitHub Pages. */
export function authRedirectUrl(): string {
  return `${window.location.origin}${publicBaseUrl}`;
}

// Con valores de relleno si no hay configuración, para no romper la web; las llamadas se bloquean con isSupabaseConfigured.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      // Implícito: los enlaces de los correos funcionan aunque se abran en otro navegador (habitual en móvil).
      flowType: 'implicit',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
