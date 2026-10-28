import { supabase } from '@/lib/supabase';
import { ticketErrorCode, translateTicketError } from '@/lib/ticketErrors';
import type { TipoLinea } from '@/lib/pos';

/** Mesa del QR (función pública mesa_info, ver supabase/pos-pedidos.sql). */
export interface MesaInfo {
  id: string;
  nombre: string;
  activa: boolean;
}

export async function mesaInfo(token: string): Promise<{ mesa: MesaInfo | null; error: string | null }> {
  const { data, error } = await supabase.rpc('mesa_info', { p_token: token });
  if (error) return { mesa: null, error: translateTicketError(error) };
  return { mesa: (data as MesaInfo | null) ?? null, error: null };
}

type ItemRonda = { product_id: number; cantidad: number; notas?: string | null } | { promo_id: string; cantidad: number };
type ResultadoRonda = { ok: boolean; error: string | null; code: string | null };

async function enviarRonda(fn: string, args: Record<string, unknown>): Promise<ResultadoRonda> {
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: translateTicketError(error), code: ticketErrorCode(error) };
  return { ok: true, error: null, code: null };
}

/** Envía una ronda desde el QR de la mesa: queda pendiente hasta que la acepte el camarero. */
export const pedirRonda = (token: string, items: ItemRonda[], requestId: string) =>
  enviarRonda('socio_pedir_ronda', { p_token: token, p_items: items, p_client_request_id: requestId });

/** Igual, con la mesa elegida a mano desde la carta (el TPV la marca para que el camarero lo compruebe). */
export const pedirRondaMesa = (mesaId: string, items: ItemRonda[], requestId: string) =>
  enviarRonda('socio_pedir_ronda_mesa', { p_mesa_id: mesaId, p_items: items, p_client_request_id: requestId });

/** Mesas activas para elegir (sin el código del QR). Solo con sesión (ver pos-pedir-sin-qr.sql). */
export async function mesasParaPedir(): Promise<{ mesas: { id: string; nombre: string }[]; error: string | null }> {
  const { data, error } = await supabase.rpc('mesas_para_pedir');
  if (error) return { mesas: [], error: translateTicketError(error) };
  return { mesas: (data as { id: string; nombre: string }[]) ?? [], error: null };
}

/** Última mesa elegida a mano en esta pestaña ("Seguir en Mesa 3"). */
const MESA_ELEGIDA_KEY = 'alameda-mesa-elegida';

export function loadMesaElegida(): string | null {
  try {
    return window.sessionStorage.getItem(MESA_ELEGIDA_KEY);
  } catch {
    return null;
  }
}

export function saveMesaElegida(mesaId: string) {
  try {
    window.sessionStorage.setItem(MESA_ELEGIDA_KEY, mesaId);
  } catch {
    // Sin almacenamiento (modo privado): no pasa nada, se vuelve a elegir.
  }
}

export interface MiPedido {
  id: string;
  nombre: string;
  promo_id: string | null;
  tipo_linea: TipoLinea;
  ticket_codigo: string | null;
  cantidad: number;
  precio_unitario_centimos: number;
  notas: string | null;
  estado: 'pendiente' | 'aceptada' | 'servida' | 'anulada';
  ronda: string | null;
  created_at: string;
}

/** Lo que ha pedido el socio en la cuenta abierta de esta mesa (la RLS solo deja ver lo suyo). */
export async function fetchMisPedidos(mesaId: string): Promise<{ pedidos: MiPedido[]; error: string | null }> {
  const { data, error } = await supabase
    .from('order_items')
    .select('id, nombre, promo_id, tipo_linea, ticket_codigo, cantidad, precio_unitario_centimos, notas, estado, ronda, created_at, orders!inner(mesa_id, estado)')
    .eq('orders.mesa_id', mesaId)
    .eq('orders.estado', 'abierta')
    .order('created_at', { ascending: true });
  if (error) return { pedidos: [], error: translateTicketError(error) };
  return { pedidos: data as unknown as MiPedido[], error: null };
}
