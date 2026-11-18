import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import { parseNumero, type UnidadBase } from '@/lib/costes';
import type { LibroExcel } from '@/lib/xlsx';

/**
 * Rentabilidad R2: recetas, margen y etiqueta (RENTABILIDAD.md; migración
 * 20261118180000_costes_recetas.sql). Solo admins. El servidor es la fuente: aquí solo se repite
 * el cálculo para enseñarlo en directo mientras se escribe un precio o una receta.
 */

export type Etiqueta = 'bajo' | 'bueno' | 'muy_bueno' | 'excelente' | 'sin_coste' | 'sin_precio';

export const ETIQUETAS: Record<Etiqueta, { texto: string; clase: string; punto: string }> = {
  bajo: { texto: 'Bajo', clase: 'border-vino/40 bg-vino/10 text-vino', punto: 'bg-vino' },
  bueno: { texto: 'Bueno', clase: 'border-[#a86b00]/40 bg-[#a86b00]/10 text-[#7a4e00]', punto: 'bg-[#c98a00]' },
  muy_bueno: { texto: 'Muy bueno', clase: 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#2f6b3f]', punto: 'bg-[#3f8a52]' },
  excelente: { texto: 'Excelente', clase: 'border-[#1f4a2b] bg-[#1f4a2b] text-white', punto: 'bg-[#1f4a2b]' },
  sin_coste: { texto: 'Sin coste', clase: 'border-carbon/20 bg-carbon/5 text-carbon/60', punto: 'bg-carbon/30' },
  sin_precio: { texto: 'Sin precio', clase: 'border-carbon/20 bg-carbon/5 text-carbon/60', punto: 'bg-carbon/30' },
};

export const ORDEN_ETIQUETAS: Etiqueta[] = ['bajo', 'bueno', 'muy_bueno', 'excelente', 'sin_coste', 'sin_precio'];

export interface Ajustes {
  iva_defecto_pct: number;
  escala_bueno_pct: number;
  escala_muy_bueno_pct: number;
  escala_excelente_pct: number;
}

export const AJUSTES_POR_DEFECTO: Ajustes = { iva_defecto_pct: 10, escala_bueno_pct: 60, escala_muy_bueno_pct: 70, escala_excelente_pct: 80 };

export interface ProductoRentabilidad {
  product_id: number;
  nombre: string;
  categoria_id: string;
  categoria: string | null;
  categoria_orden: number | null;
  orden: number;
  activo: boolean;
  precio_centimos: number | null;
  lineas: number;
  coste: number | null;
  precio_sin_iva: number | null;
  margen_pct: number | null;
  ganancia: number | null;
  etiqueta: Etiqueta;
  vendidos_30d: number;
  ganancia_30d: number | null;
}

export interface LineaReceta {
  insumo_id: number;
  cantidad: number;
  merma_pct: number;
  nota: string | null;
}

export interface LineaRecetaConInsumo extends LineaReceta {
  insumos: { nombre: string; unidad_base: UnidadBase; coste_unitario: number; activo: boolean } | null;
}

function mensaje(error: PostgrestError): string {
  return translateTicketError(error);
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Mismo cálculo que _margen_etiqueta() en el servidor (para verlo en directo). */
export function calcularMargen(precioCentimos: number | null, coste: number | null, a: Ajustes) {
  if (precioCentimos === null || precioCentimos <= 0) {
    return { precioSinIva: null, margen: null, ganancia: null, etiqueta: (coste === null ? 'sin_coste' : 'sin_precio') as Etiqueta };
  }
  const precioSinIva = precioCentimos / 100 / (1 + a.iva_defecto_pct / 100);
  if (coste === null) return { precioSinIva, margen: null, ganancia: null, etiqueta: 'sin_coste' as Etiqueta };
  const margen = Math.round(((precioSinIva - coste) / precioSinIva) * 1000) / 10;
  const etiqueta: Etiqueta =
    margen < a.escala_bueno_pct ? 'bajo' : margen < a.escala_muy_bueno_pct ? 'bueno' : margen < a.escala_excelente_pct ? 'muy_bueno' : 'excelente';
  return { precioSinIva, margen, ganancia: precioSinIva - coste, etiqueta };
}

/** Coste de una receta: Σ cantidad × coste por unidad / (1 − merma). null si no tiene líneas. */
export function costeReceta(lineas: { cantidad: number; merma_pct: number; coste_unitario: number }[]): number | null {
  if (lineas.length === 0) return null;
  return lineas.reduce((s, l) => s + (l.cantidad * l.coste_unitario) / (1 - l.merma_pct / 100), 0);
}

const pct = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatPct = (v: number) => `${pct.format(v)} %`;
export const formatEur = (v: number) => eur.format(v);

// ---------------------------------------------------------------------
// Lecturas y escrituras
// ---------------------------------------------------------------------

export async function fetchRentabilidad(): Promise<{ productos: ProductoRentabilidad[]; error: string | null }> {
  const { data, error } = await supabase.rpc('rentabilidad_productos');
  if (error) return { productos: [], error: mensaje(error) };
  const productos = (data as ProductoRentabilidad[]).map((p) => ({
    ...p,
    coste: n(p.coste),
    precio_sin_iva: n(p.precio_sin_iva),
    margen_pct: n(p.margen_pct),
    ganancia: n(p.ganancia),
    ganancia_30d: n(p.ganancia_30d),
  }));
  return { productos, error: null };
}

export async function fetchAjustes(): Promise<{ ajustes: Ajustes; error: string | null }> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('iva_defecto_pct, escala_bueno_pct, escala_muy_bueno_pct, escala_excelente_pct')
    .maybeSingle();
  if (error) return { ajustes: AJUSTES_POR_DEFECTO, error: mensaje(error) };
  if (!data) return { ajustes: AJUSTES_POR_DEFECTO, error: null };
  return {
    ajustes: {
      iva_defecto_pct: Number(data.iva_defecto_pct),
      escala_bueno_pct: Number(data.escala_bueno_pct),
      escala_muy_bueno_pct: Number(data.escala_muy_bueno_pct),
      escala_excelente_pct: Number(data.escala_excelente_pct),
    },
    error: null,
  };
}

export async function updateAjustes(a: Ajustes): Promise<{ error: string | null }> {
  const { error } = await supabase.from('app_settings').update(a).eq('id', true);
  if (error?.code === '23514') return { error: 'Los cortes tienen que ir de menor a mayor (y por debajo de 100) y el IVA entre 0 y 30 %.' };
  return { error: error ? mensaje(error) : null };
}

export async function fetchReceta(productId: number): Promise<{ lineas: LineaRecetaConInsumo[]; error: string | null }> {
  const { data, error } = await supabase
    .from('recetas')
    .select('insumo_id, cantidad, merma_pct, nota, insumos(nombre, unidad_base, coste_unitario, activo)')
    .eq('product_id', productId);
  if (error) return { lineas: [], error: mensaje(error) };
  const lineas = (data as unknown as LineaRecetaConInsumo[]).map((l) => ({
    ...l,
    cantidad: Number(l.cantidad),
    merma_pct: Number(l.merma_pct),
    insumos: l.insumos ? { ...l.insumos, coste_unitario: Number(l.insumos.coste_unitario) } : null,
  }));
  lineas.sort((a, b) => (a.insumos?.nombre ?? '').localeCompare(b.insumos?.nombre ?? '', 'es'));
  return { lineas, error: null };
}

export async function guardarReceta(productId: number, lineas: LineaReceta[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_guardar_receta', { p_product_id: productId, p_lineas: lineas });
  return { error: error ? mensaje(error) : null };
}

export async function fetchEmparejamientos(): Promise<{ guardados: Map<string, number[]>; error: string | null }> {
  const { data, error } = await supabase.from('costes_emparejamientos').select('nombre_excel, product_ids');
  if (error) return { guardados: new Map(), error: mensaje(error) };
  return { guardados: new Map((data as { nombre_excel: string; product_ids: number[] }[]).map((r) => [r.nombre_excel, r.product_ids])), error: null };
}

// ---------------------------------------------------------------------
// Importación de recetas (hoja «Coste_Unitario»)
// ---------------------------------------------------------------------

export interface FilaReceta {
  fila: number;
  /** «Nombre en carta» del Excel (Cervezas, Copas_Ginebra…): solo para ayudar a revisar. */
  familia: string | null;
  producto: string;
  insumo: string;
  cantidad: number | null;
  medida: string;
}

export interface InformeRecetas {
  total_filas: number;
  productos: {
    product_id: number;
    nombre: string;
    producto_excel: string;
    estado: 'nueva' | 'cambia' | 'igual';
    precio_centimos: number | null;
    coste_antes: number | null;
    coste: number | null;
    margen_pct: number | null;
    ganancia: number | null;
    etiqueta: Etiqueta;
    lineas: { insumo_id: number; insumo: string; cantidad: number; unidad: UnidadBase }[];
  }[];
  sin_carta: string[];
  errores: { fila: number | null; producto: string | null; motivo: string }[];
  aplicada: boolean;
  recetas_cambiadas?: number;
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Lee la hoja «Coste_Unitario»: Producto, Materia Prima, Cantidad a usar y Medida (por sus títulos). */
export function leerCosteUnitario(libro: LibroExcel): { filas: FilaReceta[]; error: string | null } {
  const hoja = libro.hojas.find((h) => sinAcentos(h).replace(/[\s_]+/g, ' ') === 'coste unitario');
  if (!hoja) return { filas: [], error: `No encuentro la hoja «Coste_Unitario». Hojas del archivo: ${libro.hojas.join(', ')}.` };
  const filas = libro.filas(hoja);
  const titulo = filas.find((f) => Object.values(f.celdas).some((v) => sinAcentos(v) === 'materia prima'));
  if (!titulo) return { filas: [], error: 'En «Coste_Unitario» no encuentro la columna «Materia Prima».' };
  const col = (nombre: string) => Object.entries(titulo.celdas).find(([, v]) => sinAcentos(v) === nombre)?.[0] ?? null;
  const cProducto = col('producto');
  const cInsumo = col('materia prima');
  const cCantidad = col('cantidad a usar') ?? col('cantidad');
  const cMedida = col('medida');
  const cFamilia = col('nombre en carta');
  if (!cProducto || !cInsumo || !cCantidad || !cMedida) {
    return { filas: [], error: 'Faltan columnas en «Coste_Unitario»: Producto, Materia Prima, Cantidad a usar y Medida.' };
  }
  const out: FilaReceta[] = [];
  for (const f of filas) {
    if (f.numero <= titulo.numero) continue;
    const producto = (f.celdas[cProducto] ?? '').replace(/\s+/g, ' ').trim();
    const insumo = (f.celdas[cInsumo] ?? '').replace(/\s+/g, ' ').trim();
    if (!producto && !insumo) continue;
    out.push({
      fila: f.numero,
      familia: (cFamilia && f.celdas[cFamilia]?.trim()) || null,
      producto,
      insumo,
      cantidad: parseNumero(f.celdas[cCantidad]),
      medida: (f.celdas[cMedida] ?? '').trim(),
    });
  }
  if (out.length === 0) return { filas: [], error: 'La hoja «Coste_Unitario» no tiene recetas.' };
  return { filas: out, error: null };
}

/** Copas: el destilado (en ml) que el Excel tiene a 60 ml pasa a la dosis acordada de 75 ml. */
export const esCopaA60 = (f: FilaReceta) =>
  !!f.familia && sinAcentos(f.familia).startsWith('copas') && sinAcentos(f.medida) === 'ml' && f.cantidad === 60;

export async function importarRecetas(
  archivo: string,
  filas: FilaReceta[],
  emparejamientos: { producto: string; product_ids: number[] }[],
  confirmar: boolean
): Promise<{ informe: InformeRecetas | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_importar_recetas', {
    p_archivo: archivo,
    p_filas: filas.map(({ fila, producto, insumo, cantidad, medida }) => ({ fila, producto, insumo, cantidad, medida })),
    p_emparejamientos: emparejamientos,
    p_confirmar: confirmar,
  });
  if (error) return { informe: null, error: mensaje(error) };
  return { informe: data as InformeRecetas, error: null };
}

// ---------------------------------------------------------------------
// R3: promos y resumen de lo vendido (migración 20261119100000_costes_resumen.sql)
// ---------------------------------------------------------------------

export interface PromoRentabilidad {
  promo_id: string;
  nombre: string;
  tipo: 'pack' | 'obsequio' | 'sorteo';
  publicada: boolean;
  activa: boolean;
  precio_centimos: number | null;
  descuento_anunciado_pct: number | null;
  productos: number;
  sin_receta: string[];
  precio_normal_centimos: number | null;
  descuento_real_pct: number | null;
  aviso_descuento: boolean;
  coste: number | null;
  margen_pct: number | null;
  ganancia: number | null;
  etiqueta: Etiqueta;
  vendidas_30d: number;
  ganancia_30d: number | null;
}

export async function fetchRentabilidadPromos(): Promise<{ promos: PromoRentabilidad[]; error: string | null }> {
  const { data, error } = await supabase.rpc('rentabilidad_promos');
  if (error) return { promos: [], error: mensaje(error) };
  const promos = (data as PromoRentabilidad[]).map((p) => ({
    ...p,
    descuento_real_pct: n(p.descuento_real_pct),
    coste: n(p.coste),
    margen_pct: n(p.margen_pct),
    ganancia: n(p.ganancia),
    ganancia_30d: n(p.ganancia_30d),
    sin_receta: p.sin_receta ?? [],
  }));
  return { promos, error: null };
}

/**
 * Mismo cálculo que rentabilidad_promos() para el editor de Promos (en directo): precio normal,
 * descuento real, coste, margen y aviso si el descuento anunciado no cuadra (más de 2 puntos).
 */
export function calcularPromo(
  precioCentimos: number | null,
  descuentoAnunciado: number | null,
  items: { cantidad: number; precio_centimos: number | null; coste: number | null; nombre: string }[],
  a: Ajustes
) {
  const precioNormal = items.length === 0 || items.some((i) => i.precio_centimos === null)
    ? null
    : items.reduce((s, i) => s + i.precio_centimos! * i.cantidad, 0);
  const sinReceta = items.filter((i) => i.coste === null).map((i) => i.nombre);
  const coste = items.length === 0 || sinReceta.length > 0 ? null : items.reduce((s, i) => s + i.coste! * i.cantidad, 0);
  const descuentoReal =
    precioNormal && precioNormal > 0 && precioCentimos !== null ? Math.round((1 - precioCentimos / precioNormal) * 1000) / 10 : null;
  const aviso = descuentoAnunciado !== null && descuentoReal !== null && Math.abs(descuentoAnunciado - descuentoReal) > 2;
  return { precioNormal, descuentoReal, aviso, coste, sinReceta, ...calcularMargen(precioCentimos, coste, a) };
}

export interface ResumenRentabilidad {
  desde: string;
  hasta: string;
  iva_pct: number;
  totales: {
    ventas_sin_iva: number;
    ventas_con_coste: number;
    coste: number;
    ganancia: number;
    unidades: number;
    margen_pct: number | null;
    etiqueta: Etiqueta;
    ventas_sin_coste: number;
    pct_sin_coste: number | null;
    devuelto: number;
  };
  por_categoria: {
    id: string;
    nombre: string;
    unidades: number;
    ventas_sin_iva: number;
    pct_venta: number | null;
    ganancia: number | null;
    margen_pct: number | null;
    etiqueta: Etiqueta;
    ventas_sin_coste: number;
  }[];
  productos: {
    clase: 'producto' | 'promo';
    id: string;
    nombre: string;
    categoria: string;
    unidades: number;
    ventas_sin_iva: number;
    ganancia: number | null;
    margen_pct: number | null;
    etiqueta: Etiqueta;
  }[];
  ingredientes: {
    insumo_id: number;
    nombre: string;
    unidad: UnidadBase;
    fecha: string;
    antes: number;
    despues: number;
    variacion_pct: number | null;
    productos: number;
  }[];
  precios_carta: { product_id: number; nombre: string; fecha: string; antes: number | null; despues: number | null }[];
}

export async function fetchResumen(desde: string, hasta: string): Promise<{ resumen: ResumenRentabilidad | null; error: string | null }> {
  const { data, error } = await supabase.rpc('rentabilidad_resumen', { p_desde: desde, p_hasta: hasta });
  if (error) return { resumen: null, error: mensaje(error) };
  return { resumen: data as ResumenRentabilidad, error: null };
}
