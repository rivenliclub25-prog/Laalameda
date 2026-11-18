import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import type { LibroExcel } from '@/lib/xlsx';

/**
 * Rentabilidad R1: ingredientes (insumos), su histórico de precios y la importación del Excel
 * (RENTABILIDAD.md; migración 20261118120000_costes_insumos.sql). Solo para admins (RLS).
 * Precios de compra SIN IVA. El coste por unidad lo calcula la base de datos.
 */

export type UnidadBase = 'ml' | 'g' | 'ud';

export interface Insumo {
  id: number;
  nombre: string;
  categoria: string | null;
  proveedor: string | null;
  formato: string | null;
  cantidad_formato: number;
  unidad_base: UnidadBase;
  rendimiento_pct: number;
  precio_compra_sin_iva: number;
  coste_unitario: number;
  activo: boolean;
  updated_at: string;
}

export interface InsumoPrecio {
  id: number;
  insumo_id: number;
  precio_compra_sin_iva: number;
  cantidad_formato: number;
  rendimiento_pct: number;
  coste_unitario: number;
  vigente_desde: string;
  origen: 'importacion' | 'manual';
}

export type InsumoCambios = Partial<
  Pick<Insumo, 'nombre' | 'categoria' | 'proveedor' | 'formato' | 'cantidad_formato' | 'unidad_base' | 'rendimiento_pct' | 'precio_compra_sin_iva' | 'activo'>
>;

const INSUMO_COLS =
  'id, nombre, categoria, proveedor, formato, cantidad_formato, unidad_base, rendimiento_pct, precio_compra_sin_iva, coste_unitario, activo, updated_at';

/** PostgREST devuelve los numeric como número; por si llegan como texto. */
function normalizar<T extends object>(row: T, campos: (keyof T)[]): T {
  const out = { ...row };
  for (const c of campos) if (out[c] !== null && out[c] !== undefined) (out[c] as unknown) = Number(out[c]);
  return out;
}
const numInsumo: (keyof Insumo)[] = ['cantidad_formato', 'rendimiento_pct', 'precio_compra_sin_iva', 'coste_unitario'];
const numPrecio: (keyof InsumoPrecio)[] = ['precio_compra_sin_iva', 'cantidad_formato', 'rendimiento_pct', 'coste_unitario'];

function mensaje(error: PostgrestError): string {
  if (error.code === '23505') return 'Ya hay un ingrediente con ese nombre.';
  if (error.code === '23514') return 'Hay un dato no válido. Revisa cantidad, rendimiento y precio.';
  return translateTicketError(error);
}

export async function fetchInsumos(): Promise<{ insumos: Insumo[]; error: string | null }> {
  const { data, error } = await supabase.from('insumos').select(INSUMO_COLS).order('nombre');
  if (error) return { insumos: [], error: mensaje(error) };
  return { insumos: (data as Insumo[]).map((r) => normalizar(r, numInsumo)), error: null };
}

/** Histórico de todos los ingredientes (para ver la última variación) o de uno. Lo más reciente primero. */
export async function fetchHistorial(insumoId?: number): Promise<{ precios: InsumoPrecio[]; error: string | null }> {
  let query = supabase
    .from('insumo_precios')
    .select('id, insumo_id, precio_compra_sin_iva, cantidad_formato, rendimiento_pct, coste_unitario, vigente_desde, origen')
    .order('vigente_desde', { ascending: false })
    .order('id', { ascending: false })
    .limit(5000);
  if (insumoId !== undefined) query = query.eq('insumo_id', insumoId);
  const { data, error } = await query;
  if (error) return { precios: [], error: mensaje(error) };
  return { precios: (data as InsumoPrecio[]).map((r) => normalizar(r, numPrecio)), error: null };
}

export async function createInsumo(datos: InsumoCambios): Promise<{ insumo: Insumo | null; error: string | null }> {
  const { data, error } = await supabase.from('insumos').insert(datos).select(INSUMO_COLS).single();
  if (error) return { insumo: null, error: mensaje(error) };
  return { insumo: normalizar(data as Insumo, numInsumo), error: null };
}

export async function updateInsumo(id: number, cambios: InsumoCambios): Promise<{ insumo: Insumo | null; error: string | null }> {
  const { data, error } = await supabase.from('insumos').update(cambios).eq('id', id).select(INSUMO_COLS).single();
  if (error) return { insumo: null, error: mensaje(error) };
  return { insumo: normalizar(data as Insumo, numInsumo), error: null };
}

// ---------------------------------------------------------------------
// Unidades y números
// ---------------------------------------------------------------------

/** Unidades que se aceptan al escribir o importar, con su unidad base y el factor. */
export const UNIDADES: Record<string, { base: UnidadBase; factor: number; etiqueta: string }> = {
  ml: { base: 'ml', factor: 1, etiqueta: 'ml' },
  cl: { base: 'ml', factor: 10, etiqueta: 'cl' },
  l: { base: 'ml', factor: 1000, etiqueta: 'l' },
  g: { base: 'g', factor: 1, etiqueta: 'g' },
  gr: { base: 'g', factor: 1, etiqueta: 'g' },
  kg: { base: 'g', factor: 1000, etiqueta: 'kg' },
  ud: { base: 'ud', factor: 1, etiqueta: 'ud' },
  und: { base: 'ud', factor: 1, etiqueta: 'ud' },
  unidad: { base: 'ud', factor: 1, etiqueta: 'ud' },
  unidades: { base: 'ud', factor: 1, etiqueta: 'ud' },
};

/** Las que se ofrecen en el formulario. */
export const UNIDADES_FORMULARIO = ['ml', 'cl', 'l', 'g', 'kg', 'ud'] as const;

export function unidad(texto: string | null | undefined) {
  return UNIDADES[(texto ?? '').trim().toLowerCase().replace(/\.$/, '')] ?? null;
}

/** «0,5», «1.000,25», «18.5» → número (null si no lo es). */
export function parseNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  let t = (texto ?? '').trim().replace(/\s|€/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const eur = (min: number, max: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: min, maximumFractionDigits: max });
const num = (max: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: max });

/** Precio de compra: «79,20 €», «0,8 €» → «0,80 €», con hasta 4 decimales si los tiene. */
export const formatPrecioCompra = (n: number) => eur(2, 4).format(n);

/** Coste por unidad de consumo: «0,00264 €/ml», «0,0185 €/g», «0,75 €/ud». */
export function formatCosteUnitario(coste: number, unidadBase: UnidadBase): string {
  const decimales = coste >= 1 ? 2 : coste >= 0.1 ? 3 : coste >= 0.01 ? 4 : 6;
  return `${eur(2, decimales).format(coste)}/${unidadBase}`;
}

/** «30.000 ml», «24 ud». */
export const formatCantidad = (n: number, u: UnidadBase) => `${num(3).format(n)} ${u}`;

// ---------------------------------------------------------------------
// Importación del Excel (hoja «Materias Primas»)
// ---------------------------------------------------------------------

export interface FilaImportacion {
  fila: number;
  nombre: string;
  categoria: string | null;
  formato: string | null;
  cantidad_formato: number | null;
  unidad_base: string;
  precio_compra_sin_iva: number | null;
}

export interface InformeImportacion {
  total: number;
  nuevos: { fila: number; nombre: string; categoria: string | null; cantidad_formato: number; unidad_base: UnidadBase; precio_compra_sin_iva: number; coste_unitario: number }[];
  cambios: { fila: number; id: number; nombre: string; unidad_base: UnidadBase; precio_antes: number; precio_despues: number; coste_antes: number; coste_despues: number }[];
  iguales: number;
  errores: { fila: number; nombre: string | null; motivo: string }[];
  aplicada: boolean;
  importacion_id?: string;
}

const HOJA = 'materias primas';
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Lee la hoja «Materias Primas»: busca la fila de títulos («Materia Prima», «Tamaño», «U/medida»,
 * «Precio Compra», «Cat») y convierte cada ingrediente a la unidad base (Kg → g, L y cl → ml, Und → ud).
 * Las filas raras se envían igual: el servidor dice qué falla en cada una.
 */
export function leerMateriasPrimas(libro: LibroExcel): { filas: FilaImportacion[]; error: string | null } {
  const hoja = libro.hojas.find((h) => sinAcentos(h) === HOJA);
  if (!hoja) return { filas: [], error: `No encuentro la hoja «Materias Primas». Hojas del archivo: ${libro.hojas.join(', ')}.` };
  const filas = libro.filas(hoja);

  const titulo = filas.find((f) => Object.values(f.celdas).some((v) => sinAcentos(v) === 'materia prima'));
  if (!titulo) return { filas: [], error: 'En «Materias Primas» no encuentro la columna «Materia Prima».' };
  const col = (empieza: string) =>
    Object.entries(titulo.celdas).find(([, v]) => sinAcentos(v).startsWith(empieza))?.[0] ?? null;
  const cNombre = col('materia prima');
  const cTamano = col('tamano');
  const cUnidad = col('u/medida') ?? col('unidad');
  const cPrecio = col('precio compra') ?? col('precio');
  const cCat = col('cat');
  if (!cNombre || !cTamano || !cUnidad || !cPrecio) {
    return { filas: [], error: 'Faltan columnas en «Materias Primas»: Materia Prima, Tamaño, U/medida y Precio Compra.' };
  }

  const out: FilaImportacion[] = [];
  for (const f of filas) {
    if (f.numero <= titulo.numero) continue;
    const nombre = (f.celdas[cNombre] ?? '').replace(/\s+/g, ' ').trim();
    if (!nombre) continue;
    const tamano = parseNumero(f.celdas[cTamano]);
    const textoUnidad = (f.celdas[cUnidad] ?? '').trim();
    const u = unidad(textoUnidad);
    out.push({
      fila: f.numero,
      nombre,
      categoria: (cCat && f.celdas[cCat]?.trim()) || null,
      formato: tamano !== null && textoUnidad ? `${num(3).format(tamano)} ${textoUnidad}` : null,
      cantidad_formato: tamano === null ? null : u ? Math.round(tamano * u.factor * 1000) / 1000 : tamano,
      unidad_base: u ? u.base : textoUnidad.toLowerCase(),
      precio_compra_sin_iva: parseNumero(f.celdas[cPrecio]),
    });
  }
  if (out.length === 0) return { filas: [], error: 'La hoja «Materias Primas» no tiene ingredientes.' };
  return { filas: out, error: null };
}

export async function importarInsumos(
  archivo: string,
  filas: FilaImportacion[],
  confirmar: boolean
): Promise<{ informe: InformeImportacion | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_importar_insumos', { p_archivo: archivo, p_filas: filas, p_confirmar: confirmar });
  if (error) return { informe: null, error: mensaje(error) };
  return { informe: data as InformeImportacion, error: null };
}
