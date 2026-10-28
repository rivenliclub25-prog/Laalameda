import { useEffect, useSyncExternalStore } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { publicBaseUrl, siteConfig } from '@/data/site';

/**
 * Carta y promos desde Supabase (función catalogo(), ver supabase/catalogo.sql).
 *
 * Copia de respaldo (POS.md, D11): si Supabase no responde se usa la copia más reciente entre la
 * guardada en el navegador y public/catalogo.json (la genera la publicación), con un aviso.
 * Si el navegador ya tiene una copia, se pinta al instante y se sustituye en cuanto responde Supabase.
 */

// ---------------------------------------------------------------------
// Forma de catalogo() (JSON de la base de datos)
// ---------------------------------------------------------------------

interface RawCategoria {
  id: string;
  nombre: string;
  orden: number;
}
interface RawSeccion {
  id: string;
  categoria_id: string;
  nombre: string;
  subtitulo: string | null;
  orden: number;
}
interface RawProducto {
  /** Código numérico del producto (catalogo-codigos.sql). Las copias antiguas pueden traer texto. */
  id: number | string;
  categoria_id: string;
  seccion_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio_centimos: number | null;
  recomendado: boolean;
  disponible: boolean;
  orden: number;
}
interface RawFranja {
  id: string;
  nombre: string;
  publico: string | null;
  orden: number;
}
interface RawPromo {
  id: string;
  nombre: string;
  tipo: 'pack' | 'obsequio' | 'sorteo';
  solo_club: boolean;
  precio_centimos: number | null;
  descuento_pct: number | null;
  descripcion: string | null;
  contenidos: string[];
  personas: number | null;
  texto_horario: string | null;
  mensaje_reserva: string | null;
  visible_hasta: string | null;
  exclusiva: boolean;
  orden: number;
  inicio: string | null;
  fin: string | null;
  dias_semana: number[] | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  franjas: string[];
  items: { product_id: number | string; cantidad: number }[];
}
export interface RawCatalog {
  version: number;
  generado_at: string;
  categorias: RawCategoria[];
  secciones: RawSeccion[];
  productos: RawProducto[];
  franjas: RawFranja[];
  promos: RawPromo[];
}

// ---------------------------------------------------------------------
// Forma que usan los componentes (mismos nombres que tenían en src/data)
// ---------------------------------------------------------------------

export interface MenuItem {
  /** Código del producto, como texto. */
  id?: string;
  name?: string;
  desc?: string;
  price?: string; // "3,50€"
  recommended?: boolean;
  available?: boolean;
  sectionHeader?: string;
  sectionSub?: string;
}

export interface MenuTab {
  id: string;
  label: string;
  items: MenuItem[];
}

export interface PromoSegment {
  id: string;
  label: string;
  audience: string;
}

export interface Promotion {
  id: string;
  title: string;
  type: RawPromo['tipo'];
  segmentIds: string[];
  description?: string;
  contents: string[];
  priceCents?: number;
  discount?: number;
  people?: number;
  scheduleLabel: string;
  reserveMessage?: string;
  /** Productos de la carta que lleva (etiqueta "En promo"). */
  productIds: string[];
  exclusive: boolean;
  visibleUntil: string | null;
  /** Mismo horario que usa la base de datos para los tickets (promo_activa). */
  schedule: {
    dias: number[] | null; // ISO: 1 = lunes … 7 = domingo
    horaInicio: string | null; // "16:00:00"
    horaFin: string | null;
    inicio: string | null;
    fin: string | null;
  };
}

export interface Catalog {
  generatedAt: string;
  menuTabs: MenuTab[];
  segments: PromoSegment[];
  promotions: Promotion[];
}

/** "3€" o "3,50€", como en la carta de siempre. */
export function formatMenuPrice(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? `${euros}€` : `${euros},${String(rest).padStart(2, '0')}€`;
}

function isRawCatalog(value: unknown): value is RawCatalog {
  const v = value as RawCatalog | null;
  return Boolean(
    v &&
      typeof v.generado_at === 'string' &&
      Array.isArray(v.categorias) &&
      Array.isArray(v.secciones) &&
      Array.isArray(v.productos) &&
      Array.isArray(v.franjas) &&
      Array.isArray(v.promos)
  );
}

export function toCatalog(raw: RawCatalog): Catalog {
  const byOrder = <T extends { orden: number; id: string | number }>(a: T, b: T) =>
    a.orden - b.orden || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

  const menuTabs: MenuTab[] = [...raw.categorias].sort(byOrder).map((cat) => {
    const toItem = (p: RawProducto): MenuItem => ({
      id: String(p.id),
      name: p.nombre,
      desc: p.descripcion ?? undefined,
      price: p.precio_centimos === null ? undefined : formatMenuPrice(p.precio_centimos),
      recommended: p.recomendado || undefined,
      available: p.disponible,
    });
    const products = raw.productos.filter((p) => p.categoria_id === cat.id).sort(byOrder);
    const sections = raw.secciones.filter((s) => s.categoria_id === cat.id).sort(byOrder);
    const sectionIds = new Set(sections.map((s) => s.id));
    // Primero los productos sin separador; después cada separador con los suyos.
    const items: MenuItem[] = products.filter((p) => !p.seccion_id || !sectionIds.has(p.seccion_id)).map(toItem);
    for (const section of sections) {
      const inSection = products.filter((p) => p.seccion_id === section.id);
      if (inSection.length === 0) continue;
      items.push({ sectionHeader: section.nombre, sectionSub: section.subtitulo ?? undefined });
      items.push(...inSection.map(toItem));
    }
    return { id: cat.id, label: cat.nombre, items };
  });

  const segments: PromoSegment[] = [...raw.franjas]
    .sort(byOrder)
    .map((f) => ({ id: f.id, label: f.nombre, audience: f.publico ?? '' }));
  const segmentOrder = new Map(segments.map((s, i) => [s.id, i]));

  const promotions: Promotion[] = [...raw.promos].sort(byOrder).map((p) => ({
    id: p.id,
    title: p.nombre,
    type: p.tipo,
    segmentIds: p.franjas
      .filter((id) => segmentOrder.has(id))
      .sort((a, b) => (segmentOrder.get(a) ?? 0) - (segmentOrder.get(b) ?? 0)),
    description: p.descripcion ?? undefined,
    contents: p.contenidos ?? [],
    priceCents: p.precio_centimos ?? undefined,
    discount: p.descuento_pct ?? undefined,
    people: p.personas ?? undefined,
    scheduleLabel: p.texto_horario ?? '',
    reserveMessage: p.mensaje_reserva ?? undefined,
    productIds: p.items.map((i) => String(i.product_id)),
    exclusive: p.exclusiva,
    visibleUntil: p.visible_hasta,
    schedule: {
      dias: p.dias_semana,
      horaInicio: p.hora_inicio,
      horaFin: p.hora_fin,
      inicio: p.inicio,
      fin: p.fin,
    },
  }));

  return { generatedAt: raw.generado_at, menuTabs, segments, promotions };
}

// ---------------------------------------------------------------------
// Horarios (siempre en hora de Madrid, como la base de datos)
// ---------------------------------------------------------------------

const madridFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Día ISO (1 = lunes) y minutos desde medianoche, en Madrid. */
function madridNow(date: Date): { dia: number; minutos: number } {
  const parts = Object.fromEntries(madridFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return { dia: WEEKDAYS[parts.weekday], minutos: Number(parts.hour) * 60 + Number(parts.minute) };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isWithinDates(promotion: Promotion, now: Date): boolean {
  return !promotion.visibleUntil || now.getTime() < new Date(promotion.visibleUntil).getTime();
}

/** Si hay alguna promo exclusiva visible (p. ej. El Clásico), solo se muestran las exclusivas. */
export function isPromotionVisible(promotion: Promotion, now: Date, all: Promotion[]): boolean {
  if (!isWithinDates(promotion, now)) return false;
  return promotion.exclusive || !all.some((p) => p.exclusive && isWithinDates(p, now));
}

/**
 * "Promos de hoy": visible y dentro de su horario (días, franja que puede cruzar la medianoche y
 * periodo). Es la misma regla que promo_activa() en la base de datos, salvo el interruptor "activa".
 */
export function isPromotionActive(promotion: Promotion, now: Date, all: Promotion[]): boolean {
  if (!isPromotionVisible(promotion, now, all)) return false;
  const { dias, horaInicio, horaFin, inicio, fin } = promotion.schedule;
  if (inicio && now.getTime() < new Date(inicio).getTime()) return false;
  if (fin && now.getTime() >= new Date(fin).getTime()) return false;

  const { dia, minutos } = madridNow(now);
  const previo = dia === 1 ? 7 : dia - 1;
  const enDia = (d: number) => !dias || dias.length === 0 || dias.includes(d);

  if (!horaInicio || !horaFin) return enDia(dia);
  const hi = timeToMinutes(horaInicio);
  const hf = timeToMinutes(horaFin);
  if (hi < hf) return enDia(dia) && minutos >= hi && minutos < hf;
  return (enDia(dia) && minutos >= hi) || (enDia(previo) && minutos < hf);
}

// ---------------------------------------------------------------------
// Formatos y enlaces de promos (trasladados de src/data/promos.ts)
// ---------------------------------------------------------------------

export function formatPromoPrice(priceCents: number): string {
  return `${(priceCents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function formatPromotionDiscount(discount: number): string {
  return discount === 0 ? '0 %' : `-${Math.abs(discount)} %`;
}

export function formatPromotionPrice(promotion: Promotion): string | null {
  if (promotion.priceCents === undefined) return null;
  if (promotion.priceCents === 0) return 'Gratis';
  if (!promotion.people) return formatPromoPrice(promotion.priceCents);
  const perPerson = Math.round(promotion.priceCents / promotion.people);
  return `${formatPromoPrice(perPerson)} por persona · ${formatPromoPrice(promotion.priceCents)} total`;
}

/** Sin sesión: lleva a iniciar sesión y, al entrar, vuelve a esta promo. */
export function clubLoginHref(promotion: Promotion): string {
  return `#/club?modo=login&promo=${encodeURIComponent(promotion.id)}`;
}

export function reservationHref(promotion: Promotion): string | null {
  if (!promotion.reserveMessage) return null;
  return `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(promotion.reserveMessage)}`;
}

export function findPromotion(catalog: Catalog | null, id: string | null): Promotion | null {
  return (id && catalog?.promotions.find((p) => p.id === id)) || null;
}

// ---------------------------------------------------------------------
// Carga compartida (una sola petición para toda la página) y copias
// ---------------------------------------------------------------------

export interface CatalogState {
  catalog: Catalog | null;
  /** true si se está mostrando una copia porque Supabase no ha respondido. */
  fromBackup: boolean;
}

const STORAGE_KEY = 'alameda-catalogo-v1';
const RETRY_MS = 60_000;

function readBrowserCopy(): RawCatalog | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    return isRawCatalog(value) ? value : null;
  } catch {
    return null;
  }
}

function saveBrowserCopy(raw: RawCatalog) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch {
    // Sin almacenamiento (modo privado o lleno): no pasa nada.
  }
}

async function fetchBuildCopy(): Promise<RawCatalog | null> {
  try {
    const response = await fetch(`${publicBaseUrl}catalogo.json`, { cache: 'no-cache' });
    if (!response.ok) return null;
    const value = await response.json();
    return isRawCatalog(value) ? value : null;
  } catch {
    return null;
  }
}

// Si el navegador ya tiene una copia, se pinta al instante (sin aviso) mientras responde Supabase.
const initialCopy = typeof window !== 'undefined' ? readBrowserCopy() : null;
let state: CatalogState = { catalog: initialCopy ? toCatalog(initialCopy) : null, fromBackup: false };
let loadedFromSupabase = false;
let started = false;
let retryTimer: number | undefined;
const listeners = new Set<() => void>();

function setState(next: CatalogState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function load() {
  window.clearTimeout(retryTimer);
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('catalogo');
    if (!error && isRawCatalog(data)) {
      loadedFromSupabase = true;
      saveBrowserCopy(data);
      setState({ catalog: toCatalog(data), fromBackup: false });
      return;
    }
    console.warn('[club] No se pudo cargar la carta desde Supabase; se usa la copia.', error ?? data);
  }
  if (loadedFromSupabase) return; // ya hay datos buenos de esta visita: se mantienen

  // La copia más reciente entre la del navegador y la de la publicación.
  const [browser, build] = [readBrowserCopy(), await fetchBuildCopy()];
  const newest = [browser, build]
    .filter((c): c is RawCatalog => c !== null)
    // Como fechas, no como texto: una copia puede venir en UTC ("+00:00") y otra con otro desfase.
    .sort((a, b) => Date.parse(b.generado_at) - Date.parse(a.generado_at))[0];
  if (newest) setState({ catalog: toCatalog(newest), fromBackup: true });
  if (isSupabaseConfigured) retryTimer = window.setTimeout(load, RETRY_MS);
}

function start() {
  if (started) return;
  started = true;
  load();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.fromBackup) load();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Carta y promos (compartido entre componentes). `catalog` es null solo en la primera visita, mientras carga. */
export function useCatalog(): CatalogState {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => state);
}
