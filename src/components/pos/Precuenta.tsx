import { Printer } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { siteConfig } from '@/data/site';
import { printArea } from '@/lib/informes';
import { formatEuros } from '@/lib/pos';
import type { DatosPrecuenta } from '@/lib/precuenta';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Cuenta provisional para la ticketera de 80 mm, mismo estilo que el justificante. Al imprimir sale solo
 * este bloque (`.print-area`) en una página de 80 mm (`.ticket-80`, ver index.css). Sin nº de venta ni
 * forma de pago: la cuenta sigue abierta.
 */
export function Precuenta({ datos }: { datos: DatosPrecuenta }) {
  const impresa = new Date(datos.impresa_at);
  const hayPagos = datos.pagos > 0;
  return (
    <div className="print-area ticket-80 mx-auto w-full max-w-[300px] bg-white px-3 py-4 font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <p className="text-[15px] font-bold uppercase tracking-wide">{siteConfig.name}</p>
        <p>{siteConfig.address}</p>
        <p>Tel. {siteConfig.phoneDisplay}</p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center text-[17px] font-bold uppercase tracking-widest">Cuenta</p>
      <p className="mt-0.5 border border-black py-0.5 text-center text-[11px] font-bold uppercase">Pendiente de pago · No es justificante de pago</p>
      <div className="mt-1.5 flex justify-between font-bold">
        <span>{datos.lugar}</span>
        <span>
          {impresa.toLocaleDateString('es-ES')} · {hora(datos.impresa_at)}
        </span>
      </div>
      <p className="text-[11px]">Cuenta abierta a las {hora(datos.abierta_at)}</p>

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
            {(l.tipo || l.ahorro || l.ticket) && (
              <p className="pl-3 text-[11px]">
                {[l.tipo, l.ticket ? `ticket ${l.ticket}` : null, l.ahorro ? `ahorro ${formatEuros(l.ahorro)}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
            {l.notas && <p className="pl-3 text-[11px] italic">«{l.notas}»</p>}
          </li>
        ))}
      </ul>

      <div className="my-2 border-t border-dashed border-black" />
      {datos.ahorro > 0 && (
        <>
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatEuros(datos.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Ahorro en promos</span>
            <span className="tabular-nums">−{formatEuros(datos.ahorro)}</span>
          </div>
        </>
      )}
      {hayPagos && (
        <div className="flex justify-between">
          <span>
            Ya pagado ({datos.pagos} {datos.pagos === 1 ? 'pago' : 'pagos'})
          </span>
          <span className="tabular-nums">{formatEuros(datos.pagado)}</span>
        </div>
      )}
      <div className="mt-1 flex items-baseline justify-between text-[17px] font-bold">
        <span>{hayPagos ? 'QUEDA POR COBRAR' : 'TOTAL'}</span>
        <span className="tabular-nums">{formatEuros(datos.total)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center text-[11px]">Gracias por su visita</p>
    </div>
  );
}

/** Vista previa de la cuenta con «Imprimir» y «Cerrar». onImprimir apunta la impresión (no la bloquea). */
export function PrecuentaModal({ datos, onImprimir, onClose }: { datos: DatosPrecuenta; onImprimir?: () => void; onClose: () => void }) {
  return (
    <Modal open title={`Cuenta · ${datos.lugar}`} onClose={onClose} maxWidth="380px">
      <div className="rounded-r-sm border border-carbon/15">
        <Precuenta datos={datos} />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            onImprimir?.();
            printArea();
          }}
          className={`btn-vino min-h-12 flex-1 ${focusRing}`}
        >
          <Printer size={18} aria-hidden="true" /> Imprimir
        </button>
        <button type="button" onClick={onClose} className={`btn-outline-vino min-h-12 flex-1 ${focusRing}`}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
