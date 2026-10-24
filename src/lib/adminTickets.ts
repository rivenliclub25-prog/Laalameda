import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import type { Ticket } from '@/lib/tickets';

/** Fila de public.promotions (ver supabase/tickets.sql). */
export interface PromotionRow {
  id: string;
  nombre: string;
  descuento_texto: string;
  solo_club: boolean;
  activa: boolean;
  inicio: string | null;
  fin: string | null;
  dias_semana: number[] | null; // 1 = lunes … 7 = domingo
  hora_inicio: string | null; // "16:00:00"
  hora_fin: string | null;
  max_usos: number | null;
  ventana_usos: 'total' | 'dia' | 'semana' | 'mes';
  created_at: string;
  updated_at: string;
}

export type PromotionChanges = Partial<
  Pick<PromotionRow, 'activa' | 'inicio' | 'fin' | 'dias_semana' | 'hora_inicio' | 'hora_fin' | 'max_usos' | 'ventana_usos'>
>;

export interface AppSettings {
  hora_cierre: string; // "03:00:00"
  margen_cortesia_min: number;
}

export interface TicketEvent {
  id: number;
  ticket_id: string;
  tipo: 'creado' | 'canjeado' | 'caducado' | 'anulado' | 'reabierto';
  actor: string | null;
  at: string;
  detalle: Record<string, unknown>;
}

export interface TicketStatsRow {
  promo_id: string;
  promo_nombre: string;
  generados: number;
  canjeados: number;
  caducados: number;
  anulados: number;
  canjes_por_hora: Record<string, number>;
}

/** Errores de tablas (no de RPC): las restricciones de la base de datos, en español. */
function dbError(error: PostgrestError): string {
  if (error.code === '23514') {
    console.error('[club] Restricción de la base de datos:', error);
    return 'Revisa los datos: el fin debe ser posterior al inicio, la franja necesita hora de inicio y de fin, y el límite debe ser mayor que 0.';
  }
  if (error.code === '42501') return 'Tu cuenta no tiene permisos para hacer este cambio.';
  return translateTicketError(error);
}

// ---------------------------------------------------------------------
// Promos y ajustes
// ---------------------------------------------------------------------

export async function fetchPromotions(): Promise<{ promos: PromotionRow[]; error: string | null }> {
  const { data, error } = await supabase.from('promotions').select('*').order('nombre');
  if (error) return { promos: [], error: dbError(error) };
  return { promos: data as PromotionRow[], error: null };
}

export async function updatePromotion(
  id: string,
  changes: PromotionChanges
): Promise<{ promo: PromotionRow | null; error: string | null }> {
  const { data, error } = await supabase.from('promotions').update(changes).eq('id', id).select('*').single();
  if (error) return { promo: null, error: dbError(error) };
  return { promo: data as PromotionRow, error: null };
}

export async function fetchAppSettings(): Promise<{ settings: AppSettings | null; error: string | null }> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('hora_cierre, margen_cortesia_min')
    .eq('id', true)
    .maybeSingle();
  if (error) return { settings: null, error: dbError(error) };
  return { settings: data as AppSettings | null, error: null };
}

export async function updateAppSettings(changes: AppSettings): Promise<{ settings: AppSettings | null; error: string | null }> {
  const { data, error } = await supabase
    .from('app_settings')
    .update(changes)
    .eq('id', true)
    .select('hora_cierre, margen_cortesia_min')
    .single();
  if (error) return { settings: null, error: dbError(error) };
  return { settings: data as AppSettings, error: null };
}

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

export interface TicketSearch {
  codigo?: string | null;
  userIds?: string[] | null;
  estado?: Ticket['estado'] | 'todos';
  limit?: number;
}

export async function searchTickets({
  codigo,
  userIds,
  estado = 'todos',
  limit = 50,
}: TicketSearch): Promise<{ tickets: Ticket[]; error: string | null }> {
  let query = supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(limit);
  if (codigo) query = query.eq('codigo', codigo);
  if (userIds) query = query.in('user_id', userIds);
  if (estado !== 'todos') query = query.eq('estado', estado);
  const { data, error } = await query;
  if (error) return { tickets: [], error: dbError(error) };
  return { tickets: data as Ticket[], error: null };
}

export async function fetchTicketEvents(ticketId: string): Promise<{ events: TicketEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('ticket_events')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('at', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { events: [], error: dbError(error) };
  return { events: data as TicketEvent[], error: null };
}

export async function voidTicket(id: string, motivo: string): Promise<{ ticket: Ticket | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_void_ticket', { p_id: id, p_motivo: motivo });
  if (error) return { ticket: null, error: translateTicketError(error) };
  return { ticket: data as Ticket, error: null };
}

export async function reopenTicket(id: string, motivo: string): Promise<{ ticket: Ticket | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_reopen_ticket', { p_id: id, p_motivo: motivo });
  if (error) return { ticket: null, error: translateTicketError(error) };
  return { ticket: data as Ticket, error: null };
}

export async function fetchTicketStats(
  desde: Date,
  hasta: Date
): Promise<{ rows: TicketStatsRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_ticket_stats', {
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
  });
  if (error) return { rows: [], error: translateTicketError(error) };
  return {
    rows: (data as TicketStatsRow[]).map((r) => ({
      ...r,
      generados: Number(r.generados),
      canjeados: Number(r.canjeados),
      caducados: Number(r.caducados),
      anulados: Number(r.anulados),
    })),
    error: null,
  };
}

// ---------------------------------------------------------------------
// Formatos y conversiones (el panel asume que el navegador está en hora de Madrid)
// ---------------------------------------------------------------------

export const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const; // índice + 1 = día ISO
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function diaLargo(iso: number) {
  return DIAS_LARGOS[iso - 1];
}

/** "08:00:00" → "08:00" (para <input type="time">). */
export function hhmm(time: string | null): string {
  return time ? time.slice(0, 5) : '';
}

/** timestamptz → valor de <input type="datetime-local"> en la hora del navegador. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> → ISO (o null si está vacío). */
export function fromDateTimeLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function describeDias(dias: number[] | null): string {
  if (!dias || dias.length === 0 || dias.length === 7) return 'Todos los días';
  return [...dias].sort((a, b) => a - b).map((d) => DIAS[d - 1]).join(' · ');
}

export function describeFranja(p: Pick<PromotionRow, 'hora_inicio' | 'hora_fin'>): string {
  if (!p.hora_inicio || !p.hora_fin) return 'Todo el día';
  return `${hhmm(p.hora_inicio)}–${hhmm(p.hora_fin)}`;
}

export function crossesMidnight(horaInicio: string, horaFin: string): boolean {
  return Boolean(horaInicio && horaFin && horaFin <= horaInicio);
}

const VENTANAS: Record<PromotionRow['ventana_usos'], string> = {
  total: 'en total',
  dia: 'por jornada',
  semana: 'por semana',
  mes: 'por mes',
};

export function describeLimite(p: Pick<PromotionRow, 'max_usos' | 'ventana_usos'>): string {
  if (!p.max_usos) return 'Sin límite de usos';
  return `${p.max_usos} ${p.max_usos === 1 ? 'uso' : 'usos'} ${VENTANAS[p.ventana_usos]} por socio`;
}

export function describePeriodo(p: Pick<PromotionRow, 'inicio' | 'fin'>): string | null {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (p.inicio && p.fin) return `Del ${fmt(p.inicio)} al ${fmt(p.fin)}`;
  if (p.inicio) return `Desde el ${fmt(p.inicio)}`;
  if (p.fin) return `Hasta el ${fmt(p.fin)}`;
  return null;
}

/** Inicio de la jornada actual según la hora de cierre ("03:00:00"): con cierre de madrugada, antes de esa hora es "ayer". */
export function jornadaInicio(horaCierre: string | null, now = new Date()): Date {
  const [h, m] = (horaCierre ?? '03:00').split(':').map(Number);
  const madrugada = h < 12;
  const start = new Date(now);
  start.setHours(madrugada ? h : 0, madrugada ? m : 0, 0, 0);
  if (madrugada && now < start) start.setDate(start.getDate() - 1);
  return start;
}
