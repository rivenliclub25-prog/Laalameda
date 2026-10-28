import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import type { PromotionRow } from '@/lib/adminTickets';

/**
 * Panel: lecturas y escrituras de la carta (categorías, separadores, productos), las franjas de
 * promos y los datos de cada promo que se ven en la web. Permisos: solo admins (RLS de catalogo.sql).
 */

export interface CategoryRow {
  id: string;
  nombre: string;
  orden: number;
  visible: boolean;
}

export interface SectionRow {
  id: string;
  categoria_id: string;
  nombre: string;
  subtitulo: string | null;
  orden: number;
  visible: boolean;
}

export interface ProductRow {
  id: number; // código del producto
  categoria_id: string;
  seccion_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio_centimos: number | null;
  recomendado: boolean;
  activo: boolean;
  disponible: boolean;
  orden: number;
}

export interface SegmentRow {
  id: string;
  nombre: string;
  publico: string | null;
  orden: number;
  visible: boolean;
}

export interface PromoItem {
  product_id: number;
  cantidad: number;
}

function dbError(error: PostgrestError): string {
  console.error('[club] Error del panel (carta):', error);
  if (error.code === '42501') return 'Tu cuenta no tiene permisos para hacer este cambio.';
  if (error.code === '23505') return 'Ya existe un elemento con ese identificador. Prueba con otro nombre.';
  if (error.code === '23514') return 'Revisa los datos: hay algún valor no válido (precio, porcentaje, personas…).';
  if (error.code === '23503') return 'Ese elemento está relacionado con otro que no existe o no se puede quitar.';
  return translateTicketError(error);
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

/** Identificador a partir del nombre ("Cervezas de importación" → "cervezas-de-importacion"), sin repetir. */
export function makeId(nombre: string, existing: Iterable<string>, prefix = ''): string {
  const base =
    prefix +
      nombre
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'elemento';
  const taken = new Set(existing);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** 250 → "2,50" (para los campos de precio del panel). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
}

/**
 * Mueve un elemento una posición arriba o abajo dentro de su grupo y devuelve los cambios de
 * "orden" necesarios (se renumera el grupo de 10 en 10 para que no haya empates).
 */
export function reorder<T extends { orden: number }>(
  group: T[],
  index: number,
  direction: -1 | 1,
  key: (item: T) => string | number
): { key: string | number; orden: number }[] {
  const target = index + direction;
  if (target < 0 || target >= group.length) return [];
  const list = [...group];
  [list[index], list[target]] = [list[target], list[index]];
  return list
    .map((item, i) => ({ key: key(item), orden: (i + 1) * 10, old: item.orden }))
    .filter((x) => x.orden !== x.old)
    .map(({ key: k, orden }) => ({ key: k, orden }));
}

// ---------------------------------------------------------------------
// Carta
// ---------------------------------------------------------------------

export async function fetchCarta(): Promise<{
  categories: CategoryRow[];
  sections: SectionRow[];
  products: ProductRow[];
  error: string | null;
}> {
  const [c, s, p] = await Promise.all([
    supabase.from('menu_categories').select('id, nombre, orden, visible').order('orden').order('id'),
    supabase.from('menu_sections').select('id, categoria_id, nombre, subtitulo, orden, visible').order('orden').order('id'),
    supabase
      .from('products')
      .select('id, categoria_id, seccion_id, nombre, descripcion, precio_centimos, recomendado, activo, disponible, orden')
      .order('orden')
      .order('id'),
  ]);
  const error = c.error ?? s.error ?? p.error;
  if (error) return { categories: [], sections: [], products: [], error: dbError(error) };
  return {
    categories: c.data as CategoryRow[],
    sections: s.data as SectionRow[],
    products: p.data as ProductRow[],
    error: null,
  };
}

type Table = 'menu_categories' | 'menu_sections' | 'products' | 'promo_segments' | 'promotions';

async function insertRow<T>(table: Table, row: Record<string, unknown>, columns: string) {
  const { data, error } = await supabase.from(table).insert(row).select(columns).single();
  if (error) return { row: null, error: dbError(error) };
  return { row: data as T, error: null };
}

async function updateRow<T>(table: Table, id: string | number, changes: Record<string, unknown>, columns: string) {
  const { data, error } = await supabase.from(table).update(changes).eq('id', id).select(columns).single();
  if (error) return { row: null, error: dbError(error) };
  return { row: data as T, error: null };
}

/** Guarda varios cambios de orden (subir o bajar). */
export async function saveOrder(table: Table, changes: { key: string | number; orden: number }[]): Promise<string | null> {
  for (const change of changes) {
    const { error } = await supabase.from(table).update({ orden: change.orden }).eq('id', change.key);
    if (error) return dbError(error);
  }
  return null;
}

const CATEGORY_COLS = 'id, nombre, orden, visible';
const SECTION_COLS = 'id, categoria_id, nombre, subtitulo, orden, visible';
const PRODUCT_COLS = 'id, categoria_id, seccion_id, nombre, descripcion, precio_centimos, recomendado, activo, disponible, orden';
const SEGMENT_COLS = 'id, nombre, publico, orden, visible';

export const createCategory = (row: CategoryRow) => insertRow<CategoryRow>('menu_categories', { ...row }, CATEGORY_COLS);
export const updateCategory = (id: string, changes: Partial<CategoryRow>) =>
  updateRow<CategoryRow>('menu_categories', id, changes, CATEGORY_COLS);

export const createSection = (row: SectionRow) => insertRow<SectionRow>('menu_sections', { ...row }, SECTION_COLS);
export const updateSection = (id: string, changes: Partial<SectionRow>) =>
  updateRow<SectionRow>('menu_sections', id, changes, SECTION_COLS);

/** El código (id) lo pone la base de datos: el siguiente número libre. */
export const createProduct = (row: Omit<ProductRow, 'id'>) => insertRow<ProductRow>('products', { ...row }, PRODUCT_COLS);
export const updateProduct = (id: number, changes: Partial<ProductRow>) =>
  updateRow<ProductRow>('products', id, changes, PRODUCT_COLS);

// ---------------------------------------------------------------------
// Franjas de promos
// ---------------------------------------------------------------------

export async function fetchSegments(): Promise<{ segments: SegmentRow[]; error: string | null }> {
  const { data, error } = await supabase.from('promo_segments').select(SEGMENT_COLS).order('orden').order('id');
  if (error) return { segments: [], error: dbError(error) };
  return { segments: data as SegmentRow[], error: null };
}

export const createSegment = (row: SegmentRow) => insertRow<SegmentRow>('promo_segments', { ...row }, SEGMENT_COLS);
export const updateSegment = (id: string, changes: Partial<SegmentRow>) =>
  updateRow<SegmentRow>('promo_segments', id, changes, SEGMENT_COLS);

// ---------------------------------------------------------------------
// Promos: datos de la web, franjas y productos que lleva
// ---------------------------------------------------------------------

export async function fetchPromoLinks(
  promoId: string
): Promise<{ segmentIds: string[]; items: PromoItem[]; error: string | null }> {
  const [s, i] = await Promise.all([
    supabase.from('promotion_segments').select('segment_id').eq('promo_id', promoId),
    supabase.from('promotion_items').select('product_id, cantidad').eq('promo_id', promoId),
  ]);
  const error = s.error ?? i.error;
  if (error) return { segmentIds: [], items: [], error: dbError(error) };
  return {
    segmentIds: (s.data as { segment_id: string }[]).map((r) => r.segment_id),
    items: (i.data as PromoItem[]).map((r) => ({ product_id: Number(r.product_id), cantidad: r.cantidad })),
    error: null,
  };
}

/** Sustituye las franjas y los productos de una promo por los indicados. */
export async function savePromoLinks(promoId: string, segmentIds: string[], items: PromoItem[]): Promise<string | null> {
  const delSeg = await supabase.from('promotion_segments').delete().eq('promo_id', promoId);
  if (delSeg.error) return dbError(delSeg.error);
  if (segmentIds.length > 0) {
    const ins = await supabase
      .from('promotion_segments')
      .insert(segmentIds.map((segment_id) => ({ promo_id: promoId, segment_id })));
    if (ins.error) return dbError(ins.error);
  }
  const delItems = await supabase.from('promotion_items').delete().eq('promo_id', promoId);
  if (delItems.error) return dbError(delItems.error);
  if (items.length > 0) {
    const ins = await supabase
      .from('promotion_items')
      .insert(items.map((it) => ({ promo_id: promoId, product_id: it.product_id, cantidad: it.cantidad })));
    if (ins.error) return dbError(ins.error);
  }
  return null;
}

/** Promo nueva: nace sin publicar y apagada, con 1 uso por jornada y "todo el día". */
export async function createPromo(
  id: string,
  nombre: string
): Promise<{ row: PromotionRow | null; error: string | null }> {
  return insertRow<PromotionRow>(
    'promotions',
    {
      id,
      nombre,
      descuento_texto: '',
      solo_club: true,
      activa: false,
      publicada: false,
      tipo: 'pack',
      max_usos: 1,
      ventana_usos: 'dia',
      orden: 1000,
    },
    '*'
  );
}

export async function updatePromoFull(
  id: string,
  changes: Partial<PromotionRow>
): Promise<{ row: PromotionRow | null; error: string | null }> {
  return updateRow<PromotionRow>('promotions', id, changes as Record<string, unknown>, '*');
}
