import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';

/** Métodos de pago (POS.md, D12). */
export const METODOS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
} as const;
export type Metodo = keyof typeof METODOS;

/** Respuesta de pos_venta_barra() (ver supabase/pos.sql). */
export interface VentaResultado {
  sale_id: string;
  numero: number;
  bruto_centimos: number;
  total_centimos: number;
  metodo: Metodo;
  cobrado_at: string;
  /** true si ese mismo cobro ya se había registrado (doble toque o reintento). */
  repetida: boolean;
  lineas: { product_id: number; nombre: string; cantidad: number; precio_unitario_centimos: number }[];
}

/** "12,50 €" */
export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

/** Identificador único de cada intento de cobro (protege del doble toque). */
export function newRequestId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // Navegadores antiguos: UUID v4 con números aleatorios seguros.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Venta en barra ya pagada. Solo se envían códigos de producto y cantidades: el precio lo pone la
 * base de datos. Si el mismo requestId llega dos veces, devuelve la venta ya registrada.
 */
export async function ventaBarra(
  items: { product_id: number; cantidad: number }[],
  metodo: Metodo,
  requestId: string
): Promise<{ venta: VentaResultado | null; error: string | null }> {
  const { data, error } = await supabase.rpc('pos_venta_barra', {
    p_items: items,
    p_metodo: metodo,
    p_client_request_id: requestId,
  });
  if (error) return { venta: null, error: translateTicketError(error) };
  return { venta: data as VentaResultado, error: null };
}

// ---------------------------------------------------------------------
// Lectura de ventas (camareros y admins, por RLS)
// ---------------------------------------------------------------------

export interface VentaLinea {
  nombre: string;
  cantidad: number;
  precio_unitario_centimos: number;
  estado: string;
}

export interface Venta {
  id: string;
  numero: number;
  bruto_centimos: number;
  descuentos_centimos: number;
  total_centimos: number;
  metodo: Metodo;
  cobrado_por: string | null;
  cobrado_at: string;
  jornada: string;
  orders: { origen: 'barra' | 'mesa'; order_items: VentaLinea[] } | null;
}

const VENTA_COLS =
  'id, numero, bruto_centimos, descuentos_centimos, total_centimos, metodo, cobrado_por, cobrado_at, jornada, orders(origen, order_items(nombre, cantidad, precio_unitario_centimos, estado))';

/** Últimas ventas (para el TPV). */
export async function fetchUltimasVentas(limit = 10): Promise<{ ventas: Venta[]; error: string | null }> {
  const { data, error } = await supabase.from('sales').select(VENTA_COLS).order('cobrado_at', { ascending: false }).limit(limit);
  if (error) return { ventas: [], error: translateTicketError(error) };
  return { ventas: data as unknown as Venta[], error: null };
}

/** Ventas de un periodo (para el panel). */
export async function fetchVentas(desde: Date, hasta: Date): Promise<{ ventas: Venta[]; error: string | null }> {
  const { data, error } = await supabase
    .from('sales')
    .select(VENTA_COLS)
    .gte('cobrado_at', desde.toISOString())
    .lt('cobrado_at', hasta.toISOString())
    .order('cobrado_at', { ascending: false })
    .limit(2000);
  if (error) return { ventas: [], error: translateTicketError(error) };
  return { ventas: data as unknown as Venta[], error: null };
}

export function resumenVentas(ventas: Venta[]) {
  const porMetodo: Record<Metodo, { n: number; total: number }> = {
    efectivo: { n: 0, total: 0 },
    tarjeta: { n: 0, total: 0 },
    otro: { n: 0, total: 0 },
  };
  let total = 0;
  for (const v of ventas) {
    total += v.total_centimos;
    porMetodo[v.metodo].n += 1;
    porMetodo[v.metodo].total += v.total_centimos;
  }
  return { n: ventas.length, total, porMetodo, medio: ventas.length ? Math.round(total / ventas.length) : 0 };
}
