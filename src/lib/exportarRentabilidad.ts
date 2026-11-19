import { supabase } from '@/lib/supabase';
import { translateTicketError } from '@/lib/ticketErrors';
import { fetchInsumos, type Insumo, type UnidadBase } from '@/lib/costes';
import { fetchRentabilidad, type ProductoRentabilidad } from '@/lib/rentabilidad';
import { descargarExcel, type HojaExcel } from '@/lib/xlsxEscribir';

/**
 * «Descargar Excel» de Rentabilidad (RENTABILIDAD.md, R3b): las mismas 3 hojas y columnas que el Excel de
 * costes del bar (Materias Primas, Coste_Unitario y Precio_venta), con los nombres de la carta, para poder
 * tocarlo y volver a importarlo. Precios tal cual (sin quitar IVA).
 */

export interface LineaRecetaExport {
  product_id: number;
  producto: string;
  ingrediente: string;
  cantidad: number;
  unidad: UnidadBase;
  merma_pct: number;
  coste_unitario: number;
}

export interface DatosExport {
  productos: ProductoRentabilidad[];
  insumos: Insumo[];
  recetas: LineaRecetaExport[];
}

const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 });

export function hojasRentabilidad(d: DatosExport): HojaExcel[] {
  const categoria = new Map(d.productos.map((p) => [p.product_id, p.categoria ?? p.categoria_id]));
  const porProducto = new Map<number, LineaRecetaExport[]>();
  for (const l of d.recetas) porProducto.set(l.product_id, [...(porProducto.get(l.product_id) ?? []), l]);
  const costeLinea = (l: LineaRecetaExport) => (l.cantidad * l.coste_unitario) / (1 - l.merma_pct / 100);

  return [
    {
      nombre: 'Materias Primas',
      columnas: [
        { titulo: 'Cat', ancho: 18 },
        { titulo: 'Materia Prima', ancho: 34 },
        { titulo: 'Tamaño', formato: 'num', ancho: 10 },
        { titulo: 'U/medida', ancho: 9 },
        { titulo: 'Precio Compra (€)', formato: 'eur4', ancho: 16 },
        { titulo: 'Costo por Ml/Und/gr', formato: 'eur4', ancho: 18 },
        { titulo: 'Proveedor', ancho: 18 },
        { titulo: 'Rendimiento %', formato: 'pct', ancho: 13 },
        { titulo: 'En uso', ancho: 8 },
        { titulo: 'Código', formato: 'num', ancho: 8 },
      ],
      filas: d.insumos.map((i) => [
        i.categoria, i.nombre, i.cantidad_formato, i.unidad_base, i.precio_compra_sin_iva, i.coste_unitario, i.proveedor, i.rendimiento_pct,
        i.activo ? 'Sí' : 'No', i.id,
      ]),
    },
    {
      nombre: 'Coste_Unitario',
      columnas: [
        { titulo: 'Nombre en carta', ancho: 18 },
        { titulo: 'Producto', ancho: 30 },
        { titulo: 'Materia Prima', ancho: 34 },
        { titulo: 'Cantidad a usar', formato: 'num', ancho: 14 },
        { titulo: 'Medida', ancho: 8 },
        { titulo: 'Coste unitario', formato: 'eur4', ancho: 14 },
        { titulo: 'Merma %', formato: 'pct', ancho: 9 },
        { titulo: 'Código', formato: 'num', ancho: 8 },
      ],
      filas: d.recetas.map((l) => [categoria.get(l.product_id) ?? '', l.producto, l.ingrediente, l.cantidad, l.unidad, costeLinea(l), l.merma_pct || null, l.product_id]),
    },
    {
      nombre: 'Precio_venta',
      columnas: [
        { titulo: 'Nombre en carta', ancho: 18 },
        { titulo: 'Producto', ancho: 30 },
        { titulo: 'Receta', ancho: 44 },
        { titulo: 'Coste', formato: 'eur', ancho: 11 },
        { titulo: 'Precio_carta', formato: 'eur', ancho: 12 },
        { titulo: 'Ganancia', formato: 'eur', ancho: 11 },
        { titulo: '% ganancia', formato: 'pct', ancho: 11 },
        { titulo: 'Sale en la carta', ancho: 14 },
        { titulo: 'Código', formato: 'num', ancho: 8 },
      ],
      // Solo los que tienen precio (sin precio no se podría volver a importar).
      filas: d.productos
        .filter((p) => p.precio_centimos !== null)
        .map((p) => [
          p.categoria ?? p.categoria_id,
          p.nombre,
          (porProducto.get(p.product_id) ?? []).map((l) => `${num(l.cantidad)} ${l.unidad} ${l.ingrediente}`).join(' + '),
          p.coste,
          p.precio_centimos! / 100,
          p.ganancia,
          p.margen_pct,
          p.activo ? 'Sí' : 'No',
          p.product_id,
        ]),
    },
  ];
}

async function fetchRecetasExport(): Promise<{ recetas: LineaRecetaExport[]; error: string | null }> {
  const { data, error } = await supabase
    .from('recetas')
    .select('product_id, cantidad, merma_pct, products(nombre), insumos(nombre, unidad_base, coste_unitario)');
  if (error) return { recetas: [], error: translateTicketError(error) };
  type Fila = {
    product_id: number;
    cantidad: number;
    merma_pct: number;
    products: { nombre: string } | null;
    insumos: { nombre: string; unidad_base: UnidadBase; coste_unitario: number } | null;
  };
  const recetas = (data as unknown as Fila[])
    .map((r) => ({
      product_id: r.product_id,
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

/** Lee todo y descarga «costes-la-alameda-AAAA-MM-DD.xlsx». Devuelve un error o null. */
export async function descargarRentabilidad(): Promise<string | null> {
  const [p, i, r] = await Promise.all([fetchRentabilidad(), fetchInsumos(), fetchRecetasExport()]);
  const error = p.error ?? i.error ?? r.error;
  if (error) return error;
  const hoy = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  descargarExcel(
    `costes-la-alameda-${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`,
    hojasRentabilidad({ productos: p.productos, insumos: [...i.insumos].sort((a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '', 'es') || a.nombre.localeCompare(b.nombre, 'es')), recetas: r.recetas })
  );
  return null;
}
