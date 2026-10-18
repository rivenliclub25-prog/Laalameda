export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Escribe tu email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ese email no parece válido.';
  return undefined;
}

export function validateNewPassword(password: string): string | undefined {
  if (!password) return 'Escribe una contraseña.';
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  return undefined;
}

export function validatePasswordConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return 'Repite la contraseña.';
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return undefined;
}
