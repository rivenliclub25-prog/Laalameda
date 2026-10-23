import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { publicBaseUrl } from '@/data/site';
import { ticketErrorCode, translateTicketError } from '@/lib/ticketErrors';

/** Una fila de public.tickets (ver supabase/tickets.sql). */
export interface Ticket {
  id: string;
  codigo: string;
  user_id: string | null;
  promo_id: string;
  promo_nombre: string;
  promo_descuento: string;
  estado: 'disponible' | 'canjeado' | 'caducado' | 'anulado';
  created_at: string;
  expires_at: string;
  canjeado_at: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  importe_descuento_centimos: number | null;
}

/** Estado de una promo según promos_estado(). */
export interface PromoState {
  id: string;
  solo_club: boolean;
  activa: boolean;
  disponible_ahora: boolean;
}

// ---------------------------------------------------------------------
// Promos
// ---------------------------------------------------------------------

export async function fetchPromoStates(): Promise<Map<string, PromoState> | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('promos_estado');
  if (error) {
    console.error('[club] No se pudo leer el estado de las promos:', error);
    return null;
  }
  return new Map((data as PromoState[]).map((state) => [state.id, state]));
}

/**
 * Estado de todas las promos en una sola petición. Se refresca cada 5 minutos y al volver a la
 * pestaña, para que los botones cambien solos cuando empieza o termina una franja.
 */
export function usePromoStates() {
  const [states, setStates] = useState<Map<string, PromoState> | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await fetchPromoStates();
      if (!active) return;
      setStates(result);
      setLoaded(true);
    };
    load();
    const interval = window.setInterval(load, 5 * 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { states, loaded };
}

// ---------------------------------------------------------------------
// Tickets del socio
// ---------------------------------------------------------------------

export async function createTicket(
  promoId: string
): Promise<{ ticket: Ticket | null; error: string | null; code: string | null }> {
  const { data, error } = await supabase.rpc('create_ticket', { p_promo_id: promoId });
  if (error) return { ticket: null, error: translateTicketError(error), code: ticketErrorCode(error) };
  return { ticket: data as Ticket, error: null, code: null };
}

export async function fetchMyTickets(userId: string): Promise<{ tickets: Ticket[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { tickets: [], error: translateTicketError(error) };
  return { tickets: data as Ticket[], error: null };
}

/** Avisa en tiempo real de los cambios en los tickets del socio (p. ej. cuando el camarero canjea). */
export function subscribeMyTickets(userId: string, onChange: (ticket: Ticket) => void): () => void {
  const channel = supabase
    .channel(`mis-tickets-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets', filter: `user_id=eq.${userId}` },
      (payload: RealtimePostgresChangesPayload<Ticket>) => {
        if (payload.new && 'id' in payload.new) onChange(payload.new as Ticket);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------

/** URL que codifica el QR. El camarero puede leerla incluso con la cámara normal del móvil. */
export function ticketQrUrl(codigo: string): string {
  return `${window.location.origin}${publicBaseUrl}#/canjear?c=${encodeURIComponent(codigo)}`;
}

export type TicketDisplayState = 'disponible' | 'promo_desactivada' | 'canjeado' | 'caducado' | 'anulado';

/**
 * Estado que ve el socio. Un ticket con la hora pasada se muestra como caducado aunque la base de
 * datos aún no lo haya marcado, y uno disponible de una promo apagada, como "promo desactivada".
 */
export function ticketDisplayState(ticket: Ticket, promoActiva: boolean | undefined, now: number): TicketDisplayState {
  if (ticket.estado !== 'disponible') return ticket.estado;
  if (new Date(ticket.expires_at).getTime() <= now) return 'caducado';
  if (promoActiva === false) return 'promo_desactivada';
  return 'disponible';
}

/** "1 h 23 min", "12 min 05 s"… */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${String(s).padStart(2, '0')} s`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
