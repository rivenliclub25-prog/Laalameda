import { devueltoVenta, type Metodo, type Venta, type VentaResultado } from '@/lib/pos';

/** Lo que sale en el justificante de pago (no es una factura: el TPV no emite tickets fiscales, POS.md D1). */
export interface DatosJustificante {
  numero: number;
  fecha: string;
  /** "Mesa 2", "Barra 1" o "Venta rápida". */
  lugar: string;
  metodo: Metodo;
  lineas: {
    cantidad: number;
    nombre: string;
    importe: number;
    /** Ahorro de la promo en esta línea (céntimos), si se conoce. */
    ahorro: number | null;
    ticket: string | null;
  }[];
  total: number;
  descuentos: number;
  devuelto: number;
}

/** Justificante de una venta recién cobrada (respuesta de pos_venta_barra / pos_cobrar_cuenta). */
export function justificanteDeResultado(v: VentaResultado, lugar: string): DatosJustificante {
  return {
    numero: v.numero,
    fecha: v.cobrado_at,
    lugar,
    metodo: v.metodo,
    lineas: v.lineas.map((l) => ({
      cantidad: l.cantidad,
      nombre: l.nombre,
      importe: l.cantidad * l.precio_unitario_centimos,
      ahorro: l.descuento_centimos ?? null,
      ticket: l.ticket_codigo ?? null,
    })),
    total: v.total_centimos,
    descuentos: v.descuentos_centimos ?? 0,
    devuelto: 0,
  };
}

/** Justificante de una venta ya guardada (lista de ventas del TPV o del panel). */
export function justificanteDeVenta(v: Venta): DatosJustificante {
  const lineas = (v.orders?.order_items ?? []).filter((l) => l.estado !== 'anulada');
  return {
    numero: v.numero,
    fecha: v.cobrado_at,
    lugar: lugarDeVenta(v),
    metodo: v.metodo,
    lineas: lineas.map((l) => ({
      cantidad: l.cantidad,
      nombre: l.nombre,
      importe: l.cantidad * l.precio_unitario_centimos,
      ahorro: l.descuento_centimos,
      ticket: l.ticket_codigo,
    })),
    total: v.total_centimos,
    descuentos: v.descuentos_centimos,
    devuelto: devueltoVenta(v),
  };
}

/** Dónde se hizo la venta: el nombre de la mesa o del puesto de barra, o «Venta rápida». */
export function lugarDeVenta(v: Venta): string {
  return v.orders?.origen === 'mesa' ? (v.orders.mesas?.nombre ?? 'Mesa') : 'Venta rápida';
}
