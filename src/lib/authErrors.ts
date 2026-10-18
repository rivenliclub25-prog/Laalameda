import type { AuthError } from '@supabase/supabase-js';

const messages: Record<string, string> = {
  invalid_credentials: 'Email o contraseña incorrectos.',
  email_not_confirmed: 'Todavía no has confirmado tu email. Revisa tu bandeja de entrada (y la de spam).',
  user_already_exists: 'Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña.',
  email_exists: 'Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña.',
  weak_password: 'La contraseña es demasiado débil. Usa al menos 8 caracteres combinando letras y números.',
  same_password: 'La nueva contraseña debe ser distinta de la anterior.',
  email_address_invalid: 'Ese email no parece válido. Revísalo, por favor.',
  validation_failed: 'Revisa los datos del formulario.',
  over_email_send_rate_limit: 'Hemos enviado demasiados correos en poco tiempo. Espera unos minutos y vuelve a intentarlo.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
  signup_disabled: 'El registro está cerrado temporalmente.',
  email_provider_disabled: 'El registro con email está desactivado temporalmente.',
  session_not_found: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  session_expired: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  otp_expired: 'El enlace ha caducado o ya se ha usado. Solicita uno nuevo.',
  access_denied: 'El enlace no es válido o ha caducado. Solicita uno nuevo.',
};

const fallback = 'Algo ha salido mal. Inténtalo de nuevo en unos minutos.';

export function translateAuthErrorCode(code: string | null | undefined): string {
  return (code && messages[code]) || fallback;
}

export function translateAuthError(error: AuthError): string {
  if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
    return 'No hemos podido conectar. Revisa tu conexión a internet.';
  }
  return translateAuthErrorCode(error.code);
}
