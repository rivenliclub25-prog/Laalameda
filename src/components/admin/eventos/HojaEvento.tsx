import { useState } from 'react';
import { Check, Copy, Printer } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { siteConfig } from '@/data/site';
import { printArea } from '@/lib/informes';
import { METODOS, formatEuros } from '@/lib/pos';
import { fechaLarga, horaCorta, nombreItem, textoWhatsApp, type Evento } from '@/lib/eventos';

/**
 * Hoja del acuerdo para el cliente (EVENTOS.md, EV-D12): se imprime como la hoja de cierre (solo este
 * bloque, `.print-area`) y se puede copiar en texto para WhatsApp. No es una factura.
 */
export function HojaEvento({ evento }: { evento: Evento }) {
  return (
    <div className="print-area mx-auto w-full max-w-[560px] bg-white p-5 text-[13px] leading-snug text-black">
      <div className="text-center">
        <p className="text-[17px] font-bold uppercase tracking-wide">{siteConfig.name}</p>
        <p>{siteConfig.address}</p>
        <p>Tel. {siteConfig.phoneDisplay}</p>
      </div>
      <div className="my-3 border-t border-dashed border-black" />
      <p className="text-center text-[15px] font-bold uppercase tracking-widest">Acuerdo de evento</p>
      <p className="mt-2 text-center text-[16px] font-bold">{evento.nombre}</p>
      <p className="text-center">
        {fechaLarga(evento.fecha)}
        {evento.hora_inicio ? `, a las ${horaCorta(evento.hora_inicio)}` : ''}
        {evento.personas ? ` · unas ${evento.personas} personas` : ''}
      </p>
      {(evento.contacto_nombre || evento.contacto_telefono) && (
        <p className="mt-1 text-center">
          Contacto: {[evento.contacto_nombre, evento.contacto_telefono].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="my-3 border-t border-dashed border-black" />
      <p className="font-bold">Incluye</p>
      <ul className="mt-1 space-y-0.5">
        {evento.items.map((i) => (
          <li key={i.id}>
            {i.cantidad} × {nombreItem(i)}
          </li>
        ))}
      </ul>

      <div className="my-3 border-t border-dashed border-black" />
      <div className="flex items-baseline justify-between text-[16px] font-bold">
        <span>Precio cerrado</span>
        <span className="tabular-nums">{formatEuros(evento.precio_centimos)}</span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {evento.plazos.map((p) => (
          <li key={p.id} className="flex justify-between gap-2">
            <span>
              {p.nombre}
              {p.venta ? ` · pagado (${METODOS[p.venta.metodo].toLowerCase()})` : ' · pendiente'}
            </span>
            <span className="tabular-nums">{formatEuros(p.importe_centimos)}</span>
          </li>
        ))}
      </ul>

      {evento.notas && (
        <>
          <div className="my-3 border-t border-dashed border-black" />
          <p className="whitespace-pre-line">{evento.notas}</p>
        </>
      )}
      <div className="my-3 border-t border-dashed border-black" />
      <p className="text-center text-[11px]">Este documento no es una factura.</p>
      <p className="text-center text-[11px]">¡Gracias por celebrarlo con nosotros!</p>
    </div>
  );
}

/** Vista previa con «Imprimir», «Copiar para WhatsApp» y «Cerrar». */
export function HojaEventoModal({ evento, onClose }: { evento: Evento; onClose: () => void }) {
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoWhatsApp(evento, siteConfig.name));
      setCopiado('ok');
    } catch {
      setCopiado('error');
    }
  };
  return (
    <Modal open title={`Hoja para el cliente · ${evento.nombre}`} onClose={onClose} maxWidth="640px">
      <div className="rounded-r-sm border border-carbon/15">
        <HojaEvento evento={evento} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={printArea} className={`btn-vino min-h-12 ${focusRing}`}>
          <Printer size={18} aria-hidden="true" /> Imprimir
        </button>
        <button type="button" onClick={copiar} className={`btn-outline-vino min-h-12 ${focusRing}`}>
          {copiado === 'ok' ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          {copiado === 'ok' ? 'Copiado' : 'Copiar para WhatsApp'}
        </button>
        <button type="button" onClick={onClose} className={`btn-outline-vino min-h-12 ${focusRing}`}>
          Cerrar
        </button>
      </div>
      <p className="mt-2 text-xs text-carbon/60" aria-live="polite">
        {copiado === 'ok'
          ? 'Texto copiado: pégalo en el chat de WhatsApp del cliente.'
          : copiado === 'error'
            ? 'No se ha podido copiar: este navegador no lo permite.'
            : '«Copiar para WhatsApp» copia el acuerdo en texto; no envía nada.'}
      </p>
    </Modal>
  );
}
