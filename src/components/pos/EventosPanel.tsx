import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { CuentaView, DatosEventoTPV } from '@/components/pos/MesasPanel';
import { subscribeChanges } from '@/lib/realtime';
import type { MenuTab } from '@/lib/catalog';
import { fetchCuentaAbierta, formatEuros, type CuentaMesa, type Mesa, type PromoVenta } from '@/lib/pos';
import { fechaISO, fechaLarga, fetchEventosTPV, horaCorta, type EventoTPV } from '@/lib/eventos';

const POLL_MS = 10_000;
/** Ventana de la lista: pendientes de los últimos 30 días y los próximos 60 (EV3). */
const DIAS_ATRAS = 30;
const DIAS_ADELANTE = 60;

/**
 * TPV → Eventos (EVENTOS.md, EV3, EV-D6): los de hoy, los próximos y los de días anteriores con algo
 * pendiente. Al tocar uno se abre su cuenta con la misma pantalla que una mesa.
 */
export function EventosPanel({
  tabs,
  promos,
  catalogLoading,
  soundOn,
}: {
  tabs: MenuTab[];
  promos: PromoVenta[];
  catalogLoading: boolean;
  soundOn: boolean;
}) {
  const [eventos, setEventos] = useState<EventoTPV[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<CuentaMesa | null>(null);
  const [cuentaLista, setCuentaLista] = useState(false);
  // Si se entró con la cuenta abierta, se sigue en ella aunque se cierre (para ver el justificante del último cobro).
  const [enCuenta, setEnCuenta] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const selected = eventos.find((e) => e.id === selectedId) ?? null;
  const selectedOrder = selected?.order_id ?? null;

  const load = useCallback(async () => {
    const r = await fetchEventosTPV(fechaISO(-DIAS_ATRAS), fechaISO(DIAS_ADELANTE));
    setEventos(r.eventos);
    setError(r.error);
    setLoading(false);
    setNow(Date.now());
  }, []);

  const loadCuenta = useCallback(async () => {
    if (!selectedOrder) {
      setCuenta(null);
      setCuentaLista(true);
      return;
    }
    const r = await fetchCuentaAbierta(selectedOrder);
    setCuenta(r.cuenta);
    if (r.cuenta) setEnCuenta(true);
    if (r.error) setError(r.error);
    setCuentaLista(true);
  }, [selectedOrder]);

  const loadTodo = useCallback(async () => {
    await Promise.all([load(), loadCuenta()]);
  }, [load, loadCuenta]);

  useEffect(() => {
    setCuentaLista(false);
    setEnCuenta(false);
    loadCuenta();
  }, [loadCuenta]);

  // Tiempo real como en Mesas: un cobro, un extra o un cambio del admin recargan la lista y la cuenta.
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(loadTodo, 300);
    };
    loadTodo();
    const unsubscribe = subscribeChanges('pos-eventos', [{ table: 'orders' }, { table: 'order_items' }], schedule);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadTodo();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadTodo();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadTodo]);

  const grupos = useMemo(() => {
    const hoy = fechaISO();
    return {
      hoy: eventos.filter((e) => e.fecha === hoy),
      proximos: eventos.filter((e) => e.fecha > hoy),
      anteriores: eventos.filter((e) => e.fecha < hoy && e.pendiente_centimos > 0).reverse(),
    };
  }, [eventos]);

  if (selected) {
    const volver = () => {
      setSelectedId(null);
      setCuenta(null);
      load();
    };
    if (!cuentaLista) {
      return (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          <span className="sr-only">Cargando la cuenta del evento…</span>
        </div>
      );
    }
    if (cuenta || enCuenta) {
      // La cuenta del evento usa la pantalla de las mesas; «mesa» solo pone el nombre (no hay mesa).
      const comoMesa: Mesa = { id: selected.id, nombre: selected.nombre, token: '', orden: 0, activa: true, tipo: 'mesa' };
      return (
        <CuentaView
          mesa={comoMesa}
          cuenta={cuenta}
          mesasLibres={[]}
          tabs={tabs}
          promos={promos}
          catalogLoading={catalogLoading}
          soundOn={soundOn}
          now={now}
          onBack={volver}
          onChanged={loadTodo}
          onMoved={() => undefined}
          evento={selected}
        />
      );
    }
    // Sin cuenta abierta: ya está todo cobrado (realizado).
    return (
      <section aria-labelledby="evento-cerrado-title">
        <button type="button" onClick={volver} className={`inline-flex items-center gap-2 rounded-r-sm text-sm font-semibold text-carbon/70 hover:text-vino ${focusRing}`}>
          <ArrowLeft size={18} aria-hidden="true" /> Eventos
        </button>
        <h2 id="evento-cerrado-title" className="mt-3 font-display text-2xl font-semibold text-vino">
          {selected.nombre}
        </h2>
        <DatosEventoTPV evento={selected} />
        <div className="mt-4">
          <Notice kind="success">
            Todo cobrado ({formatEuros(selected.cobrado_centimos)}). Las ventas están en «Últimas ventas» y en Panel → Ventas.
          </Notice>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Eventos">
      <div className="flex items-center justify-between">
        <p className="text-sm text-carbon/65">Toca un evento para cobrar un plazo o añadir extras.</p>
        <button type="button" onClick={loadTodo} aria-label="Actualizar eventos" className={`flex h-10 w-10 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}>
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
          <span className="sr-only">Cargando eventos…</span>
        </div>
      ) : eventos.length === 0 || grupos.hoy.length + grupos.proximos.length + grupos.anteriores.length === 0 ? (
        <div className="mt-4 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
          <CalendarDays size={30} className="mx-auto mb-2 text-carbon/35" aria-hidden="true" />
          <p className="font-display text-2xl font-semibold text-vino">No hay eventos confirmados</p>
          <p className="mt-1 text-sm text-carbon/70">Un admin los crea y confirma en Panel → Eventos.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-6">
          <Grupo titulo="Hoy" vacio="Hoy no hay eventos." eventos={grupos.hoy} destacado onSelect={setSelectedId} />
          <Grupo titulo={`Próximos (${DIAS_ADELANTE} días)`} vacio="No hay eventos próximos." eventos={grupos.proximos} onSelect={setSelectedId} />
          {grupos.anteriores.length > 0 && (
            <Grupo titulo="Con cobros pendientes de días anteriores" eventos={grupos.anteriores} onSelect={setSelectedId} />
          )}
        </div>
      )}
    </section>
  );
}

function Grupo({
  titulo,
  vacio,
  eventos,
  destacado = false,
  onSelect,
}: {
  titulo: string;
  vacio?: string;
  eventos: EventoTPV[];
  destacado?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-carbon/60">{titulo}</h3>
      {eventos.length === 0 ? (
        <p className="text-sm text-carbon/55">{vacio}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e.id)}
                className={`flex min-h-[112px] w-full flex-col justify-between rounded-r-md border p-3 text-left shadow-sm transition-all active:scale-[0.98] ${focusRing} ${
                  destacado ? 'border-vino bg-vino text-white' : 'border-piedra/50 bg-white text-carbon hover:border-vino'
                }`}
              >
                <span>
                  <span className="block font-display text-xl font-semibold leading-tight">{e.nombre}</span>
                  <span className={`block text-sm ${destacado ? 'opacity-90' : 'text-carbon/65'}`}>
                    {destacado ? (e.hora_inicio ? `A las ${horaCorta(e.hora_inicio)}` : 'Hoy') : fechaLarga(e.fecha)}
                    {!destacado && e.hora_inicio ? `, ${horaCorta(e.hora_inicio)}` : ''}
                    {e.personas ? ` · ${e.personas} pers.` : ''}
                  </span>
                </span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {e.plazos.map((p) => (
                    <span
                      key={p.id}
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        p.cobrado
                          ? destacado
                            ? 'border-white/60 bg-white/20'
                            : 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#1f4a2b]'
                          : destacado
                            ? 'border-white/40'
                            : 'border-carbon/20 text-carbon/70'
                      }`}
                    >
                      {p.nombre} {formatEuros(p.importe_centimos)} {p.cobrado ? '✓' : ''}
                    </span>
                  ))}
                </span>
                <span className="mt-2 text-sm font-semibold">
                  {e.pendiente_centimos > 0 ? `Pendiente ${formatEuros(e.pendiente_centimos)}` : 'Todo cobrado ✓'}
                  {e.extras_pendientes > 0 ? ` · ${e.extras_pendientes} ${e.extras_pendientes === 1 ? 'extra' : 'extras'} sin cobrar` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
