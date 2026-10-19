import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RouteLoading } from '@/auth/ProtectedRoute';
import { navigate } from '@/lib/router';

/**
 * Solo para administradores. Sin sesión lleva a la página de acceso; con sesión pero sin ser admin, al perfil.
 * Es una comodidad de la web: los datos los protege la base de datos (admin_list_users comprueba el rol).
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { session, loading, isAdmin, roleLoading } = useAuth();
  const hashOnMount = useRef(window.location.hash);
  const checking = loading || roleLoading;

  useEffect(() => {
    if (checking || window.location.hash !== hashOnMount.current) return;
    if (!session) navigate('/club', { replace: true });
    else if (!isAdmin) navigate('/perfil', { replace: true });
  }, [checking, session, isAdmin]);

  if (checking) return <RouteLoading />;

  return session && isAdmin ? <>{children}</> : null;
}
