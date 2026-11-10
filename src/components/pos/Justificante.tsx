import { Printer } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { siteConfig } from '@/data/site';
import { printArea } from '@/lib/informes';
import { METODOS, formatEuros } from '@/lib/pos';
import type { DatosJustificante } from '@/lib/justificante';

/**
 * Justificante de pago para la ticketera de 80 mm (también se imprime bien en A4). Al imprimir sale
 * solo este bloque (`.print-area`) en una página de 80 mm de ancho (`.ticket-80`, ver index.css).
 */
export function Justificante({ datos }: { datos: DatosJustificante }) {
  const fecha = new Date(datos.fecha);
  return (
    <div className="print-area ticket-80 mx-auto w-full max-w-[300px] bg-white px-3 py-4 font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <p className="text-[15px] font-bold uppercase tracking-wide">{siteConfig.name}</p>
        <p>{siteConfig.address}</p>
        <p>Tel. {siteConfig.phoneDisplay}</p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center font-bold uppercase">Justificante de pago</p>
      <div className="mt-1 flex justify-between">
        <span>Venta nº {datos.numero}</span>
        <span>{datos.lugar}</span>
      </div>
      <p>
        {fecha.toLocaleDateString('es-ES')} · {fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
      </p>

      <div className="my-2 border-t border-dashed border-black" />
      <ul className="space-y-1">
        {datos.lineas.map((l, i) => (
          <li key={i}>
            <div className="flex justify-between gap-2">
              <span className="min-w-0">
                {l.cantidad} × {l.nombre}
              </span>
              <span className="shrink-0 tabular-nums">{formatEuros(l.importe)}</span>
            </div>
            {(l.ticket || l.ahorro) && (
              <p className="pl-3 text-[11px]">
                {l.ticket ? `Ticket ${l.ticket}` : ''}
                {l.ticket && l.ahorro ? ' · ' : ''}
                {l.ahorro ? `ahorro ${formatEuros(l.ahorro)}` : ''}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="my-2 border-t border-dashed border-black" />
      {datos.descuentos > 0 && (
        <div className="flex justify-between">
          <span>Ahorro en promos</span>
          <span className="tabular-nums">−{formatEuros(datos.descuentos)}</span>
        </div>
      )}
      <div className="flex justify-between text-[15px] font-bold">
        <span>TOTAL</span>
        <span className="tabular-nums">{formatEuros(datos.total)}</span>
      </div>
      <p>Pagado: {METODOS[datos.metodo]}</p>
      {datos.devuelto > 0 && (
        <p className="mt-1">
          Devuelto: {formatEuros(datos.devuelto)} · Neto: {formatEuros(datos.total - datos.devuelto)}
        </p>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center text-[11px]">Este justificante no es una factura.</p>
      <p className="text-center text-[11px]">¡Gracias por tu visita!</p>
    </div>
  );
}

/** Ventana con el justificante y el botón de imprimir. */
export function JustificanteModal({ datos, onClose }: { datos: DatosJustificante; onClose: () => void }) {
  return (
    <Modal open title={`Justificante · venta nº ${datos.numero}`} onClose={onClose} maxWidth="380px">
      <div className="rounded-r-sm border border-carbon/15">
        <Justificante datos={datos} />
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={printArea} className={`btn-vino flex-1 ${focusRing}`}>
          <Printer size={16} aria-hidden="true" /> Imprimir
        </button>
        <button type="button" onClick={onClose} className={`btn-outline-vino flex-1 ${focusRing}`}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
