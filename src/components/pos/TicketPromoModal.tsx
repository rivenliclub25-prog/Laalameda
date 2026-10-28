import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Plus, RotateCcw } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { ManualCodeForm, QrScannerBox } from '@/components/pos/TicketScanner';
import { playFeedback } from '@/lib/feedback';
import { formatEuros, type PromoVenta } from '@/lib/pos';
import { translateTicketCode } from '@/lib/ticketErrors';
import { formatTime, lookupTicket, parseScannedCode, type TicketLookup } from '@/lib/tickets';

type Fase =
  | { kind: 'idle' }
  | { kind: 'checking'; codigo: string }
  | { kind: 'ok'; lookup: TicketLookup }
  | { kind: 'error'; text: string };

export interface TicketElegido {
  codigo: string;
  socio: string | null;
}

/**
 * Pide el ticket del socio para una promo del club (TPV): se escanea o se escribe y se comprueba
 * con lookup_ticket. El canje de verdad lo hace la base de datos al añadir la línea, así que si dos
 * camareros usan el mismo ticket a la vez, solo uno lo consigue.
 */
export function TicketPromoModal({
  promo,
  usados,
  soundOn,
  onClose,
  onConfirm,
}: {
  promo: PromoVenta;
  /** Códigos ya puestos en este pedido. */
  usados: string[];
  soundOn: boolean;
  onClose: () => void;
  onConfirm: (ticket: TicketElegido) => void;
}) {
  const [fase, setFase] = useState<Fase>({ kind: 'idle' });

  const check = useCallback(
    async (codigo: string) => {
      if (usados.includes(codigo)) {
        setFase({ kind: 'error', text: 'Este ticket ya está en este pedido.' });
        playFeedback('error', soundOn);
        return;
      }
      setFase({ kind: 'checking', codigo });
      const { result, error } = await lookupTicket(codigo);
      let text: string | null = null;
      if (!result) text = error ?? translateTicketCode(null);
      else if (!result.valido) text = translateTicketCode(result.motivo);
      else if (result.promo_id !== promo.id) text = `Este ticket es de «${result.promo_nombre}», no de «${promo.nombre}».`;
      if (text || !result) {
        setFase({ kind: 'error', text: text ?? translateTicketCode(null) });
        playFeedback('error', soundOn);
        return;
      }
      setFase({ kind: 'ok', lookup: result });
      playFeedback('ok', soundOn);
    },
    [usados, promo.id, promo.nombre, soundOn]
  );

  const onScan = useCallback(
    (text: string) => {
      if (fase.kind !== 'idle') return;
      const codigo = parseScannedCode(text);
      if (codigo) check(codigo);
      else {
        setFase({ kind: 'error', text: 'Este QR no es un ticket de La Alameda.' });
        playFeedback('error', soundOn);
      }
    },
    [check, fase.kind, soundOn]
  );

  return createPortal(
    <Modal open title={`Ticket para «${promo.nombre}»`} onClose={onClose} maxWidth="460px">
      <p className="mb-3 text-sm text-carbon/70">
        Promo del club{promo.priceCents !== undefined ? ` · ${formatEuros(promo.priceCents)}` : ''}. Escanea el QR del ticket del socio o escribe su código.
      </p>

      <QrScannerBox paused={fase.kind !== 'idle'} onScan={onScan} />

      {fase.kind === 'idle' && <ManualCodeForm disabled={false} onSubmit={check} idPrefix="ticket-promo-codigo" />}

      {fase.kind === 'checking' && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-carbon/70" role="status">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Comprobando {fase.codigo}…
        </p>
      )}

      {fase.kind === 'error' && (
        <div className="mt-4 space-y-3">
          <Notice kind="error">{fase.text}</Notice>
          <button type="button" onClick={() => setFase({ kind: 'idle' })} className={`btn-outline-vino w-full ${focusRing}`}>
            <RotateCcw size={16} aria-hidden="true" /> Probar otro
          </button>
        </div>
      )}

      {fase.kind === 'ok' && (
        <div className="mt-4 space-y-3">
          <div className="rounded-r-md border border-[#2f6b3f]/40 bg-[#2f6b3f]/10 p-3 text-[#1f4a2b]">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} aria-hidden="true" /> Ticket válido · <span className="tracking-[0.12em]">{fase.lookup.codigo}</span>
            </p>
            <p className="mt-1 text-sm">
              Socio: {fase.lookup.socio_nombre ?? '—'}
              {fase.lookup.expires_at ? ` · caduca a las ${formatTime(fase.lookup.expires_at)}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onConfirm({ codigo: fase.lookup.codigo, socio: fase.lookup.socio_nombre })}
            className={`btn-vino min-h-14 w-full text-base ${focusRing}`}
          >
            <Plus size={18} aria-hidden="true" /> Añadir {promo.nombre}
          </button>
          <button type="button" onClick={() => setFase({ kind: 'idle' })} className={`w-full text-sm font-semibold text-carbon/60 hover:text-vino ${focusRing}`}>
            Usar otro ticket
          </button>
        </div>
      )}
    </Modal>,
    document.body
  );
}
