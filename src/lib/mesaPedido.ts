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

/** Envía una ronda: queda pendiente hasta que la acepte el camarero. */
export async function pedirRonda(
  token: string,
  items: ({ product_id: number; cantidad: number; notas?: string | null } | { promo_id: string; cantidad: number })[],
  requestId: string
): Promise<{ ok: boolean; error: string | null; code: string | null }> {
  const { error } = await supabase.rpc('socio_pedir_ronda', {
    p_token: token,
    p_items: items,
    p_client_request_id: requestId,
  });
  if (error) return { ok: false, error: translateTicketError(error), code: ticketErrorCode(error) };
  return { ok: true, error: null, code: null };
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
