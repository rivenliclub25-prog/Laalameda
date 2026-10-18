import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthNotice {
  kind: 'success' | 'error';
  text: string;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** true mientras se recupera la sesión guardada al cargar la web. */
  loading: boolean;
  /** false si faltan las variables de entorno de Supabase. */
  configured: boolean;
  /** Mensaje tras volver de un enlace de correo (cuenta confirmada, enlace caducado…). */
  notice: AuthNotice | null;
  clearNotice: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return value;
}
