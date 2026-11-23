import { TIPOS_PROMO, lineaPorCobrar, totalCuenta, type CuentaMesa } from '@/lib/pos';

/**
 * Cuenta provisional (pre-cuenta) de una mesa o puesto de barra: lo que queda por cobrar, para dárselo
 * al cliente ANTES de que pague (POS.md, entrega C). No es el justificante de pago.
 *
 * El total es el mismo que cobra «Cobrar»: totalCuenta() suma las mismas líneas que la base de datos al
 * cobrar (aceptadas o servidas y sin pagar, precio copiado × cantidad). Aquí no se recalcula nada más.
 */
export interface DatosPrecuenta {
  /** «Mesa 3», «Barra 2». */
  lugar: string;
  abierta_at: string;
  impresa_at: string;
  lineas: {
    cantidad: number;
    nombre: string;
    /** Importe de la línea en céntimos (lo que se cobra). */
    importe: number;
    /** Ahorro de la promo en esta línea (céntimos), si lo hay. */
    ahorro: number | null;
    /** «Pack», «Obsequio»… si es una promo. */
    tipo: string | null;
    ticket: string | null;
    notas: string | null;
  }[];
  /** Total sin las promos (total + ahorro). */
  subtotal: number;
  ahorro: number;
  /** Lo que queda por cobrar: exactamente lo que cobrará «Cobrar». */
  total: number;
  /** Lo ya pagado por separado (entrega B) y en cuántos pagos. */
  pagado: number;
  pagos: number;
}

export function precuentaDeCuenta(cuenta: CuentaMesa, lugar: string, impresaAt: string = new Date().toISOString()): DatosPrecuenta {
  const porCobrar = cuenta.order_items.filter(lineaPorCobrar);
  const pagadas = cuenta.order_items.filter((l) => l.sale_id && l.estado !== 'anulada');
  const total = totalCuenta(cuenta);
  const ahorro = porCobrar.reduce((s, l) => s + (l.descuento_centimos ?? 0), 0);
  return {
    lugar,
    abierta_at: cuenta.created_at,
    impresa_at: impresaAt,
    lineas: porCobrar.map((l) => ({
      cantidad: l.cantidad,
      nombre: l.nombre,
      importe: l.precio_unitario_centimos * l.cantidad,
      ahorro: l.descuento_centimos || null,
      tipo: l.tipo_linea === 'producto' ? null : TIPOS_PROMO[l.tipo_linea],
      ticket: l.ticket_codigo,
      notas: l.notas,
    })),
    subtotal: total + ahorro,
    ahorro,
    total,
    pagado: pagadas.reduce((s, l) => s + l.precio_unitario_centimos * l.cantidad, 0),
    pagos: new Set(pagadas.map((l) => l.sale_id)).size,
  };
}
