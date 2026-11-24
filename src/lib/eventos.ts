import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import { METODOS, formatEuros, type Metodo } from '@/lib/pos';

/**
 * Eventos con precio cerrado (EVENTOS.md). EV2: lo que necesita Panel → Eventos. Las escrituras van
 * siempre por las funciones de la base de datos (admin_guardar_evento, admin_confirmar_evento,
 * admin_cancelar_evento): el navegador nunca fija importes de cobro.
 */

export type EstadoEvento = 'borrador' | 'confirmado' | 'realizado' | 'cancelado';

export const ESTADOS_EVENTO: Record<EstadoEvento, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'border-carbon/25 bg-carbon/5 text-carbon/70' },
  confirmado: { texto: 'Confirmado', clase: 'border-vino/40 bg-vino/10 text-vino' },
  realizado: { texto: 'Realizado', clase: 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#1f4a2b]' },
  cancelado: { texto: 'Cancelado', clase: 'border-carbon/20 bg-white text-carbon/50 line-through' },
};

export interface EventoItem {
  id: string;
  product_id: number | null;
  concepto: string | null;
  cantidad: number;
  orden: number;
  /** Nombre del producto de la carta, si lo es. */
  producto: string | null;
}

export interface EventoPlazo {
  id: string;
  nombre: string;
  importe_centimos: number;
  orden: number;
  order_item_id: string | null;
  /** Venta en la que se cobró (null = pendiente). */
  venta: { numero: number; metodo: Metodo } | null;
}

export interface Evento {
  id: string;
  nombre: string;
  fecha: string;
  hora_inicio: string | null;
  personas: number | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  socio_id: string | null;
  precio_centimos: number;
  estado: EstadoEvento;
  notas: string | null;
  order_id: string | null;
  motivo_cancelacion: string | null;
  created_at: string;
  items: EventoItem[];
  plazos: EventoPlazo[];
  /** Todo lo cobrado en su cuenta (plazos y extras), menos lo devuelto. */
  cobrado_centimos: number;
  devuelto_centimos: number;
}

/** Lo que se envía a admin_guardar_evento. */
export interface DatosEvento {
  nombre: string;
  fecha: string;
  hora_inicio: string | null;
  personas: number | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  socio_id: string | null;
  precio_centimos: number;
  notas: string | null;
  items: ({ product_id: number; cantidad: number } | { concepto: string; cantidad: number })[];
  plazos: { id?: string; nombre: string; importe_centimos: number }[];
}

const mensaje = (e: PostgrestError) => translateTicketError(e);

type FilaEvento = Omit<Evento, 'items' | 'plazos' | 'cobrado_centimos' | 'devuelto_centimos'> & {
  evento_items: { id: string; product_id: number | null; concepto: string | null; cantidad: number; orden: number; products: { nombre: string } | null }[];
  evento_plazos: {
    id: string;
    nombre: string;
    importe_centimos: number;
    orden: number;
    anulado: boolean;
    order_item_id: string | null;
    order_items: { sale_id: string | null; sales: { numero: number; metodo: Metodo } | null } | null;
  }[];
};

// Entre plazos y líneas hay dos relaciones (plazo → su línea y línea → su plazo): se nombra la que se usa.
const EVENTO_COLS =
  'id, nombre, fecha, hora_inicio, personas, contacto_nombre, contacto_telefono, socio_id, precio_centimos, estado, notas, order_id, motivo_cancelacion, created_at, ' +
  'evento_items(id, product_id, concepto, cantidad, orden, products(nombre)), ' +
  'evento_plazos(id, nombre, importe_centimos, orden, anulado, order_item_id, order_items!evento_plazos_order_item_id_fkey(sale_id, sales!order_items_sale_id_fkey(numero, metodo)))';

export async function fetchEventos(): Promise<{ eventos: Evento[]; error: string | null }> {
  const { data, error } = await supabase.from('eventos').select(EVENTO_COLS).order('fecha', { ascending: true }).order('hora_inicio', { ascending: true });
  if (error) return { eventos: [], error: mensaje(error) };
  const filas = data as unknown as FilaEvento[];
  const cuentas = filas.map((f) => f.order_id).filter((x): x is string => !!x);
  const cobrado = new Map<string, { cobrado: number; devuelto: number }>();
  if (cuentas.length > 0) {
    const s = await supabase.from('sales').select('order_id, total_centimos, sale_refunds(importe_centimos)').in('order_id', cuentas);
    if (s.error) return { eventos: [], error: mensaje(s.error) };
    for (const v of s.data as { order_id: string; total_centimos: number; sale_refunds: { importe_centimos: number }[] }[]) {
      const c = cobrado.get(v.order_id) ?? { cobrado: 0, devuelto: 0 };
      c.cobrado += v.total_centimos;
      c.devuelto += (v.sale_refunds ?? []).reduce((t, r) => t + r.importe_centimos, 0);
      cobrado.set(v.order_id, c);
    }
  }
  const eventos = filas.map(({ evento_items, evento_plazos, ...e }) => ({
    ...e,
    items: [...evento_items]
      .sort((a, b) => a.orden - b.orden)
      .map((i) => ({ id: i.id, product_id: i.product_id, concepto: i.concepto, cantidad: i.cantidad, orden: i.orden, producto: i.products?.nombre ?? null })),
    plazos: evento_plazos
      .filter((p) => !p.anulado)
      .sort((a, b) => a.orden - b.orden)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        importe_centimos: p.importe_centimos,
        orden: p.orden,
        order_item_id: p.order_item_id,
        venta: p.order_items?.sale_id && p.order_items.sales ? { numero: p.order_items.sales.numero, metodo: p.order_items.sales.metodo } : null,
      })),
    cobrado_centimos: (e.order_id && cobrado.get(e.order_id)?.cobrado) || 0,
    devuelto_centimos: (e.order_id && cobrado.get(e.order_id)?.devuelto) || 0,
  }));
  return { eventos, error: null };
}

/** Lo pendiente de los plazos (sin contar extras). */
export const pendientePlazos = (e: Evento) => e.plazos.filter((p) => !p.venta).reduce((s, p) => s + p.importe_centimos, 0);

export async function guardarEvento(id: string | null, datos: DatosEvento): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_guardar_evento', { p_id: id, p_datos: datos });
  if (error) return { id: null, error: mensaje(error) };
  return { id: data as string, error: null };
}

export async function confirmarEvento(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_confirmar_evento', { p_id: id });
  return { error: error ? mensaje(error) : null };
}

export async function cancelarEvento(id: string, motivo: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_cancelar_evento', { p_id: id, p_motivo: motivo });
  return { error: error ? mensaje(error) : null };
}

// ---------------------------------------------------------------------
// Detalle: líneas de su cuenta (extras) y registro
// ---------------------------------------------------------------------

export interface LineaCuentaEvento {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unitario_centimos: number;
  estado: string;
  tipo_linea: string;
  sale_id: string | null;
}

export async function fetchLineasCuenta(orderId: string): Promise<{ lineas: LineaCuentaEvento[]; error: string | null }> {
  const { data, error } = await supabase
    .from('order_items')
    .select('id, nombre, cantidad, precio_unitario_centimos, estado, tipo_linea, sale_id, created_at')
    .eq('order_id', orderId)
    .order('created_at');
  if (error) return { lineas: [], error: mensaje(error) };
  return { lineas: data as LineaCuentaEvento[], error: null };
}

export interface RegistroEvento {
  id: number;
  tipo: string;
  actor: string | null;
  at: string;
  detalle: Record<string, unknown>;
}

/** Lo apuntado del evento: lo de su cuenta y lo de antes de tenerla (creado, editado…). */
export async function fetchRegistroEvento(eventoId: string, orderId: string | null): Promise<{ registro: RegistroEvento[]; error: string | null }> {
  let query = supabase.from('pos_events').select('id, tipo, actor, at, detalle').order('at').order('id');
  query = orderId ? query.or(`order_id.eq.${orderId},detalle->>evento_id.eq.${eventoId}`) : query.eq('detalle->>evento_id', eventoId);
  const { data, error } = await query;
  if (error) return { registro: [], error: mensaje(error) };
  return { registro: data as RegistroEvento[], error: null };
}

export const REGISTRO_TEXTO: Record<string, string> = {
  evento_creado: 'Evento creado',
  evento_editado: 'Evento cambiado',
  evento_confirmado: 'Confirmado (se abre su cuenta)',
  evento_cancelado: 'Cancelado',
  evento_realizado: 'Todo cobrado: realizado',
  abierta: 'Cuenta abierta',
  linea_anadida: 'Extra añadido',
  linea_aceptada: 'Aceptado',
  linea_servida: 'Servido',
  linea_anulada: 'Anulado',
  pagada: 'Cobro',
  cancelada: 'Cuenta cerrada',
  devuelta: 'Devolución',
  cuenta_impresa: 'Cuenta impresa',
};

// ---------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------

/** «Sábado, 5 de diciembre de 2026» a partir de «2026-12-05». */
export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const horaCorta = (h: string | null) => (h ? h.slice(0, 5) : null);

export const nombreItem = (i: EventoItem) => i.producto ?? i.concepto ?? '—';

/** Resumen del acuerdo en texto, para pegarlo en WhatsApp (no se envía nada solo). */
export function textoWhatsApp(e: Evento, bar: string): string {
  const lineas = [
    `*${bar}* · Acuerdo de evento`,
    `*${e.nombre}*`,
    `${fechaLarga(e.fecha)}${e.hora_inicio ? `, ${horaCorta(e.hora_inicio)}` : ''}${e.personas ? ` · unas ${e.personas} personas` : ''}`,
    '',
    '*Incluye:*',
    ...e.items.map((i) => `• ${i.cantidad} × ${nombreItem(i)}`),
    '',
    `*Precio cerrado: ${formatEuros(e.precio_centimos)}*`,
    ...e.plazos.map((p) => `• ${p.nombre}: ${formatEuros(p.importe_centimos)}${p.venta ? ` (pagado, ${METODOS[p.venta.metodo].toLowerCase()})` : ' (pendiente)'}`),
  ];
  if (e.notas) lineas.push('', e.notas);
  lineas.push('', 'Este documento no es una factura.');
  return lineas.join('\n');
}
