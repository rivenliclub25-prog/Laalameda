import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { fetchAppSettings, jornadaInicio } from '@/lib/adminTickets';
import type { AdminUser } from '@/lib/admin';
import { METODOS, fetchVentas, formatEuros, resumenVentas, type Metodo, type Venta } from '@/lib/pos';

type Preset = 'hoy' | '7' | '30' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoy', label: 'Jornada de hoy' },
  { id: '7', label: 'Últimos 7 días' },
  { id: '30', label: 'Últimos 30 días' },
  { id: 'custom', label: 'Fechas…' },
];

function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Pestaña "Ventas" del panel: totales por método para cuadrar la caja y lista de ventas con sus líneas. */
export function VentasSection({ users }: { users: AdminUser[] }) {
  const [preset, setPreset] = useState<Preset>('hoy');
  const [desde, setDesde] = useState(() => localDate(new Date()));
  const [hasta, setHasta] = useState(() => localDate(new Date()));
  const [horaCierre, setHoraCierre] = useState<string | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const nombre = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.nombre || u.email]));
    return (id: string | null) => (id ? (map.get(id) ?? 'Cuenta borrada') : '—');
  }, [users]);

  useEffect(() => {
    fetchAppSettings().then(({ settings }) => setHoraCierre(settings?.hora_cierre ?? '03:00:00'));
  }, []);

  const range = useMemo((): { from: Date; to: Date } | null => {
    const now = new Date();
    if (preset === 'hoy') return horaCierre ? { from: jornadaInicio(horaCierre, now), to: new Date(now.getTime() + 60_000) } : null;
    if (preset === '7') return { from: new Date(now.getTime() - 7 * 86_400_000), to: new Date(now.getTime() + 60_000) };
    if (preset === '30') return { from: new Date(now.getTime() - 30 * 86_400_000), to: new Date(now.getTime() + 60_000) };
    if (!desde || !hasta) return null;
    const from = new Date(`${desde}T00:00`);
    const to = new Date(`${hasta}T00:00`);
    to.setDate(to.getDate() + 1);
    return from < to ? { from, to } : null;
  }, [preset, desde, hasta, horaCierre]);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError(null);
    const result = await fetchVentas(range.from, range.to);
    setVentas(result.ventas);
    setError(result.error);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const resumen = useMemo(() => resumenVentas(ventas), [ventas]);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-r-lg border border-piedra/50 bg-white/80 p-4 shadow-sm sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span id="ventas-periodo" className="mb-2 block text-xs font-semibold text-carbon/80">Periodo</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ventas-periodo">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => setPreset(p.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${focusRing} ${
                  preset === p.id ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino hover:text-vino'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="ventas-desde" className="mb-1 block text-xs font-semibold text-carbon/80">Desde</label>
                <input id="ventas-desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="rounded-r-sm border border-carbon/25 bg-white px-3 py-2 text-base outline-none focus:border-vino sm:text-sm" />
              </div>
              <div>
                <label htmlFor="ventas-hasta" className="mb-1 block text-xs font-semibold text-carbon/80">Hasta (incluido)</label>
                <input id="ventas-hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="rounded-r-sm border border-carbon/25 bg-white px-3 py-2 text-base outline-none focus:border-vino sm:text-sm" />
              </div>
            </div>
          )}
        </div>
        <button type="button" onClick={load} disabled={loading || !range} className={`btn-outline-vino self-start disabled:opacity-60 lg:self-auto ${focusRing}`}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Cargando ventas…
        </div>
      ) : error ? (
        <div className="mt-6 space-y-4">
          <Notice kind="error">{error}</Notice>
          <button type="button" onClick={load} className={`btn-outline-vino ${focusRing}`}>
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* Para cuadrar la caja */}
          <section aria-label="Resumen" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Total cobrado" value={formatEuros(resumen.total)} hint={`${resumen.n} ventas · media ${formatEuros(resumen.medio)}`} strong />
            {(Object.keys(METODOS) as Metodo[]).map((m) => (
              <Tile key={m} label={METODOS[m]} value={formatEuros(resumen.porMetodo[m].total)} hint={`${resumen.porMetodo[m].n} ventas`} />
            ))}
          </section>

          {ventas.length === 0 ? (
            <div className="mt-6 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
              <p className="font-display text-2xl font-semibold text-vino">Sin ventas en este periodo</p>
              <p className="mt-1 text-sm text-carbon/70">Las ventas del TPV aparecerán aquí.</p>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
              {ventas.map((v) => {
                const open = abierta === v.id;
                const lineas = v.orders?.order_items ?? [];
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setAbierta(open ? null : v.id)}
                      aria-expanded={open}
                      className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-marfil sm:grid-cols-[110px_1fr_110px_110px_24px] ${focusRing}`}
                    >
                      <span className="tabular-nums text-carbon/70">
                        {new Date(v.cobrado_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="hidden min-w-0 truncate text-carbon/70 sm:block">
                        nº {v.numero} · {v.orders?.origen === 'mesa' ? 'Mesa' : 'Barra'} · {nombre(v.cobrado_por)}
                      </span>
                      <span className="hidden text-carbon/70 sm:block">{METODOS[v.metodo]}</span>
                      <span className="text-right font-semibold tabular-nums">{formatEuros(v.total_centimos)}</span>
                      <ChevronDown size={16} className={`hidden text-carbon/50 transition-transform sm:block ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      <span className="col-span-2 text-xs text-carbon/55 sm:hidden">
                        nº {v.numero} · {METODOS[v.metodo]} · {nombre(v.cobrado_por)}
                      </span>
                    </button>
                    {open && (
                      <ul className="border-t border-carbon/10 bg-marfil/60 px-4 py-2 text-sm">
                        {lineas.map((l, i) => (
                          <li key={i} className="flex justify-between gap-3 py-1">
                            <span>
                              {l.cantidad} × {l.nombre} <span className="text-carbon/50">({formatEuros(l.precio_unitario_centimos)})</span>
                            </span>
                            <span className="tabular-nums">{formatEuros(l.cantidad * l.precio_unitario_centimos)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function Tile({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`rounded-r-md p-4 shadow-sm ${strong ? 'bg-vino text-white' : 'bg-white'}`}>
      <div className={`text-xs font-semibold uppercase tracking-wider ${strong ? 'text-white/80' : 'text-carbon/60'}`}>{label}</div>
      <div className={`mt-2 font-display text-[1.9rem] font-semibold leading-none tabular-nums ${strong ? '' : 'text-carbon'}`}>{value}</div>
      <div className={`mt-1 text-xs ${strong ? 'text-white/80' : 'text-carbon/55'}`}>{hint}</div>
    </div>
  );
}
