import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import { fetchInsumos, type Insumo, type UnidadBase } from '@/lib/costes';
import {
  ETIQUETAS,
  fetchRentabilidad,
  fetchRentabilidadPromos,
  formatEur,
  formatPct,
  type ProductoRentabilidad,
  type PromoRentabilidad,
  type ResumenRentabilidad,
} from '@/lib/rentabilidad';
import { descargarExcel, type HojaExcel } from '@/lib/xlsxEscribir';

/** «Descargar Excel» de Rentabilidad (RENTABILIDAD.md, R3): resumen, productos, promos, ingredientes y recetas. */

export interface LineaRecetaExport {
  producto: string;
  ingrediente: string;
  cantidad: number;
  unidad: UnidadBase;
  merma_pct: number;
  coste_unitario: number;
}

export interface DatosExport {
  resumen: ResumenRentabilidad | null;
  productos: ProductoRentabilidad[];
  promos: PromoRentabilidad[];
  insumos: Insumo[];
  recetas: LineaRecetaExport[];
}

const cent = (c: number | null) => (c === null ? null : c / 100);
const etiqueta = (e: keyof typeof ETIQUETAS) => ETIQUETAS[e].texto;
const fecha = (iso: string) => iso.split('T')[0].split('-').reverse().join('/');

export function hojasRentabilidad(d: DatosExport): HojaExcel[] {
  const hojas: HojaExcel[] = [];
  if (d.resumen) {
    const r = d.resumen;
    const t = r.totales;
    hojas.push({
      nombre: 'Resumen',
      notas: [
        `Lo vendido del ${fecha(r.desde)} al ${fecha(r.hasta)} · precios sin IVA (${r.iva_pct} %) · con el coste de hoy`,
        `Ventas ${formatEur(Number(t.ventas_sin_iva))} · ganancia ${formatEur(Number(t.ganancia))} · margen medio ${t.margen_pct === null ? '—' : formatPct(Number(t.margen_pct))} (${etiqueta(t.etiqueta)}) · sin coste ${formatEur(Number(t.ventas_sin_coste))} · devuelto ${formatEur(Number(t.devuelto))}`,
      ],
      columnas: [
        { titulo: 'Categoría', ancho: 24 },
        { titulo: 'Unidades', formato: 'num', ancho: 10 },
        { titulo: 'Ventas sin IVA', formato: 'eur' },
        { titulo: '% de la venta', formato: 'pct' },
        { titulo: 'Ganancia', formato: 'eur' },
        { titulo: 'Margen', formato: 'pct', ancho: 10 },
        { titulo: 'Etiqueta', ancho: 12 },
        { titulo: 'Sin coste (€)', formato: 'eur' },
      ],
      filas: r.por_categoria.map((c) => [c.nombre, c.unidades, c.ventas_sin_iva, c.pct_venta, c.ganancia, c.margen_pct, etiqueta(c.etiqueta), c.ventas_sin_coste]),
    });
    hojas.push({
      nombre: 'Vendido por producto',
      notas: [`Del ${fecha(r.desde)} al ${fecha(r.hasta)} · precios sin IVA · con el coste de hoy`],
      columnas: [
        { titulo: 'Producto o promo', ancho: 30 },
        { titulo: 'Categoría', ancho: 20 },
        { titulo: 'Unidades', formato: 'num', ancho: 10 },
        { titulo: 'Ventas sin IVA', formato: 'eur' },
        { titulo: 'Ganancia', formato: 'eur' },
        { titulo: 'Margen', formato: 'pct', ancho: 10 },
        { titulo: 'Etiqueta', ancho: 12 },
      ],
      filas: r.productos.map((p) => [p.nombre, p.categoria, p.unidades, p.ventas_sin_iva, p.ganancia, p.margen_pct, etiqueta(p.etiqueta)]),
    });
  }
  hojas.push({
    nombre: 'Productos',
    columnas: [
      { titulo: 'Código', formato: 'num', ancho: 8 },
      { titulo: 'Producto', ancho: 30 },
      { titulo: 'Categoría', ancho: 20 },
      { titulo: 'En carta', ancho: 9 },
      { titulo: 'Precio', formato: 'eur', ancho: 11 },
      { titulo: 'Precio sin IVA', formato: 'eur' },
      { titulo: 'Coste', formato: 'eur', ancho: 11 },
      { titulo: 'Ganancia/ud', formato: 'eur', ancho: 12 },
      { titulo: 'Margen', formato: 'pct', ancho: 10 },
      { titulo: 'Etiqueta', ancho: 12 },
      { titulo: 'Vendidos 30 días', formato: 'num' },
      { titulo: 'Ganancia 30 días', formato: 'eur' },
    ],
    filas: d.productos.map((p) => [
      p.product_id, p.nombre, p.categoria ?? p.categoria_id, p.activo ? 'Sí' : 'No', cent(p.precio_centimos), p.precio_sin_iva,
      p.coste, p.ganancia, p.margen_pct, etiqueta(p.etiqueta), p.vendidos_30d, p.ganancia_30d,
    ]),
  });
  hojas.push({
    nombre: 'Promos',
    columnas: [
      { titulo: 'Promo', ancho: 30 },
      { titulo: 'Tipo', ancho: 10 },
      { titulo: 'Activa', ancho: 8 },
      { titulo: 'Precio', formato: 'eur', ancho: 11 },
      { titulo: 'Precio normal', formato: 'eur' },
      { titulo: 'Descuento anunciado', formato: 'pct' },
      { titulo: 'Descuento real', formato: 'pct' },
      { titulo: 'Aviso', ancho: 22 },
      { titulo: 'Coste', formato: 'eur', ancho: 11 },
      { titulo: 'Margen', formato: 'pct', ancho: 10 },
      { titulo: 'Etiqueta', ancho: 12 },
      { titulo: 'Sin receta', ancho: 30 },
      { titulo: 'Vendidas 30 días', formato: 'num' },
    ],
    filas: d.promos.map((p) => [
      p.nombre, p.tipo, p.activa ? 'Sí' : 'No', cent(p.precio_centimos), cent(p.precio_normal_centimos), p.descuento_anunciado_pct,
      p.descuento_real_pct, p.aviso_descuento ? 'El descuento no cuadra' : p.productos === 0 ? 'Sin productos' : '', p.coste, p.margen_pct,
      etiqueta(p.etiqueta), p.sin_receta.join(', '), p.vendidas_30d,
    ]),
  });
  hojas.push({
    nombre: 'Ingredientes',
    columnas: [
      { titulo: 'Código', formato: 'num', ancho: 8 },
      { titulo: 'Ingrediente', ancho: 34 },
      { titulo: 'Categoría', ancho: 18 },
      { titulo: 'Proveedor', ancho: 18 },
      { titulo: 'Formato', ancho: 16 },
      { titulo: 'Cantidad', formato: 'num', ancho: 10 },
      { titulo: 'Unidad', ancho: 8 },
      { titulo: 'Rendimiento', formato: 'pct', ancho: 12 },
      { titulo: 'Precio compra sin IVA', formato: 'eur4' },
      { titulo: 'Coste por unidad', formato: 'eur4' },
      { titulo: 'En uso', ancho: 8 },
    ],
    filas: d.insumos.map((i) => [
      i.id, i.nombre, i.categoria, i.proveedor, i.formato, i.cantidad_formato, i.unidad_base, i.rendimiento_pct, i.precio_compra_sin_iva,
      i.coste_unitario, i.activo ? 'Sí' : 'No',
    ]),
  });
  hojas.push({
    nombre: 'Recetas',
    columnas: [
      { titulo: 'Producto', ancho: 30 },
      { titulo: 'Ingrediente', ancho: 34 },
      { titulo: 'Cantidad', formato: 'num', ancho: 10 },
      { titulo: 'Unidad', ancho: 8 },
      { titulo: 'Merma', formato: 'pct', ancho: 9 },
      { titulo: 'Coste por unidad', formato: 'eur4' },
      { titulo: 'Coste de la línea', formato: 'eur4' },
    ],
    filas: d.recetas.map((l) => [
      l.producto, l.ingrediente, l.cantidad, l.unidad, l.merma_pct, l.coste_unitario,
      (l.cantidad * l.coste_unitario) / (1 - l.merma_pct / 100),
    ]),
  });
  return hojas;
}

async function fetchRecetasExport(): Promise<{ recetas: LineaRecetaExport[]; error: string | null }> {
  const { data, error } = await supabase
    .from('recetas')
    .select('cantidad, merma_pct, products(nombre), insumos(nombre, unidad_base, coste_unitario)');
  if (error) return { recetas: [], error: translateTicketError(error) };
  type Fila = { cantidad: number; merma_pct: number; products: { nombre: string } | null; insumos: { nombre: string; unidad_base: UnidadBase; coste_unitario: number } | null };
  const recetas = (data as unknown as Fila[])
    .map((r) => ({
      producto: r.products?.nombre ?? '¿?',
      ingrediente: r.insumos?.nombre ?? '¿?',
      cantidad: Number(r.cantidad),
      unidad: r.insumos?.unidad_base ?? 'ud',
      merma_pct: Number(r.merma_pct),
      coste_unitario: Number(r.insumos?.coste_unitario ?? 0),
    }))
    .sort((a, b) => a.producto.localeCompare(b.producto, 'es') || a.ingrediente.localeCompare(b.ingrediente, 'es'));
  return { recetas, error: null };
}

/** Lee todo y descarga «rentabilidad-la-alameda-AAAA-MM-DD.xlsx». Devuelve un error o null. */
export async function descargarRentabilidad(resumen: ResumenRentabilidad | null): Promise<string | null> {
  const [p, pr, i, r] = await Promise.all([fetchRentabilidad(), fetchRentabilidadPromos(), fetchInsumos(), fetchRecetasExport()]);
  const error = p.error ?? pr.error ?? i.error ?? r.error;
  if (error) return error;
  const hoy = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  descargarExcel(
    `rentabilidad-la-alameda-${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`,
    hojasRentabilidad({ resumen, productos: p.productos, promos: pr.promos, insumos: i.insumos, recetas: r.recetas })
  );
  return null;
}
