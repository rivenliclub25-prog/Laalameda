import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  /**
   * true si el perfil tiene role = 'admin'. Solo sirve para mostrar u ocultar cosas en la web:
   * la seguridad real está en la base de datos (RLS y admin_list_users).
   */
  isAdmin: boolean;
  /** true mientras se consulta el rol del usuario recién conectado. */
  roleLoading: boolean;
  /** Mensaje tras volver de un enlace de correo (cuenta confirmada, enlace caducado…). */
  notice: AuthNotice | null;
  /** Deja un aviso para la siguiente página (p. ej. tras borrar la cuenta). */
  notify: (notice: AuthNotice) => void;
  clearNotice: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return value;
}

/** Recoge el aviso global para mostrarlo en la página actual, de modo que no reaparezca en otras. */
export function useAuthNotice() {
  const { notice, clearNotice } = useAuth();
  const [shown, setShown] = useState<AuthNotice | null>(notice);

  useEffect(() => {
    if (notice) {
      setShown(notice);
      clearNotice();
    }
  }, [notice, clearNotice]);

  const dismiss = useCallback(() => setShown(null), []);
  return [shown, dismiss] as const;
}
