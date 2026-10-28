import { supabase } from '@/lib/supabase';

/**
 * Escucha cambios en tablas (Realtime de Supabase; respeta la RLS) y se reconecta sola si la
 * conexión falla o se cierra. Llama a onChange en cada inserción o cambio. Devuelve la función
 * para dejar de escuchar.
 */
export function subscribeChanges(
  name: string,
  tables: { table: string; filter?: string }[],
  onChange: () => void
): () => void {
  let stopped = false;
  let retryTimer: number | undefined;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const connect = () => {
    let current = supabase.channel(`${name}-${Date.now()}`);
    for (const t of tables) {
      current = current.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
        () => onChange()
      );
    }
    channel = current;
    current.subscribe((status, err) => {
      // Los avisos de canales viejos (p. ej. el CLOSED al quitarlos) se ignoran.
      if (stopped || channel !== current) return;
      if (import.meta.env.DEV) console.info(`[club] Tiempo real (${name}):`, status, err ?? '');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          if (stopped || channel !== current) return;
          channel = null;
          supabase.removeChannel(current);
          connect();
        }, 5000);
      }
    });
  };

  connect();
  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    const current = channel;
    channel = null;
    if (current) supabase.removeChannel(current);
  };
}
