import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Ban, ChevronRight, Loader2, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import type { AdminUser } from '@/lib/admin';
import {
  fetchTicketEvents,
  reopenTicket,
  searchTickets,
  voidTicket,
  type TicketEvent,
} from '@/lib/adminTickets';
import { formatDateTime, parseScannedCode, ticketDisplayState, type Ticket, type TicketDisplayState } from '@/lib/tickets';

type EstadoFiltro = Ticket['estado'] | 'todos';

/** Minúsculas y sin tildes. */
function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function euros(cents: number | null) {
  if (cents === null) return null;
  return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

const ESTADOS: Record<TicketDisplayState, { label: string; className: string }> = {
  disponible: { label: 'Disponible', className: 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#1f4a2b]' },
  promo_desactivada: { label: 'Disponible', className: 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#1f4a2b]' },
  canjeado: { label: 'Canjeado', className: 'border-vino bg-vino/10 text-vino' },
  caducado: { label: 'Caducado', className: 'border-carbon/20 text-carbon/55' },
  anulado: { label: 'Anulado', className: 'border-carbon/20 text-carbon/55 line-through' },
};

function EstadoBadge({ ticket }: { ticket: Ticket }) {
  const { label, className } = ESTADOS[ticketDisplayState(ticket, undefined, Date.now())];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${className}`}>
      {label}
    </span>
  );
}

/** Pestaña "Tickets": buscar, ver el registro de cada ticket y anular o reabrir. */
export function TicketsSection({ users }: { users: AdminUser[] }) {
  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('todos');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const personName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const u = usersById.get(id);
      return u ? u.nombre || u.email : 'Cuenta borrada';
    },
    [usersById]
  );

  const runSearch = useCallback(
    async (q: string, est: EstadoFiltro) => {
      setLoading(true);
      setError(null);
      setInfo(null);
      const text = q.trim();
      const codigo = text ? parseScannedCode(text) : null;
      let userIds: string[] | null = null;
      if (text && !codigo) {
        const needle = normalize(text);
        userIds = users.filter((u) => normalize(`${u.nombre ?? ''} ${u.email}`).includes(needle)).map((u) => u.id);
        if (userIds.length === 0) {
          setTickets([]);
          setInfo(`Ningún socio coincide con «${text}».`);
          setLoading(false);
          return;
        }
      }
      const result = await searchTickets({ codigo, userIds, estado: est, limit: text ? 200 : 50 });
      setTickets(result.tickets);
      setError(result.error);
      setLoading(false);
    },
    [users]
  );

  useEffect(() => {
    runSearch('', 'todos');
    // Solo al abrir la pestaña; luego busca el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(query, estado);
  };

  const onChanged = (updated: Ticket) => {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelected(updated);
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-r-lg border border-piedra/50 bg-white/80 p-4 shadow-sm sm:p-6"
        role="search"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label htmlFor="ticket-search" className="mb-1 block text-xs font-semibold text-carbon/80">
              Código (ALA-7K3P) o nombre o email del socio
            </label>
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-carbon/45" aria-hidden="true" />
              <input
                id="ticket-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej.: 7K3P, Lucía, @gmail…"
                className="w-full rounded-r-sm border border-carbon/25 bg-white py-2.5 pl-9 pr-3 font-primary text-base text-carbon outline-none transition-colors placeholder:text-carbon/40 focus:border-vino focus:ring-1 focus:ring-vino/30 sm:text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ticket-estado" className="mb-1 block text-xs font-semibold text-carbon/80">
              Estado
            </label>
            <select
              id="ticket-estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoFiltro)}
              className="w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 font-primary text-base text-carbon outline-none focus:border-vino focus:ring-1 focus:ring-vino/30 sm:text-sm lg:w-auto"
            >
              <option value="todos">Todos</option>
              <option value="disponible">Disponibles</option>
              <option value="canjeado">Canjeados</option>
              <option value="caducado">Caducados</option>
              <option value="anulado">Anulados</option>
            </select>
          </div>
          <button type="submit" disabled={loading} className={`btn-vino min-h-11 disabled:opacity-70 ${focusRing}`}>
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
            Buscar
          </button>
        </div>
        <p className="mt-3 text-xs text-carbon/60">
          Sin búsqueda se muestran los 50 tickets más recientes. Los disponibles cuya hora ya pasó se ven como caducados.
        </p>
      </form>

      <section aria-label="Tickets" className="mt-6" aria-live="polite">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
            <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
            Buscando tickets…
          </div>
        ) : error ? (
          <div className="space-y-4">
            <Notice kind="error">{error}</Notice>
            <button type="button" onClick={() => runSearch(query, estado)} className={`btn-outline-vino ${focusRing}`}>
              <RefreshCw size={16} aria-hidden="true" /> Reintentar
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
            <p className="font-display text-2xl font-semibold text-vino">{info ? 'Sin resultados' : 'No hay tickets'}</p>
            <p className="mt-1 text-sm text-carbon/70">{info ?? 'Cuando los socios pidan tickets, aparecerán aquí.'}</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-carbon/70">{tickets.length} tickets</p>
            {/* Escritorio */}
            <div className="hidden overflow-x-auto rounded-r-lg border border-piedra/50 bg-white shadow-sm md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Tickets</caption>
                <thead className="bg-piedra-suave/70 text-xs uppercase tracking-wider text-carbon/70">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Código</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Promo</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Socio</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Creado</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Canje</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Detalle</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/10">
                  {tickets.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-marfil">
                      <td className="whitespace-nowrap px-4 py-3 font-bold tracking-wider">{t.codigo}</td>
                      <td className="px-4 py-3">{t.promo_nombre}</td>
                      <td className="px-4 py-3">{personName(t.user_id) ?? '—'}</td>
                      <td className="px-4 py-3"><EstadoBadge ticket={t} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-carbon/75">{formatDateTime(t.created_at)}</td>
                      <td className="px-4 py-3 text-carbon/75">
                        {t.canjeado_at ? (
                          <>
                            <div className="whitespace-nowrap">{formatDateTime(t.canjeado_at)}</div>
                            <div className="text-xs text-carbon/55">
                              {personName(t.canjeado_por) ?? ''}
                              {t.importe_descuento_centimos !== null ? ` · ${euros(t.importe_descuento_centimos)}` : ''}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(t)}
                          className={`inline-flex items-center gap-1 rounded-r-sm text-sm font-semibold text-vino hover:underline ${focusRing}`}
                        >
                          Ver <ChevronRight size={15} aria-hidden="true" />
                          <span className="sr-only">el ticket {t.codigo}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Móvil */}
            <ul className="space-y-3 md:hidden">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(t)}
                    className={`w-full rounded-r-md border border-piedra/40 bg-white p-4 text-left shadow-sm ${focusRing}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold tracking-wider">{t.codigo}</span>
                      <EstadoBadge ticket={t} />
                    </div>
                    <p className="mt-1 font-semibold text-carbon">{t.promo_nombre}</p>
                    <p className="text-sm text-carbon/70">{personName(t.user_id) ?? '—'}</p>
                    <p className="mt-1 text-xs text-carbon/55">Creado el {formatDateTime(t.created_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <TicketDetail ticket={selected} personName={personName} onClose={() => setSelected(null)} onChanged={onChanged} />
    </>
  );
}

// ---------------------------------------------------------------------
// Detalle: registro de eventos, anular y reabrir
// ---------------------------------------------------------------------

const EVENTOS: Record<TicketEvent['tipo'], string> = {
  creado: 'Creado',
  canjeado: 'Canjeado',
  caducado: 'Caducado',
  anulado: 'Anulado',
  reabierto: 'Reabierto',
};

function eventDetail(ev: TicketEvent): string | null {
  const d = ev.detalle ?? {};
  if (typeof d.motivo === 'string') return `Motivo: ${d.motivo}`;
  if (typeof d.importe_descuento_centimos === 'number') return `Importe descontado: ${euros(d.importe_descuento_centimos)}`;
  return null;
}

function TicketDetail({
  ticket,
  personName,
  onClose,
  onChanged,
}: {
  ticket: Ticket | null;
  personName: (id: string | null) => string | null;
  onClose: () => void;
  onChanged: (ticket: Ticket) => void;
}) {
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [action, setAction] = useState<'anular' | 'reabrir' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const ticketId = ticket?.id;
  const loadEvents = useCallback(async () => {
    if (!ticketId) return;
    setLoadingEvents(true);
    const { events: evs } = await fetchTicketEvents(ticketId);
    setEvents(evs);
    setLoadingEvents(false);
  }, [ticketId]);

  useEffect(() => {
    setAction(null);
    setMotivo('');
    setResult(null);
    loadEvents();
  }, [loadEvents]);

  if (!ticket) return null;

  const state = ticketDisplayState(ticket, undefined, Date.now());
  const vigente = new Date(ticket.expires_at).getTime() > Date.now();
  const puedeAnular = ticket.estado === 'disponible' && vigente;
  const puedeReabrir = ticket.estado === 'canjeado' && vigente;
  const canjeadoPor = ticket.canjeado_por;

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setResult({ kind: 'error', text: 'Escribe el motivo.' });
      return;
    }
    setSaving(true);
    setResult(null);
    const res = action === 'anular' ? await voidTicket(ticket.id, motivo.trim()) : await reopenTicket(ticket.id, motivo.trim());
    setSaving(false);
    if (res.ticket) {
      setResult({ kind: 'success', text: action === 'anular' ? 'Ticket anulado.' : 'Canje deshecho: el ticket vuelve a estar disponible.' });
      setAction(null);
      setMotivo('');
      onChanged(res.ticket);
      loadEvents();
    } else {
      setResult({ kind: 'error', text: res.error ?? 'No se ha podido completar.' });
    }
  };

  return (
    <Modal open title={`Ticket ${ticket.codigo}`} onClose={onClose} busy={saving} maxWidth="560px">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${ESTADOS[state].className}`}>
          {ESTADOS[state].label}
        </span>
        <span className="text-sm text-carbon/70">{ticket.promo_nombre}</span>
      </div>
      <p className="mt-2 text-sm text-carbon/70">{ticket.promo_descuento}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-carbon/55">Socio</dt>
          <dd>{personName(ticket.user_id) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-carbon/55">Caduca</dt>
          <dd>{formatDateTime(ticket.expires_at)}</dd>
        </div>
        {ticket.canjeado_at && (
          <>
            <div>
              <dt className="text-xs font-semibold text-carbon/55">Canjeado</dt>
              <dd>
                {formatDateTime(ticket.canjeado_at)}
                {canjeadoPor ? ` · ${personName(canjeadoPor)}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-carbon/55">Importe</dt>
              <dd>{euros(ticket.importe_descuento_centimos) ?? '—'}</dd>
            </div>
          </>
        )}
        {ticket.motivo_anulacion && (
          <div className="col-span-2">
            <dt className="text-xs font-semibold text-carbon/55">Motivo de anulación</dt>
            <dd>{ticket.motivo_anulacion}</dd>
          </div>
        )}
      </dl>

      <h3 className="mt-6 text-sm font-semibold text-carbon">Registro</h3>
      {loadingEvents ? (
        <p className="mt-2 text-sm text-carbon/60" role="status">
          Cargando…
        </p>
      ) : events.length === 0 ? (
        <p className="mt-2 text-sm text-carbon/60">Sin eventos.</p>
      ) : (
        <ol className="mt-2 space-y-2 border-l-2 border-piedra/60 pl-4">
          {events.map((ev) => (
            <li key={ev.id} className="text-sm">
              <span className="font-semibold text-carbon">{EVENTOS[ev.tipo]}</span>{' '}
              <span className="text-carbon/60">· {formatDateTime(ev.at)}</span>
              {ev.actor && <span className="text-carbon/60"> · {personName(ev.actor)}</span>}
              {eventDetail(ev) && <div className="text-xs text-carbon/60">{eventDetail(ev)}</div>}
            </li>
          ))}
        </ol>
      )}

      {result && (
        <div className="mt-5">
          <Notice kind={result.kind}>{result.text}</Notice>
        </div>
      )}

      {action ? (
        <form onSubmit={confirmar} className="mt-6 space-y-3 rounded-r-md border border-vino/30 bg-vino/5 p-4">
          <label htmlFor="motivo" className="block text-sm font-semibold text-carbon">
            {action === 'anular' ? 'Motivo de la anulación' : 'Motivo para deshacer el canje'}
          </label>
          <textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder={action === 'anular' ? 'Ej.: pedido por error' : 'Ej.: el camarero se equivocó de ticket'}
            className="w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 font-primary text-base outline-none focus:border-vino focus:ring-1 focus:ring-vino/30 sm:text-sm"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={() => setAction(null)} disabled={saving} className={`btn-outline-vino flex-1 ${focusRing}`}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={`btn-vino flex-1 disabled:opacity-70 ${focusRing}`}>
              {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {action === 'anular' ? 'Confirmar anulación' : 'Confirmar y reabrir'}
            </button>
          </div>
        </form>
      ) : (
        (puedeAnular || puedeReabrir) && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {puedeAnular && (
              <button type="button" onClick={() => setAction('anular')} className={`btn-outline-vino flex-1 ${focusRing}`}>
                <Ban size={16} aria-hidden="true" /> Anular ticket
              </button>
            )}
            {puedeReabrir && (
              <button type="button" onClick={() => setAction('reabrir')} className={`btn-outline-vino flex-1 ${focusRing}`}>
                <RotateCcw size={16} aria-hidden="true" /> Deshacer canje
              </button>
            )}
          </div>
        )
      )}
    </Modal>
  );
}
