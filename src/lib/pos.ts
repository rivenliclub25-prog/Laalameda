import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import { publicBaseUrl } from '@/data/site';

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
  notas: string | null;
}

export interface Venta {
  id: string;
  numero: number;
  order_id: string;
  bruto_centimos: number;
  descuentos_centimos: number;
  total_centimos: number;
  metodo: Metodo;
  cobrado_por: string | null;
  cobrado_at: string;
  jornada: string;
  orders: { origen: 'barra' | 'mesa'; mesas: { nombre: string } | null; order_items: VentaLinea[] } | null;
  sale_refunds: { id: string; importe_centimos: number; motivo: string; por: string | null; at: string }[];
}

const VENTA_COLS =
  'id, numero, order_id, bruto_centimos, descuentos_centimos, total_centimos, metodo, cobrado_por, cobrado_at, jornada, ' +
  'orders(origen, mesas(nombre), order_items(nombre, cantidad, precio_unitario_centimos, estado, notas)), ' +
  'sale_refunds(id, importe_centimos, motivo, por, at)';

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

export function devueltoVenta(v: Venta): number {
  return (v.sale_refunds ?? []).reduce((sum, r) => sum + r.importe_centimos, 0);
}

/**
 * Resumen para cuadrar la caja: cobrado, devuelto y NETO (cobrado − devuelto), en total y por
 * método. Las cuentas canceladas nunca generan venta, así que no suman.
 */
export function resumenVentas(ventas: Venta[]) {
  const porMetodo: Record<Metodo, { n: number; total: number; devuelto: number; neto: number }> = {
    efectivo: { n: 0, total: 0, devuelto: 0, neto: 0 },
    tarjeta: { n: 0, total: 0, devuelto: 0, neto: 0 },
    otro: { n: 0, total: 0, devuelto: 0, neto: 0 },
  };
  let total = 0;
  let devuelto = 0;
  for (const v of ventas) {
    const d = devueltoVenta(v);
    total += v.total_centimos;
    devuelto += d;
    const m = porMetodo[v.metodo];
    m.n += 1;
    m.total += v.total_centimos;
    m.devuelto += d;
    m.neto += v.total_centimos - d;
  }
  return { n: ventas.length, total, devuelto, neto: total - devuelto, porMetodo, medio: ventas.length ? Math.round(total / ventas.length) : 0 };
}

// ---------------------------------------------------------------------
// Mesas y cuentas de mesa (P3, ver supabase/pos-mesas.sql)
// ---------------------------------------------------------------------

export interface Mesa {
  id: string;
  nombre: string;
  token: string;
  orden: number;
  activa: boolean;
}

export type EstadoLinea = 'pendiente' | 'aceptada' | 'servida' | 'anulada';

export interface LineaCuenta {
  id: string;
  product_id: number | null;
  nombre: string;
  precio_unitario_centimos: number;
  cantidad: number;
  notas: string | null;
  estado: EstadoLinea;
  created_at: string;
}

export interface CuentaMesa {
  id: string;
  mesa_id: string;
  estado: 'abierta' | 'pagada' | 'cancelada';
  created_at: string;
  order_items: LineaCuenta[];
}

/** Total que se cobraría: líneas aceptadas y servidas (las anuladas no cuentan). */
export function totalCuenta(cuenta: CuentaMesa): number {
  return cuenta.order_items
    .filter((l) => l.estado === 'aceptada' || l.estado === 'servida')
    .reduce((sum, l) => sum + l.precio_unitario_centimos * l.cantidad, 0);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: translateTicketError(error) };
  return { data: data as T, error: null };
}

export async function fetchMesas(): Promise<{ mesas: Mesa[]; error: string | null }> {
  const { data, error } = await supabase.from('mesas').select('id, nombre, token, orden, activa').order('orden').order('nombre');
  if (error) return { mesas: [], error: translateTicketError(error) };
  return { mesas: data as Mesa[], error: null };
}

const CUENTA_COLS =
  'id, mesa_id, estado, created_at, order_items(id, product_id, nombre, precio_unitario_centimos, cantidad, notas, estado, created_at)';

export async function fetchCuentasAbiertas(): Promise<{ cuentas: CuentaMesa[]; error: string | null }> {
  const { data, error } = await supabase.from('orders').select(CUENTA_COLS).eq('origen', 'mesa').eq('estado', 'abierta');
  if (error) return { cuentas: [], error: translateTicketError(error) };
  const cuentas = (data as unknown as CuentaMesa[]).map((c) => ({
    ...c,
    order_items: [...c.order_items].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
  return { cuentas, error: null };
}

export const abrirMesa = (mesaId: string) => rpc<string>('pos_abrir_mesa', { p_mesa_id: mesaId });

export const anadirLineas = (
  orderId: string,
  items: { product_id: number; cantidad: number; notas?: string | null }[],
  requestId: string
) =>
  rpc<{ repetida: boolean; lineas: number }>('pos_anadir_lineas', {
    p_order_id: orderId,
    p_items: items,
    p_client_request_id: requestId,
  });

export const servirLineas = (itemIds: string[]) => rpc<number>('pos_servir_lineas', { p_item_ids: itemIds });

export const anularLinea = (itemId: string, motivo: string) => rpc<null>('pos_anular_linea', { p_item_id: itemId, p_motivo: motivo });

export const cobrarCuenta = (orderId: string, metodo: Metodo) =>
  rpc<VentaResultado>('pos_cobrar_cuenta', { p_order_id: orderId, p_metodo: metodo });

export const cancelarCuenta = (orderId: string, motivo: string) =>
  rpc<null>('pos_cancelar_cuenta', { p_order_id: orderId, p_motivo: motivo });

export const cambiarMesa = (orderId: string, mesaId: string) =>
  rpc<null>('pos_cambiar_mesa', { p_order_id: orderId, p_mesa_id: mesaId });

// --- Admin: mesas y devoluciones ---

export async function createMesa(nombre: string, orden: number): Promise<{ mesa: Mesa | null; error: string | null }> {
  const { data, error } = await supabase.from('mesas').insert({ nombre, orden }).select('id, nombre, token, orden, activa').single();
  if (error) return { mesa: null, error: translateTicketError(error) };
  return { mesa: data as Mesa, error: null };
}

export async function updateMesa(
  id: string,
  changes: Partial<Pick<Mesa, 'nombre' | 'orden' | 'activa'>>
): Promise<{ mesa: Mesa | null; error: string | null }> {
  const { data, error } = await supabase.from('mesas').update(changes).eq('id', id).select('id, nombre, token, orden, activa').single();
  if (error) return { mesa: null, error: translateTicketError(error) };
  return { mesa: data as Mesa, error: null };
}

export const regenerarQrMesa = (mesaId: string) => rpc<string>('admin_regenerar_qr_mesa', { p_mesa_id: mesaId });

export const devolverVenta = (saleId: string, importeCentimos: number, motivo: string) =>
  rpc<{ refund_id: string; devuelto_centimos: number; restante_centimos: number }>('admin_devolver_venta', {
    p_sale_id: saleId,
    p_importe_centimos: importeCentimos,
    p_motivo: motivo,
  });

export interface PosEvento {
  id: number;
  tipo: string;
  actor: string | null;
  at: string;
  detalle: Record<string, unknown>;
}

export async function fetchEventosCuenta(orderId: string): Promise<{ eventos: PosEvento[]; error: string | null }> {
  const { data, error } = await supabase
    .from('pos_events')
    .select('id, tipo, actor, at, detalle')
    .eq('order_id', orderId)
    .order('at')
    .order('id');
  if (error) return { eventos: [], error: translateTicketError(error) };
  return { eventos: data as PosEvento[], error: null };
}

/** Enlace del QR de una mesa (la página para pedir desde la mesa llega en P4). */
export function mesaQrUrl(token: string): string {
  return `${window.location.origin}${publicBaseUrl}#/mesa?m=${encodeURIComponent(token)}`;
}
