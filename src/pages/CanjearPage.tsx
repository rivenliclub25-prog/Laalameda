import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Loader2, ScanLine, Volume2, VolumeX, XCircle } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { focusRing } from '@/components/club/FormControls';
import { ManualCodeForm, QrScannerBox } from '@/components/pos/TicketScanner';
import { getHashParams } from '@/lib/router';
import { useScrollLock } from '@/lib/useScrollLock';
import { loadSoundEnabled, playFeedback, saveSoundEnabled } from '@/lib/feedback';
import { translateTicketCode } from '@/lib/ticketErrors';
import {
  formatTime,
  lookupTicket,
  parseEurosToCents,
  parseScannedCode,
  redeemTicket,
  type Ticket,
  type TicketLookup,
} from '@/lib/tickets';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking'; codigo: string }
  | { kind: 'valid'; lookup: TicketLookup }
  | { kind: 'redeeming'; lookup: TicketLookup }
  | { kind: 'invalid'; codigo: string; text: string; detalle: string | null; promo: string | null }
  | { kind: 'redeemed'; lookup: TicketLookup; ticket: Ticket };

/** Frase extra para el camarero según el motivo ("Canjeado a las 21:14"…). */
function invalidDetail(lookup: TicketLookup | null): string | null {
  if (!lookup) return null;
  if (lookup.motivo === 'TICKET_YA_CANJEADO' && lookup.canjeado_at) return `Canjeado a las ${formatTime(lookup.canjeado_at)}.`;
  if (lookup.motivo === 'TICKET_CADUCADO' && lookup.expires_at) return `Caducó a las ${formatTime(lookup.expires_at)}.`;
  return null;
}

export function CanjearPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [soundOn, setSoundOn] = useState(loadSoundEnabled);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const reset = useCallback(() => {
    busyRef.current = false;
    setPhase({ kind: 'idle' });
  }, []);

  const check = useCallback(async (codigo: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase({ kind: 'checking', codigo });
    const { result, error } = await lookupTicket(codigo);
    if (result?.valido) {
      setPhase({ kind: 'valid', lookup: result });
      playFeedback('ok', soundRef.current);
    } else {
      setPhase({
        kind: 'invalid',
        codigo,
        text: error ?? translateTicketCode(result?.motivo),
        detalle: invalidDetail(result),
        promo: result?.promo_nombre ?? null,
      });
      playFeedback('error', soundRef.current);
    }
  }, []);

  // Código en la URL (QR leído con la cámara normal del móvil): se comprueba solo y se quita de la URL.
  useEffect(() => {
    const fromUrl = () => {
      const raw = getHashParams().get('c');
      if (!raw) return;
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/canjear`);
      const codigo = parseScannedCode(raw);
      if (codigo) check(codigo);
    };
    fromUrl();
    window.addEventListener('hashchange', fromUrl);
    return () => window.removeEventListener('hashchange', fromUrl);
  }, [check]);

  const onScan = useCallback(
    (text: string) => {
      if (busyRef.current) return;
      const codigo = parseScannedCode(text);
      if (codigo) {
        check(codigo);
      } else {
        busyRef.current = true;
        setPhase({
          kind: 'invalid',
          codigo: '',
          text: 'Este QR no es un ticket de La Alameda.',
          detalle: null,
          promo: null,
        });
        playFeedback('error', soundRef.current);
      }
    },
    [check]
  );

  const redeem = async (importeCentimos: number | null) => {
    if (phase.kind !== 'valid') return;
    const lookup = phase.lookup;
    setPhase({ kind: 'redeeming', lookup });
    const { ticket, error } = await redeemTicket(lookup.codigo, importeCentimos);
    if (ticket) {
      setPhase({ kind: 'redeemed', lookup, ticket });
      playFeedback('ok', soundRef.current);
    } else {
      setPhase({ kind: 'invalid', codigo: lookup.codigo, text: error ?? translateTicketCode(null), detalle: null, promo: lookup.promo_nombre });
      playFeedback('error', soundRef.current);
    }
  };

  const toggleSound = () => {
    setSoundOn((on) => {
      saveSoundEnabled(!on);
      return !on;
    });
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-[520px]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-vino">Personal del bar</div>
            <h1 className="mt-2 font-display text-[2.2rem] font-semibold leading-[1.05] text-vino sm:text-[2.6rem]">
              Canjear tickets
            </h1>
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-carbon/20 bg-white text-carbon/70 transition-colors hover:text-vino ${focusRing}`}
          >
            {soundOn ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
            <span className="sr-only">{soundOn ? 'Silenciar sonido' : 'Activar sonido'}</span>
          </button>
        </header>
        <div className="divider-gold mb-6 ml-0 mt-4" />

        <QrScannerBox paused={phase.kind !== 'idle'} onScan={onScan} />

        <ManualCodeForm disabled={phase.kind !== 'idle'} onSubmit={check} />

        <p className="mt-6 text-center text-xs text-carbon/55">
          También puedes leer el QR con la cámara normal del móvil: se abrirá esta pantalla con el ticket.
        </p>
      </div>

      <ResultOverlay phase={phase} onReset={reset} onRedeem={redeem} />
    </PageShell>
  );
}

// ---------------------------------------------------------------------
// Resultado a pantalla completa
// ---------------------------------------------------------------------

const VERDE = 'bg-[#2f6b3f]';

function ResultOverlay({
  phase,
  onReset,
  onRedeem,
}: {
  phase: Phase;
  onReset: () => void;
  onRedeem: (importeCentimos: number | null) => void;
}) {
  const mainButtonRef = useRef<HTMLButtonElement>(null);
  useScrollLock(phase.kind !== 'idle');
  const [importe, setImporte] = useState('');
  const [importeError, setImporteError] = useState<string | null>(null);

  useEffect(() => {
    if (phase.kind === 'valid') {
      setImporte('');
      setImporteError(null);
    }
    if (phase.kind !== 'idle' && phase.kind !== 'checking') mainButtonRef.current?.focus();
  }, [phase.kind]);

  // Tras canjear, vuelve solo al escáner a los 3 segundos.
  useEffect(() => {
    if (phase.kind !== 'redeemed') return;
    const timer = window.setTimeout(onReset, 3000);
    return () => window.clearTimeout(timer);
  }, [phase.kind, onReset]);

  useEffect(() => {
    if (phase.kind === 'idle' || phase.kind === 'redeeming' || phase.kind === 'checking') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onReset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase.kind, onReset]);

  if (phase.kind === 'idle') return null;

  const handleRedeem = () => {
    const cents = parseEurosToCents(importe);
    if (cents === undefined) {
      setImporteError('Escribe un importe como 2,50 o déjalo vacío.');
      return;
    }
    onRedeem(cents);
  };

  const shell = (bg: string, children: ReactNode, label: string) => (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={label}
      className={`fixed inset-0 z-[200] flex flex-col overflow-y-auto ${bg} px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+32px)] text-white animate-fade-in`}
    >
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col">{children}</div>
    </div>
  );

  const bigButton = `flex min-h-16 w-full items-center justify-center gap-2 rounded-r-md text-lg font-bold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60`;

  if (phase.kind === 'checking') {
    return shell(
      'bg-carbon/95',
      <div className="flex flex-1 flex-col items-center justify-center gap-4" role="status">
        <Loader2 size={44} className="animate-spin text-piedra" aria-hidden="true" />
        <p className="text-lg">Comprobando {phase.codigo}…</p>
      </div>,
      'Comprobando ticket'
    );
  }

  if (phase.kind === 'invalid') {
    return shell(
      'bg-vino',
      <>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <XCircle size={84} aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.28em] opacity-80">No válido</p>
          <p className="mt-3 font-display text-[2rem] font-semibold leading-tight" aria-live="assertive">
            {phase.text}
          </p>
          {phase.detalle && <p className="mt-2 text-lg opacity-90">{phase.detalle}</p>}
          {(phase.promo || phase.codigo) && (
            <p className="mt-6 text-base opacity-80">
              {phase.promo}
              {phase.promo && phase.codigo ? ' · ' : ''}
              <span className="font-bold tracking-[0.15em]">{phase.codigo}</span>
            </p>
          )}
        </div>
        <button ref={mainButtonRef} type="button" onClick={onReset} className={`${bigButton} mt-8 bg-white text-vino`}>
          <ScanLine size={22} aria-hidden="true" /> Escanear otro
        </button>
      </>,
      'Ticket no válido'
    );
  }

  if (phase.kind === 'redeemed') {
    return shell(
      VERDE,
      <>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <CheckCircle2 size={96} aria-hidden="true" />
          <p className="mt-4 font-display text-[3rem] font-semibold leading-none" aria-live="assertive">
            ¡Canjeado!
          </p>
          <p className="mt-4 text-xl">{phase.lookup.promo_nombre}</p>
          {phase.lookup.socio_nombre && <p className="mt-1 text-lg opacity-90">Socio: {phase.lookup.socio_nombre}</p>}
          <p className="mt-6 text-sm opacity-75">Volviendo al escáner…</p>
        </div>
        <button ref={mainButtonRef} type="button" onClick={onReset} className={`${bigButton} mt-8 bg-white text-[#1f4a2b]`}>
          Siguiente
        </button>
      </>,
      'Ticket canjeado'
    );
  }

  // valid / redeeming
  const lookup = phase.lookup;
  const redeeming = phase.kind === 'redeeming';
  return shell(
    VERDE,
    <>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <CheckCircle2 size={72} aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold uppercase tracking-[0.28em] opacity-85" aria-live="assertive">
          Ticket válido
        </p>
        <p className="mt-3 font-display text-[2.3rem] font-semibold leading-tight">{lookup.promo_nombre}</p>
        {lookup.promo_descuento && <p className="mt-2 text-base opacity-90">{lookup.promo_descuento}</p>}
        <dl className="mt-6 grid w-full grid-cols-2 gap-3 text-left">
          <div className="rounded-r-md bg-white/10 px-4 py-3">
            <dt className="text-xs uppercase tracking-wider opacity-75">Socio</dt>
            <dd className="text-lg font-semibold">{lookup.socio_nombre ?? '—'}</dd>
          </div>
          <div className="rounded-r-md bg-white/10 px-4 py-3">
            <dt className="text-xs uppercase tracking-wider opacity-75">Caduca</dt>
            <dd className="text-lg font-semibold">{lookup.expires_at ? formatTime(lookup.expires_at) : '—'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm font-bold tracking-[0.15em] opacity-80">{lookup.codigo}</p>

        <div className="mt-6 w-full text-left">
          <label htmlFor="importe" className="text-sm font-semibold opacity-90">
            Importe descontado (opcional)
          </label>
          <div className="mt-1 flex items-center overflow-hidden rounded-r-sm bg-white text-carbon">
            <input
              id="importe"
              value={importe}
              onChange={(e) => {
                setImporte(e.target.value);
                setImporteError(null);
              }}
              inputMode="decimal"
              placeholder="0,00"
              disabled={redeeming}
              aria-invalid={importeError ? true : undefined}
              aria-describedby={importeError ? 'importe-error' : undefined}
              className="min-w-0 flex-1 px-3 py-3 text-lg outline-none"
            />
            <span className="px-3 text-lg font-semibold text-carbon/60" aria-hidden="true">
              €
            </span>
          </div>
          {importeError && (
            <p id="importe-error" className="mt-1 text-sm font-semibold text-piedra-suave">
              {importeError}
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <button
          ref={mainButtonRef}
          type="button"
          onClick={handleRedeem}
          disabled={redeeming}
          aria-busy={redeeming}
          className={`${bigButton} bg-white text-[#1f4a2b] disabled:opacity-80`}
        >
          {redeeming ? (
            <>
              <Loader2 size={22} className="animate-spin" aria-hidden="true" /> Canjeando…
            </>
          ) : (
            'CANJEAR'
          )}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={redeeming}
          className={`${bigButton} min-h-14 border-2 border-white/70 text-base font-semibold text-white`}
        >
          Cancelar
        </button>
      </div>
    </>,
    'Ticket válido'
  );
}
