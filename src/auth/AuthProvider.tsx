import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { consumeAuthCallback, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { translateAuthErrorCode } from '@/lib/authErrors';
import { navigate } from '@/lib/router';
import { consumeGoogleFlag } from '@/lib/auth';
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
      const fromGoogle = consumeGoogleFlag();
      if (!callback) return;

      // Supabase puede dejar parámetros en la query (?error=…); se limpian para que no reaparezcan al recargar.
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }

      if (callback.errorCode && fromGoogle) {
        setNotice({
          kind: 'error',
          text:
            callback.errorCode === 'access_denied'
              ? 'Has cancelado el acceso con Google. Puedes intentarlo de nuevo o entrar con tu email.'
              : 'No hemos podido entrar con Google. Inténtalo de nuevo o entra con tu email y contraseña.',
        });
        navigate('/club', { replace: true, params: { modo: 'login' } });
      } else if (callback.errorCode) {
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

  // Permisos del usuario conectado (admin, camarero). Se guardan junto a su id para saber si
  // corresponden a la sesión actual.
  const userId = session?.user.id ?? null;
  const [roleState, setRoleState] = useState<{
    userId: string;
    isAdmin: boolean;
    esCamarero: boolean;
    privacidadPendiente: boolean;
  } | null>(null);
  const [perfilVersion, setPerfilVersion] = useState(0);
  const refreshPerfil = useCallback(() => setPerfilVersion((v) => v + 1), []);

  useEffect(() => {
    if (!userId) {
      setRoleState(null);
      return;
    }
    let active = true;
    supabase
      .from('profiles')
      // "*" en vez de columnas concretas: si falta alguna (SQL sin ejecutar), no falla todo.
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        // Si falla, se trata como usuario normal.
        if (error) console.error('[club] No se pudo leer el rol:', error);
        setRoleState({
          userId,
          isAdmin: data?.role === 'admin',
          esCamarero: data?.es_camarero === true,
          // Solo si el perfil existe y la columna viene vacía (alta con Google sin terminar).
          privacidadPendiente: !!data && 'acepta_privacidad_at' in data && data.acepta_privacidad_at === null,
        });
      });
    return () => {
      active = false;
    };
  }, [userId, perfilVersion]);

  const roleLoading = userId !== null && roleState?.userId !== userId;
  const isAdmin = !roleLoading && userId !== null && roleState?.isAdmin === true;
  const esCamarero = !roleLoading && userId !== null && roleState?.esCamarero === true;
  const privacidadPendiente = !roleLoading && userId !== null && roleState?.privacidadPendiente === true;

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      isAdmin,
      esCamarero,
      roleLoading,
      privacidadPendiente,
      refreshPerfil,
      notice,
      notify: setNotice,
      clearNotice,
    }),
    [session, loading, isAdmin, esCamarero, roleLoading, privacidadPendiente, refreshPerfil, notice, clearNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
