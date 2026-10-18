import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { consumeAuthCallback, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { translateAuthErrorCode } from '@/lib/authErrors';
import { navigate } from '@/lib/router';
import { AuthContext, type AuthNotice } from '@/auth/AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    // getSession espera a que el cliente procese el enlace del correo, si lo hay.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);

      const callback = consumeAuthCallback();
      if (!callback) return;

      // Supabase puede dejar parámetros en la query (?error=…); se limpian para que no reaparezcan al recargar.
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }

      if (callback.errorCode) {
        setNotice({ kind: 'error', text: translateAuthErrorCode(callback.errorCode) });
        navigate('/club', { replace: true });
      } else if (callback.type === 'recovery') {
        navigate('/nueva-contrasena', { replace: true });
      } else if (callback.hasSession && data.session) {
        if (callback.type === 'signup') {
          setNotice({ kind: 'success', text: '¡Email confirmado! Ya formas parte del club de La Alameda.' });
        }
        navigate('/perfil', { replace: true });
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (active) setSession(newSession);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      notice,
      notify: setNotice,
      clearNotice,
    }),
    [session, loading, notice, clearNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
