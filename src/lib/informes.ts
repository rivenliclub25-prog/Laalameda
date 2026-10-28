import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import { csvEuros, saveCsv, toCsv } from '@/lib/csv';
import { METODOS, TIPOS_PROMO, devueltoVenta, formatEuros, type Metodo, type Venta } from '@/lib/pos';

// ---------------------------------------------------------------------
// Cierre de jornada (ver supabase/pos-informes.sql)
// ---------------------------------------------------------------------

export interface MetodoCaja {
  ventas: number;
  cobrado_centimos: number;
  devuelto_centimos: number;
  neto_centimos: number;
}

/** Resumen de caja de una jornada o un periodo (_resumen_caja). */
export interface ResumenCaja {
  desde: string;
  hasta: string;
  ventas: number;
  cobrado_centimos: number;
  bruto_centimos: number;
  descuentos_centimos: number;
  devuelto_centimos: number;
  devoluciones: number;
  neto_centimos: number;
  por_metodo: Record<Metodo, MetodoCaja>;
  anuladas: number;
  anuladas_centimos: number;
  ultima_venta_numero: number | null;
  ultima_venta_at: string | null;
}

export interface Cierre {
  id: string;
  jornada: string;
  version: number;
  cerrado_por: string | null;
  cerrado_at: string;
  ventas: number;
  cobrado_centimos: number;
  descuentos_centimos: number;
  devuelto_centimos: number;
  neto_centimos: number;
  efectivo_neto_centimos: number;
  efectivo_contado_centimos: number | null;
  descuadre_centimos: number | null;
  notas: string | null;
  resumen: ResumenCaja;
}

export interface EstadoJornada {
  jornada: string;
  actual: boolean;
  resumen: ResumenCaja;
  mesas_abiertas: string[];
  ultimo_cierre: Cierre | null;
  ventas_despues_del_cierre: number;
  neto_despues_del_cierre_centimos: number;
}

export interface JornadaSinCerrar {
  jornada: string;
  ventas: number;
  actual: boolean;
  /** Ya tiene cierre (solo puede pasar con la actual: se puede volver a cerrar). */
  cerrada: boolean;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: translateTicketError(error) };
  return { data: data as T, error: null };
}

export const fetchJornadasSinCerrar = () => rpc<JornadaSinCerrar[]>('pos_jornadas_sin_cerrar');

export const fetchEstadoJornada = (jornada: string) => rpc<EstadoJornada>('pos_estado_jornada', { p_jornada: jornada });

export const cerrarJornada = (jornada: string, efectivoContado: number | null, notas: string | null) =>
  rpc<Cierre>('pos_cerrar_jornada', {
    p_jornada: jornada,
    p_efectivo_contado_centimos: efectivoContado,
    p_notas: notas,
  });

export async function fetchCierres(limit = 60): Promise<{ cierres: Cierre[]; error: string | null }> {
  const { data, error } = await supabase
    .from('cierres_jornada')
    .select('*')
    .order('jornada', { ascending: false })
    .order('version', { ascending: false })
    .limit(limit);
  if (error) return { cierres: [], error: translateTicketError(error) };
  return { cierres: data as Cierre[], error: null };
}

/** Descuadre con signo y texto: "Faltan 2,50 €", "Sobran 1,00 €", "Cuadra". */
export function textoDescuadre(cents: number | null): { text: string; className: string } | null {
  if (cents === null) return null;
  if (cents === 0) return { text: 'Cuadra', className: 'text-[#1f4a2b]' };
  return cents < 0
    ? { text: `Faltan ${formatEuros(-cents)}`, className: 'text-vino' }
    : { text: `Sobran ${formatEuros(cents)}`, className: 'text-[#7a4e00]' };
}

/**
 * Imprime solo el elemento con la clase .print-area (p. ej. la hoja de un cierre): el resto de la
 * página se oculta mientras dura la impresión (ver index.css).
 */
export function printArea() {
  const root = document.documentElement;
  root.classList.add('area-printing');
  const done = () => root.classList.remove('area-printing');
  window.addEventListener('afterprint', done, { once: true });
  window.print();
  window.setTimeout(done, 1000);
}

/** "martes, 28 de octubre" a partir de "2026-10-28" (sin líos de zona horaria). */
export function formatJornada(jornada: string, withYear = false): string {
  const [y, m, d] = jornada.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** "2026-10-28" de una fecha local. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(jornada: string, days: number): string {
  const [y, m, d] = jornada.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

// ---------------------------------------------------------------------
// Informe de un periodo (solo admins)
// ---------------------------------------------------------------------

export interface Informe {
  caja: ResumenCaja;
  productos: { id: number; nombre: string; unidades: number; importe_centimos: number }[];
  promos: {
    id: string;
    nombre: string;
    tipo: keyof typeof TIPOS_PROMO;
    usos: number;
    con_ticket: number;
    importe_centimos: number;
    ahorro_centimos: number;
  }[];
  camareros: { id: string; nombre: string; ventas: number; cobrado_centimos: number; anulaciones: number; anulado_centimos: number }[];
  socios: { id: string; nombre: string; cuentas: number; importe_centimos: number; promos_con_ticket: number; ahorro_centimos: number }[];
  por_hora: { hora: number; ventas: number; cobrado_centimos: number }[];
  anulaciones: { motivo: string; veces: number; importe_centimos: number }[];
  comprobacion: { suma_lineas_centimos: number; cobrado_centimos: number; cuadra: boolean };
}

export const fetchInforme = (desde: string, hasta: string) => rpc<Informe>('admin_informe', { p_desde: desde, p_hasta: hasta });

// ---------------------------------------------------------------------
// Exportar a CSV
// ---------------------------------------------------------------------

const ESTADOS: Record<string, string> = { pendiente: 'Pendiente', aceptada: 'Por servir', servida: 'Servida', anulada: 'Anulada' };

/** Ventas con una fila por línea (los datos de la venta se repiten en cada línea). */
export function downloadVentasCsv(ventas: Venta[], nombre: (id: string | null) => string, sufijo: string) {
  const header = [
    'Venta nº', 'Fecha', 'Hora', 'Jornada', 'Origen', 'Mesa', 'Método', 'Cobrada por',
    'Total venta (€)', 'Devuelto venta (€)', 'Producto o promo', 'Tipo', 'Cantidad', 'Precio unidad (€)',
    'Importe línea (€)', 'Ahorro (€)', 'Ticket', 'Estado línea', 'Notas',
  ];
  const rows = ventas.flatMap((v) => {
    const fecha = new Date(v.cobrado_at);
    const base = [
      v.numero,
      fecha.toLocaleDateString('es-ES'),
      fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      v.jornada.split('-').reverse().join('/'),
      v.orders?.origen === 'mesa' ? 'Mesa' : 'Barra',
      v.orders?.mesas?.nombre ?? '',
      METODOS[v.metodo],
      nombre(v.cobrado_por),
      csvEuros(v.total_centimos),
      csvEuros(devueltoVenta(v)),
    ];
    const lineas = v.orders?.order_items ?? [];
    if (lineas.length === 0) return [[...base, '', '', '', '', '', '', '', '', '']];
    return lineas.map((l) => [
      ...base,
      l.nombre,
      l.tipo_linea === 'producto' ? 'Producto' : TIPOS_PROMO[l.tipo_linea],
      l.cantidad,
      csvEuros(l.precio_unitario_centimos),
      csvEuros(l.estado === 'anulada' ? 0 : l.precio_unitario_centimos * l.cantidad),
      csvEuros(l.descuento_centimos),
      l.ticket_codigo ?? '',
      ESTADOS[l.estado] ?? l.estado,
      l.notas ?? '',
    ]);
  });
  saveCsv(`ventas-la-alameda-${sufijo}`, toCsv(header, rows));
}

export function downloadCierresCsv(cierres: Cierre[], nombre: (id: string | null) => string) {
  const header = [
    'Jornada', 'Versión', 'Cerrado', 'Por', 'Ventas', 'Cobrado (€)', 'Devuelto (€)', 'Neto (€)',
    'Efectivo neto (€)', 'Tarjeta neto (€)', 'Otro neto (€)', 'Efectivo contado (€)', 'Descuadre (€)',
    'Ahorro en promos (€)', 'Anulaciones', 'Anulado (€)', 'Notas',
  ];
  const rows = cierres.map((c) => [
    c.jornada.split('-').reverse().join('/'),
    c.version,
    new Date(c.cerrado_at).toLocaleString('es-ES'),
    nombre(c.cerrado_por),
    c.ventas,
    csvEuros(c.cobrado_centimos),
    csvEuros(c.devuelto_centimos),
    csvEuros(c.neto_centimos),
    csvEuros(c.resumen.por_metodo.efectivo.neto_centimos),
    csvEuros(c.resumen.por_metodo.tarjeta.neto_centimos),
    csvEuros(c.resumen.por_metodo.otro.neto_centimos),
    csvEuros(c.efectivo_contado_centimos),
    csvEuros(c.descuadre_centimos),
    csvEuros(c.descuentos_centimos),
    c.resumen.anuladas,
    csvEuros(c.resumen.anuladas_centimos),
    c.notas ?? '',
  ]);
  saveCsv(`cierres-la-alameda-${isoDate(new Date())}`, toCsv(header, rows));
}

/** Una tabla del informe tal cual se ve. */
export function downloadTablaCsv(nombreArchivo: string, header: string[], rows: (string | number)[][]) {
  saveCsv(nombreArchivo, toCsv(header, rows));
}
