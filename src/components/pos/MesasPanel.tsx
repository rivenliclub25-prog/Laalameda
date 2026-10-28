import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRightLeft, Ban, Check, CheckCheck, Loader2, Minus, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { Notice, SubmitButton, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { ProductPicker } from '@/components/pos/ProductPicker';
import { VentaHecha } from '@/components/pos/VentaHecha';
import { playFeedback } from '@/lib/feedback';
import { subscribeChanges } from '@/lib/realtime';
import type { MenuItem, MenuTab } from '@/lib/catalog';
import {
  METODOS,
  abrirMesa,
  anadirLineas,
  anularLinea,
  cambiarMesa,
  cancelarCuenta,
  cobrarCuenta,
  fetchCuentasAbiertas,
  fetchMesas,
  formatEuros,
  newRequestId,
  servirLineas,
  aceptarRonda,
  rechazarRonda,
  rondasPendientes,
  totalCuenta,
  type CuentaMesa,
  type LineaCuenta,
  type Mesa,
  type Metodo,
  type VentaResultado,
} from '@/lib/pos';

const POLL_MS = 10_000;

function minutosDesde(iso: string, now: number) {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

const ESTADO_LINEA: Record<LineaCuenta['estado'], { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'border-piedra bg-piedra/15 text-carbon' },
  aceptada: { label: 'Por servir', className: 'border-vino/40 bg-vino/10 text-vino' },
  servida: { label: 'Servida', className: 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#1f4a2b]' },
  anulada: { label: 'Anulada', className: 'border-carbon/20 text-carbon/50' },
};

/** Mesas del TPV: cuadrícula de mesas y la cuenta de la mesa elegida. */
export function MesasPanel({ tabs, catalogLoading, soundOn }: { tabs: MenuTab[]; catalogLoading: boolean; soundOn: boolean }) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cuentas, setCuentas] = useState<CuentaMesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  // Rondas pendientes ya conocidas: si aparece una nueva, suena el aviso (no en la primera carga).
  const knownRondas = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const [m, c] = await Promise.all([fetchMesas(), fetchCuentasAbiertas()]);
    setMesas(m.mesas);
    setCuentas(c.cuentas);
    setError(m.error ?? c.error);
    setLoading(false);
    setNow(Date.now());

    const pendientes = new Set(c.cuentas.flatMap((cu) => rondasPendientes(cu).map((r) => r.ronda)));
    const nuevas = knownRondas.current ? [...pendientes].filter((r) => !knownRondas.current!.has(r)) : [];
    if (nuevas.length > 0) {
      playFeedback('ok', soundRef.current);
      navigator.vibrate?.([120, 60, 120, 60, 120]);
    }
    knownRondas.current = pendientes;
  }, []);

  // Tiempo real (rondas de los socios, cambios de otros camareros). Una ronda llega como varias
  // líneas: se agrupan en una sola recarga. Respaldo: cada 10 s y al volver a la pestaña.
  useEffect(() => {
    let timer: number | undefined;
    const scheduleLoad = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 300);
    };
    load();
    const unsubscribe = subscribeChanges('pos-mesas', [{ table: 'orders' }, { table: 'order_items' }], scheduleLoad);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const cuentaPorMesa = useMemo(() => new Map(cuentas.map((c) => [c.mesa_id, c])), [cuentas]);
  const visibles = mesas.filter((m) => m.activa || cuentaPorMesa.has(m.id));
  const selected = mesas.find((m) => m.id === selectedId) ?? null;

  if (selected) {
    return (
      <CuentaView
        mesa={selected}
        cuenta={cuentaPorMesa.get(selected.id) ?? null}
        mesasLibres={mesas.filter((m) => m.activa && !cuentaPorMesa.has(m.id))}
        tabs={tabs}
        catalogLoading={catalogLoading}
        soundOn={soundOn}
        now={now}
        onBack={() => setSelectedId(null)}
        onChanged={load}
        onMoved={(mesaId) => {
          setSelectedId(mesaId);
          load();
        }}
      />
    );
  }

  return (
    <section aria-label="Mesas">
      <div className="flex items-center justify-between">
        <p className="text-sm text-carbon/65">Toca una mesa para ver o abrir su cuenta.</p>
        <button type="button" onClick={load} aria-label="Actualizar mesas" className={`flex h-10 w-10 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}>
          <RefreshCw size={17} />
        </button>
      </div>
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          <span className="sr-only">Cargando mesas…</span>
        </div>
      ) : visibles.length === 0 ? (
        <div className="mt-4 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
          <p className="font-display text-2xl font-semibold text-vino">No hay mesas</p>
          <p className="mt-1 text-sm text-carbon/70">Un admin puede crearlas en Panel → Mesas.</p>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibles.map((m) => {
            const c = cuentaPorMesa.get(m.id);
            const porServir = c?.order_items.filter((l) => l.estado === 'aceptada').length ?? 0;
            const nuevas = c ? rondasPendientes(c).length : 0;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`relative flex min-h-[112px] w-full flex-col justify-between rounded-r-md border p-3 text-left shadow-sm transition-all active:scale-[0.98] ${focusRing} ${
                    c ? 'border-vino bg-vino text-white' : 'border-piedra/50 bg-white text-carbon hover:border-vino'
                  } ${nuevas > 0 ? 'ring-4 ring-piedra ring-offset-2 ring-offset-marfil' : ''}`}
                  aria-label={nuevas > 0 ? `${m.nombre}: ${nuevas === 1 ? 'una ronda nueva' : `${nuevas} rondas nuevas`}` : undefined}
                >
                  {nuevas > 0 && (
                    <span className="absolute -right-2 -top-2 animate-pulse rounded-full bg-piedra px-2.5 py-1 text-xs font-bold text-carbon shadow">
                      {nuevas === 1 ? 'Nueva ronda' : `${nuevas} rondas`}
                    </span>
                  )}
                  <span className="font-display text-xl font-semibold leading-tight">{m.nombre}</span>
                  {c ? (
                    <span className="mt-2 text-sm">
                      <span className="block text-lg font-bold tabular-nums">{formatEuros(totalCuenta(c))}</span>
                      <span className="opacity-85">
                        {minutosDesde(c.created_at, now)}
                        {porServir > 0 ? ` · ${porServir} por servir` : ''}
                      </span>
                    </span>
                  ) : (
                    <span className="mt-2 text-sm text-carbon/55">{m.activa ? 'Libre' : 'Desactivada'}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Cuenta de una mesa
// ---------------------------------------------------------------------

function CuentaView({
  mesa,
  cuenta,
  mesasLibres,
  tabs,
  catalogLoading,
  soundOn,
  now,
  onBack,
  onChanged,
  onMoved,
}: {
  mesa: Mesa;
  cuenta: CuentaMesa | null;
  mesasLibres: Mesa[];
  tabs: MenuTab[];
  catalogLoading: boolean;
  soundOn: boolean;
  now: number;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
  onMoved: (mesaId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [adding, setAdding] = useState(false);
  const [anulando, setAnulando] = useState<LineaCuenta | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  const [done, setDone] = useState<{ venta: VentaResultado; clientTotal: number } | null>(null);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Las líneas pendientes (rondas de socios sin aceptar) van aparte, arriba.
  const rondas = cuenta ? rondasPendientes(cuenta) : [];
  const lineas = (cuenta?.order_items ?? []).filter((l) => l.estado !== 'pendiente');
  const total = cuenta ? totalCuenta(cuenta) : 0;
  const porServir = lineas.filter((l) => l.estado === 'aceptada');
  const haySevidas = lineas.some((l) => l.estado === 'servida');
  const activas = lineas.filter((l) => l.estado !== 'anulada');

  /** Ejecuta una acción, muestra su error y refresca la mesa. */
  const run = async (action: () => Promise<{ error: string | null }>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const { error: err } = await action();
    await onChanged();
    busyRef.current = false;
    setBusy(false);
    if (err) {
      setError(err);
      playFeedback('error', soundOn);
      return false;
    }
    return true;
  };

  const cobrar = async () => {
    if (!cuenta || !metodo || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const clientTotal = total;
    const { data, error: err } = await cobrarCuenta(cuenta.id, metodo);
    busyRef.current = false;
    setBusy(false);
    if (!data) {
      setError(err);
      playFeedback('error', soundOn);
      await onChanged();
      return;
    }
    playFeedback('ok', soundOn);
    setDone({ venta: data, clientTotal });
  };

  const closeDone = useCallback(() => {
    setDone(null);
    onChanged();
    onBack();
  }, [onBack, onChanged]);

  return (
    <section aria-labelledby="cuenta-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={`inline-flex items-center gap-2 rounded-r-sm text-sm font-semibold text-carbon/70 hover:text-vino ${focusRing}`}>
          <ArrowLeft size={18} aria-hidden="true" /> Mesas
        </button>
        {cuenta && <span className="text-xs text-carbon/55">Abierta hace {minutosDesde(cuenta.created_at, now)}</span>}
      </div>

      <div className="mt-3 rounded-r-lg border border-piedra/50 bg-white shadow-md">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon/10 px-4 py-3">
          <h2 id="cuenta-title" className="font-display text-2xl font-semibold text-vino">{mesa.nombre}</h2>
          <span className="font-display text-3xl font-bold text-vino tabular-nums">{formatEuros(total)}</span>
        </header>

        {/* Rondas pedidas por socios desde la mesa, pendientes de aceptar */}
        {rondas.length > 0 && cuenta && (
          <div className="space-y-3 border-b border-piedra/60 bg-piedra-suave/50 px-4 py-3">
            {rondas.map((r) => (
              <div key={r.ronda} className="rounded-r-md border-2 border-piedra bg-white p-3">
                <p className="text-sm font-semibold text-carbon">
                  Ronda de {r.nombre ?? 'un socio'} · hace {minutosDesde(r.at, now)}
                </p>
                <ul className="mt-1.5 space-y-0.5 text-sm">
                  {r.lineas.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span>
                        {l.cantidad} × {l.nombre}
                        {l.notas && <span className="ml-1 italic text-carbon/60">«{l.notas}»</span>}
                      </span>
                      <span className="tabular-nums text-carbon/70">{formatEuros(l.precio_unitario_centimos * l.cantidad)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run(() => aceptarRonda(cuenta.id, r.ronda));
                      if (ok) playFeedback('ok', soundOn);
                    }}
                    className={`btn min-h-12 flex-1 bg-[#2f6b3f] text-white hover:bg-[#25573a] ${focusRing}`}
                  >
                    <Check size={18} aria-hidden="true" /> Aceptar
                  </button>
                  <button type="button" disabled={busy} onClick={() => setRechazando(r.ronda)} className={`btn-outline-vino min-h-12 flex-1 ${focusRing}`}>
                    <XCircle size={18} aria-hidden="true" /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {lineas.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-carbon/55">
            {cuenta ? (rondas.length > 0 ? 'Acepta la ronda para pasarla a la cuenta.' : 'La cuenta está vacía.') : 'Mesa libre. Añade consumiciones para abrir su cuenta.'}
          </p>
        ) : (
          <ul className="divide-y divide-carbon/10">
            {lineas.map((l) => (
              <li key={l.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 ${l.estado === 'anulada' ? 'opacity-55' : ''}`}>
                <div className="min-w-[160px] flex-1">
                  <p className={`text-sm font-semibold ${l.estado === 'anulada' ? 'line-through' : 'text-carbon'}`}>
                    {l.cantidad} × {l.nombre}
                  </p>
                  {l.notas && <p className="text-xs italic text-carbon/60">«{l.notas}»</p>}
                  {l.pedido_por_nombre && <p className="text-xs text-carbon/50">Pedido por {l.pedido_por_nombre} desde la mesa</p>}
                </div>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${ESTADO_LINEA[l.estado].className}`}>
                  {ESTADO_LINEA[l.estado].label}
                </span>
                <span className="w-16 text-right text-sm font-semibold tabular-nums">{formatEuros(l.precio_unitario_centimos * l.cantidad)}</span>
                {l.estado !== 'anulada' && (
                  <div className="flex gap-1.5">
                    {l.estado === 'aceptada' && (
                      <button type="button" disabled={busy} onClick={() => run(() => servirLineas([l.id]))} aria-label={`Servir ${l.nombre}`} className={`flex h-10 w-10 items-center justify-center rounded-full border border-[#2f6b3f]/40 text-[#1f4a2b] hover:bg-[#2f6b3f]/10 ${focusRing}`}>
                        <Check size={18} />
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => setAnulando(l)} aria-label={`Anular ${l.nombre}`} className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/20 text-carbon/60 hover:border-vino hover:text-vino ${focusRing}`}>
                      <Ban size={17} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 border-t border-carbon/10 px-4 py-3">
          <button type="button" onClick={() => setAdding(true)} disabled={busy || !mesa.activa && !cuenta} className={`btn-vino min-h-12 flex-1 ${focusRing}`}>
            <Plus size={18} aria-hidden="true" /> Añadir
          </button>
          {porServir.length > 0 && (
            <button type="button" disabled={busy} onClick={() => run(() => servirLineas(porServir.map((l) => l.id)))} className={`btn-outline-vino min-h-12 flex-1 ${focusRing}`}>
              <CheckCheck size={18} aria-hidden="true" /> Servir todo ({porServir.length})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {cuenta && activas.length > 0 && (
        <div className="mt-4 rounded-r-lg border border-piedra/50 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-carbon/60">Cobrar · cómo paga</h3>
          {rondas.length > 0 && (
            <div className="mb-3">
              <Notice kind="info">Hay rondas sin aceptar: acéptalas o recházalas antes de cobrar.</Notice>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(METODOS) as Metodo[]).map((m) => (
              <button key={m} type="button" aria-pressed={metodo === m} onClick={() => setMetodo(m)} disabled={busy} className={`min-h-12 rounded-r-sm border text-sm font-semibold transition-colors ${focusRing} ${metodo === m ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino'}`}>
                {METODOS[m]}
              </button>
            ))}
          </div>
          <button type="button" onClick={cobrar} disabled={busy || !metodo} aria-busy={busy} className={`btn-vino mt-3 min-h-14 w-full text-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-vino ${focusRing}`}>
            {busy ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : null}
            {metodo ? `Cobrar ${formatEuros(total)}` : 'Elige cómo paga'}
          </button>
        </div>
      )}

      {cuenta && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMoviendo(true)} disabled={busy || mesasLibres.length === 0} className={`btn-outline-vino flex-1 disabled:opacity-50 ${focusRing}`}>
            <ArrowRightLeft size={16} aria-hidden="true" /> Cambiar de mesa
          </button>
          <button type="button" onClick={() => setCancelando(true)} disabled={busy} className={`btn flex-1 border border-carbon/20 bg-white text-carbon/70 hover:border-vino hover:text-vino ${focusRing}`}>
            <XCircle size={16} aria-hidden="true" /> Cancelar cuenta
          </button>
        </div>
      )}

      {adding && (
        <AddLinesModal
          tabs={tabs}
          catalogLoading={catalogLoading}
          mesaNombre={mesa.nombre}
          onClose={() => setAdding(false)}
          onConfirm={async (items, requestId) => {
            const ok = await run(async () => {
              let orderId = cuenta?.id;
              if (!orderId) {
                const opened = await abrirMesa(mesa.id);
                if (!opened.data) return { error: opened.error };
                orderId = opened.data;
              }
              return anadirLineas(orderId, items, requestId);
            });
            if (ok) {
              playFeedback('ok', soundOn);
              setAdding(false);
            }
            return ok;
          }}
        />
      )}

      {anulando && (
        <MotivoModal
          title={`Anular: ${anulando.cantidad} × ${anulando.nombre}`}
          texto={anulando.estado === 'servida' ? 'Ya está servida: quedará registrado el motivo (p. ej. invitación).' : 'Deja de contar en la cuenta.'}
          sugerencias={['Invitación', 'Error al pedir', 'Derramado', 'Devuelto por el cliente']}
          confirmLabel="Anular línea"
          onClose={() => setAnulando(null)}
          onConfirm={async (motivo) => {
            const ok = await run(() => anularLinea(anulando.id, motivo));
            if (ok) setAnulando(null);
          }}
        />
      )}

      {rechazando && cuenta && (
        <MotivoModal
          title="Rechazar la ronda"
          texto="El socio verá su pedido como rechazado. No se cobra."
          sugerencias={['Fuera de horario', 'Producto no disponible', 'Mesa equivocada', 'Pedido de prueba']}
          confirmLabel="Rechazar ronda"
          onClose={() => setRechazando(null)}
          onConfirm={async (motivo) => {
            const ok = await run(() => rechazarRonda(cuenta.id, rechazando, motivo));
            if (ok) setRechazando(null);
          }}
        />
      )}

      {cancelando && (
        <MotivoModal
          title={`Cancelar la cuenta de ${mesa.nombre}`}
          texto={haySevidas ? 'Hay consumiciones servidas: anúlalas antes (con su motivo) o cobra la cuenta.' : 'La cuenta se cierra sin cobrar y la mesa queda libre.'}
          sugerencias={['Se fueron sin pedir', 'Mesa abierta por error']}
          confirmLabel="Cancelar cuenta"
          disabled={haySevidas}
          onClose={() => setCancelando(false)}
          onConfirm={async (motivo) => {
            const ok = await run(() => cancelarCuenta(cuenta!.id, motivo));
            if (ok) {
              setCancelando(false);
              onBack();
            }
          }}
        />
      )}

      {moviendo && cuenta && (
        <Modal open title={`Mover ${mesa.nombre} a…`} onClose={() => setMoviendo(false)} busy={busy} maxWidth="460px">
          <ul className="grid grid-cols-2 gap-2">
            {mesasLibres.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await run(() => cambiarMesa(cuenta.id, m.id));
                    if (ok) {
                      setMoviendo(false);
                      onMoved(m.id);
                    }
                  }}
                  className={`min-h-14 w-full rounded-r-md border border-piedra/50 bg-white px-3 text-left font-semibold hover:border-vino ${focusRing}`}
                >
                  {m.nombre}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {done && <VentaHecha venta={done.venta} clientTotal={done.clientTotal} titulo={mesa.nombre} onClose={closeDone} />}
    </section>
  );
}

// ---------------------------------------------------------------------
// Añadir consumiciones (con notas)
// ---------------------------------------------------------------------

interface Borrador {
  id: number;
  name: string;
  priceCents: number;
  qty: number;
  notas: string;
}

function AddLinesModal({
  tabs,
  catalogLoading,
  mesaNombre,
  onClose,
  onConfirm,
}: {
  tabs: MenuTab[];
  catalogLoading: boolean;
  mesaNombre: string;
  onClose: () => void;
  onConfirm: (items: { product_id: number; cantidad: number; notas: string | null }[], requestId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Borrador[]>([]);
  const [saving, setSaving] = useState(false);
  // El mismo id hasta que se añade: si se reintenta tras un fallo de red, no se duplica.
  const [requestId] = useState(newRequestId);
  const qtyById = useMemo(() => new Map(draft.map((d) => [String(d.id), d.qty])), [draft]);
  const total = draft.reduce((s, d) => s + d.priceCents * d.qty, 0);

  const add = (item: MenuItem) => {
    if (!item.id || item.priceCents === undefined || item.available === false) return;
    const id = Number(item.id);
    setDraft((prev) => {
      const line = prev.find((d) => d.id === id && d.notas === '');
      if (line) return prev.map((d) => (d === line ? { ...d, qty: Math.min(99, d.qty + 1) } : d));
      return [...prev, { id, name: item.name ?? '', priceCents: item.priceCents!, qty: 1, notas: '' }];
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (draft.length === 0) return;
    setSaving(true);
    const ok = await onConfirm(
      draft.map((d) => ({ product_id: d.id, cantidad: d.qty, notas: d.notas.trim() || null })),
      requestId
    );
    setSaving(false);
    if (!ok) return;
  };

  return (
    <Modal open title={`Añadir a ${mesaNombre}`} onClose={onClose} busy={saving} maxWidth="760px">
      <ProductPicker tabs={tabs} loading={catalogLoading} qtyById={qtyById} onAdd={add} idPrefix="mesa-add" />
      <form onSubmit={handleSubmit} className="mt-5 border-t border-carbon/10 pt-4">
        {draft.length === 0 ? (
          <p className="text-sm text-carbon/55">Toca productos para añadirlos.</p>
        ) : (
          <ul className="space-y-2">
            {draft.map((d, i) => (
              <li key={`${d.id}-${i}`} className="rounded-r-sm bg-marfil px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{d.name}</span>
                  <button type="button" onClick={() => setDraft((p) => p.flatMap((x, j) => (j !== i ? [x] : x.qty <= 1 ? [] : [{ ...x, qty: x.qty - 1 }])))} aria-label={`Quitar uno de ${d.name}`} className={`flex h-9 w-9 items-center justify-center rounded-full border border-carbon/20 bg-white ${focusRing}`}>
                    {d.qty <= 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                  </button>
                  <span className="w-6 text-center font-bold tabular-nums">{d.qty}</span>
                  <button type="button" onClick={() => setDraft((p) => p.map((x, j) => (j === i ? { ...x, qty: Math.min(99, x.qty + 1) } : x)))} aria-label={`Añadir uno de ${d.name}`} className={`flex h-9 w-9 items-center justify-center rounded-full border border-carbon/20 bg-white ${focusRing}`}>
                    <Plus size={15} />
                  </button>
                </div>
                <label className="sr-only" htmlFor={`nota-${i}`}>Nota para {d.name}</label>
                <input
                  id={`nota-${i}`}
                  value={d.notas}
                  maxLength={200}
                  onChange={(e) => setDraft((p) => p.map((x, j) => (j === i ? { ...x, notas: e.target.value } : x)))}
                  placeholder="Nota (opcional): sin hielo, bien hechas…"
                  className="mt-1.5 w-full rounded-r-sm border border-carbon/20 bg-white px-2.5 py-1.5 text-base outline-none focus:border-vino sm:text-sm"
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <SubmitButton loading={saving} loadingText="Añadiendo…" disabled={draft.length === 0}>
            Añadir a la cuenta{draft.length > 0 ? ` · ${formatEuros(total)}` : ''}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Ventana de motivo (anular línea, cancelar cuenta)
// ---------------------------------------------------------------------

function MotivoModal({
  title,
  texto,
  sugerencias,
  confirmLabel,
  disabled,
  onClose,
  onConfirm,
}: {
  title: string;
  texto: string;
  sugerencias: string[];
  confirmLabel: string;
  disabled?: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) return setError('Escribe o elige un motivo.');
    setSaving(true);
    await onConfirm(motivo.trim());
    setSaving(false);
  };

  return (
    <Modal open title={title} onClose={onClose} busy={saving} maxWidth="480px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-carbon/75">{texto}</p>
        {!disabled && (
          <>
            <div className="flex flex-wrap gap-2">
              {sugerencias.map((s) => (
                <button key={s} type="button" aria-pressed={motivo === s} onClick={() => setMotivo(s)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${focusRing} ${motivo === s ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino'}`}>
                  {s}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="motivo-texto" className="mb-1 block text-xs font-semibold text-carbon/80">Motivo</label>
              <input id="motivo-texto" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} className="w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 text-base outline-none focus:border-vino sm:text-sm" />
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            <SubmitButton loading={saving} loadingText="Guardando…">{confirmLabel}</SubmitButton>
          </>
        )}
      </form>
    </Modal>
  );
}
