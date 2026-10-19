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

  // Rol del usuario conectado. Se guarda junto a su id para saber si corresponde a la sesión actual.
  const userId = session?.user.id ?? null;
  const [roleState, setRoleState] = useState<{ userId: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    if (!userId) {
      setRoleState(null);
      return;
    }
    let active = true;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        // Si falla (p. ej. aún no se ha ejecutado admin.sql), se trata como usuario normal.
        if (error) console.error('[club] No se pudo leer el rol:', error);
        setRoleState({ userId, isAdmin: data?.role === 'admin' });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const roleLoading = userId !== null && roleState?.userId !== userId;
  const isAdmin = !roleLoading && userId !== null && roleState?.isAdmin === true;

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      isAdmin,
      roleLoading,
      notice,
      notify: setNotice,
      clearNotice,
    }),
    [session, loading, isAdmin, roleLoading, notice, clearNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
