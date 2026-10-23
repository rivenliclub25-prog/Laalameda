import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, CheckCircle2, Clock3, Loader2, RefreshCw, Ticket as TicketIcon, X } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { Notice, focusRing } from '@/components/club/FormControls';
import { useAuth } from '@/auth/AuthContext';
import { getHashParams } from '@/lib/router';
import {
  fetchMyTickets,
  formatCountdown,
  formatDateTime,
  formatTime,
  subscribeMyTickets,
  ticketDisplayState,
  ticketQrUrl,
  usePromoStates,
  type Ticket,
  type TicketDisplayState,
} from '@/lib/tickets';

export function MisTicketsPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { states: promoStates } = usePromoStates();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [celebrate, setCelebrate] = useState<Ticket | null>(null);
  const [highlight] = useState(() => {
    const params = getHashParams();
    return { ticketId: params.get('t'), promoId: params.get('promo') };
  });
  const ticketsRef = useRef<Ticket[]>([]);
  ticketsRef.current = tickets;

  // Si alguno de los tickets que llegan estaba disponible y ahora está canjeado, se celebra.
  // Sirve tanto para el tiempo real como para la comprobación periódica (y no se repite).
  const celebrateIfRedeemed = useCallback((incoming: Ticket[]) => {
    const redeemed = incoming.find((t) => {
      const before = ticketsRef.current.find((x) => x.id === t.id);
      return before?.estado === 'disponible' && t.estado === 'canjeado';
    });
    if (redeemed) {
      setCelebrate(redeemed);
      navigator.vibrate?.([90, 50, 90]);
    }
  }, []);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!userId) return;
      if (!silent) setError(null);
      const result = await fetchMyTickets(userId);
      if (result.error) {
        // En las comprobaciones de fondo, un fallo puntual no borra la lista.
        if (!silent) {
          setError(result.error);
          setLoading(false);
        }
        return;
      }
      celebrateIfRedeemed(result.tickets);
      ticketsRef.current = result.tickets;
      setTickets(result.tickets);
      setLoading(false);
    },
    [userId, celebrateIfRedeemed]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Tiempo real: cuando el camarero canjea, el ticket cambia aquí al instante.
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeMyTickets(userId, (changed) => {
      celebrateIfRedeemed([changed]);
      const prev = ticketsRef.current;
      const exists = prev.some((t) => t.id === changed.id);
      const next = (exists ? prev.map((t) => (t.id === changed.id ? changed : t)) : [changed, ...prev]).sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
      ticketsRef.current = next;
      setTickets(next);
    });
    // Si la conexión en tiempo real se cortó (móvil en segundo plano), se recarga al volver.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, load, celebrateIfRedeemed]);

  const withState = useMemo(
    () =>
      tickets.map((ticket) => ({
        ticket,
        state: ticketDisplayState(ticket, promoStates?.get(ticket.promo_id)?.activa, now),
      })),
    [tickets, promoStates, now]
  );
  const available = withState.filter((x) => x.state === 'disponible' || x.state === 'promo_desactivada');
  const history = withState.filter((x) => x.state !== 'disponible' && x.state !== 'promo_desactivada');

  // Cuenta atrás: solo hace falta refrescar cada segundo si hay tickets disponibles.
  useEffect(() => {
    if (available.length === 0) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [available.length]);

  // Respaldo del tiempo real: mientras haya un ticket por usar y la pantalla esté a la vista, se
  // comprueba cada 5 s. Si la conexión en tiempo real falla, el canje aparece igualmente sin recargar.
  const hasUsable = available.some((x) => x.state === 'disponible');
  useEffect(() => {
    if (!hasUsable) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [hasUsable, load]);

  // Al llegar desde "Obtener ticket", baja hasta ese ticket.
  const highlightedId =
    highlight.ticketId ??
    available.find((x) => x.ticket.promo_id === highlight.promoId)?.ticket.id ??
    null;
  useEffect(() => {
    if (loading || !highlightedId) return;
    document.getElementById(`ticket-${highlightedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, highlightedId]);

  return (
    <PageShell>
      <div className="mx-auto max-w-[560px]">
        <header className="animate-fade-up text-center" style={{ opacity: 0 }}>
          <div className="eyebrow text-vino">Club La Alameda</div>
          <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[1.05] text-vino sm:text-[3rem]">
            Mis tickets
          </h1>
          <div className="divider-gold my-5" />
          <p className="text-sm text-carbon/70">
            Enseña el código o el QR en la barra. Cada ticket se canjea una sola vez.
          </p>
        </header>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
            <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
            Cargando tus tickets…
          </div>
        ) : error ? (
          <div className="mt-8 space-y-4">
            <Notice kind="error">{error}</Notice>
            <button type="button" onClick={() => load()} className={`btn-outline-vino ${focusRing}`}>
              <RefreshCw size={16} aria-hidden="true" /> Reintentar
            </button>
          </div>
        ) : (
          <>
            <section aria-labelledby="disponibles-title" className="mt-8">
              <h2 id="disponibles-title" className="font-display text-2xl font-semibold text-vino">
                Disponibles
              </h2>
              {available.length === 0 ? (
                <div className="mt-4 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-10 text-center">
                  <TicketIcon size={30} className="mx-auto text-piedra" aria-hidden="true" />
                  <p className="mt-3 font-display text-xl font-semibold text-vino">
                    {tickets.length === 0 ? 'Aún no tienes tickets' : 'No tienes tickets por usar'}
                  </p>
                  <p className="mt-1 text-sm text-carbon/70">Elige una promo del club y pulsa «Obtener ticket».</p>
                  <a href="#promos" className={`btn-vino mt-5 ${focusRing}`}>
                    Ver promociones <ArrowRight size={16} aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <ul className="mt-4 space-y-5">
                  {available.map(({ ticket, state }) => (
                    <li key={ticket.id}>
                      <AvailableTicket
                        ticket={ticket}
                        state={state}
                        now={now}
                        highlighted={ticket.id === highlightedId}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {history.length > 0 && (
              <section aria-labelledby="historial-title" className="mt-12">
                <h2 id="historial-title" className="font-display text-2xl font-semibold text-vino">
                  Historial
                </h2>
                <ul className="mt-4 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white/80 shadow-sm">
                  {history.map(({ ticket, state }) => (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-carbon">{ticket.promo_nombre}</p>
                        <p className="text-xs text-carbon/60">
                          <span className="font-semibold tracking-wider">{ticket.codigo}</span> ·{' '}
                          {historyDate(ticket, state)}
                        </p>
                      </div>
                      <StateBadge state={state} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {celebrate && <RedeemedOverlay ticket={celebrate} onClose={() => setCelebrate(null)} />}
    </PageShell>
  );
}

function historyDate(ticket: Ticket, state: TicketDisplayState) {
  if (state === 'canjeado') return `Canjeado el ${formatDateTime(ticket.canjeado_at)}`;
  if (state === 'anulado') return `Anulado el ${formatDateTime(ticket.anulado_at)}`;
  return `Caducó el ${formatDateTime(ticket.expires_at)}`;
}

const badgeStyles: Record<TicketDisplayState, { label: string; className: string }> = {
  disponible: { label: 'Disponible', className: 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#1f4a2b]' },
  promo_desactivada: { label: 'Promo desactivada', className: 'border-carbon/25 bg-carbon/5 text-carbon/70' },
  canjeado: { label: 'Canjeado', className: 'border-vino bg-vino/10 text-vino' },
  caducado: { label: 'Caducado', className: 'border-carbon/20 text-carbon/55' },
  anulado: { label: 'Anulado', className: 'border-carbon/20 text-carbon/55 line-through' },
};

function StateBadge({ state }: { state: TicketDisplayState }) {
  const { label, className } = badgeStyles[state];
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function AvailableTicket({
  ticket,
  state,
  now,
  highlighted,
}: {
  ticket: Ticket;
  state: TicketDisplayState;
  now: number;
  highlighted: boolean;
}) {
  const disabled = state === 'promo_desactivada';
  const remaining = new Date(ticket.expires_at).getTime() - now;

  return (
    <article
      id={`ticket-${ticket.id}`}
      aria-label={`Ticket ${ticket.codigo} de ${ticket.promo_nombre}`}
      className={`animate-scale-in overflow-hidden rounded-r-lg border bg-white shadow-md ${
        highlighted ? 'border-vino ring-2 ring-vino ring-offset-2 ring-offset-marfil' : 'border-piedra/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3 bg-piedra-suave/60 px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-[1.45rem] font-semibold leading-tight text-vino">{ticket.promo_nombre}</h3>
          <p className="mt-1 text-sm text-carbon/75">{ticket.promo_descuento}</p>
        </div>
        <StateBadge state={state} />
      </div>

      <div className={`flex flex-col items-center px-5 pb-6 pt-5 ${disabled ? 'opacity-40 grayscale' : ''}`}>
        <div className="rounded-r-md border border-carbon/10 bg-white p-3">
          <QRCodeSVG
            value={ticketQrUrl(ticket.codigo)}
            size={220}
            level="M"
            fgColor="#1B1815"
            bgColor="#FFFFFF"
            title={`Código QR del ticket ${ticket.codigo}`}
            className="h-auto w-[min(220px,60vw)]"
          />
        </div>
        <p className="mt-4 font-primary text-[2rem] font-bold tracking-[0.18em] text-carbon">
          {ticket.codigo}
        </p>
      </div>

      <div className="border-t border-carbon/10 px-5 py-3 text-center text-sm" aria-live="off">
        {disabled ? (
          <span className="text-carbon/70">El bar ha desactivado esta promo por ahora.</span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 font-semibold ${remaining < 15 * 60_000 ? 'text-vino' : 'text-carbon/80'}`}>
            <Clock3 size={15} aria-hidden="true" />
            Caduca en {formatCountdown(remaining)}
            <span className="font-normal text-carbon/55">(a las {formatTime(ticket.expires_at)})</span>
          </span>
        )}
      </div>
    </article>
  );
}

/** Confirmación a pantalla completa cuando el camarero canjea el ticket. */
function RedeemedOverlay({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const timer = window.setTimeout(onClose, 8000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-carbon/80 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="canjeado-title"
        className="animate-scale-in relative w-full max-w-[380px] rounded-r-lg bg-marfil p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}
        >
          <X size={20} />
        </button>
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#2f6b3f] text-white">
          <CheckCircle2 size={44} aria-hidden="true" />
        </span>
        <h2 id="canjeado-title" className="mt-5 font-display text-[2.2rem] font-semibold leading-tight text-vino">
          ¡Canjeado!
        </h2>
        <p className="mt-2 text-carbon/80">
          {ticket.promo_nombre}. Disfrútalo 🍻
        </p>
        <button ref={closeRef} type="button" onClick={onClose} className={`btn-vino mt-6 w-full py-3 ${focusRing}`}>
          Genial
        </button>
      </div>
    </div>
  );
}
