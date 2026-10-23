import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RouteLoading } from '@/auth/ProtectedRoute';
import { getHashParams, navigate } from '@/lib/router';

/**
 * Solo para camareros (profiles.es_camarero). Sin sesión lleva a iniciar sesión y vuelve aquí con el
 * mismo código; con sesión pero sin el permiso, al perfil con un aviso.
 * Es una comodidad de la web: quien protege el canje es la base de datos (redeem_ticket).
 */
export function CamareroRoute({ children }: { children: ReactNode }) {
  const { session, loading, esCamarero, roleLoading, notify } = useAuth();
  const hashOnMount = useRef(window.location.hash);
  const checking = loading || roleLoading;

  useEffect(() => {
    if (checking || window.location.hash !== hashOnMount.current) return;
    if (!session) {
      const codigo = getHashParams().get('c');
      navigate('/club', {
        replace: true,
        params: { modo: 'login', volver: 'canjear', ...(codigo ? { c: codigo } : {}) },
      });
    } else if (!esCamarero) {
      notify({ kind: 'error', text: 'Este código lo canjea el personal del bar. Enséñaselo en la barra.' });
      navigate('/perfil', { replace: true });
    }
  }, [checking, session, esCamarero, notify]);

  if (checking) return <RouteLoading />;

  return session && esCamarero ? <>{children}</> : null;
}
