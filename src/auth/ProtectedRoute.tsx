import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { navigate } from '@/lib/router';

export function RouteLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-vino/25 border-t-vino" aria-hidden="true" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** Muestra su contenido solo con sesión iniciada; si no, lleva a la página de acceso. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const hashOnMount = useRef(window.location.hash);

  useEffect(() => {
    // Si ya se está navegando a otra página (p. ej. a la home al cerrar sesión), no se interfiere.
    if (!loading && !session && window.location.hash === hashOnMount.current) {
      navigate('/club', { replace: true });
    }
  }, [loading, session]);

  if (loading) return <RouteLoading />;

  return session ? <>{children}</> : null;
}
