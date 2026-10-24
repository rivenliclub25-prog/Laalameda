import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { fetchAppSettings, fetchTicketStats, jornadaInicio, type TicketStatsRow } from '@/lib/adminTickets';

type Preset = 'hoy' | '7' | '30' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoy', label: 'Jornada de hoy' },
  { id: '7', label: 'Últimos 7 días' },
  { id: '30', label: 'Últimos 30 días' },
  { id: 'custom', label: 'Fechas…' },
];

// Barras del gráfico: un tono del vino de la marca validado para gráficos (contraste ≥ 3:1 sobre blanco).
const BAR_COLOR = '#A3283A';

// Horas en el orden de la jornada del bar: de las 8:00 a las 7:00 del día siguiente.
const HOURS = [...Array.from({ length: 16 }, (_, i) => i + 8), ...Array.from({ length: 8 }, (_, i) => i)];

function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pct(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '—';
}

/** Pestaña "Estadísticas": tickets por promo y canjes por hora (admin_ticket_stats). */
export function StatsSection() {
  const [preset, setPreset] = useState<Preset>('7');
  const [desde, setDesde] = useState(() => localDate(new Date(Date.now() - 6 * 86_400_000)));
  const [hasta, setHasta] = useState(() => localDate(new Date()));
  const [horaCierre, setHoraCierre] = useState<string | null>(null);
  const [rows, setRows] = useState<TicketStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAppSettings().then(({ settings }) => setHoraCierre(settings?.hora_cierre ?? '03:00:00'));
  }, []);

  const range = useMemo((): { from: Date; to: Date } | null => {
    const now = new Date();
    if (preset === 'hoy') return horaCierre ? { from: jornadaInicio(horaCierre, now), to: now } : null;
    if (preset === '7') return { from: new Date(now.getTime() - 7 * 86_400_000), to: now };
    if (preset === '30') return { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
    if (!desde || !hasta) return null;
    const from = new Date(`${desde}T00:00`);
    const to = new Date(`${hasta}T00:00`);
    to.setDate(to.getDate() + 1); // "hasta" incluye todo ese día
    return from < to ? { from, to } : null;
  }, [preset, desde, hasta, horaCierre]);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError(null);
    const result = await fetchTicketStats(range.from, range.to);
    setRows(result.rows);
    setError(result.error);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          generados: acc.generados + r.generados,
          canjeados: acc.canjeados + r.canjeados,
          caducados: acc.caducados + r.caducados,
          anulados: acc.anulados + r.anulados,
        }),
        { generados: 0, canjeados: 0, caducados: 0, anulados: 0 }
      ),
    [rows]
  );

  const porHora = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of rows) {
      for (const [h, n] of Object.entries(r.canjes_por_hora ?? {})) counts.set(Number(h), (counts.get(Number(h)) ?? 0) + Number(n));
    }
    return HOURS.map((h) => ({ hour: h, value: counts.get(h) ?? 0 }));
  }, [rows]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.generados - a.generados || a.promo_nombre.localeCompare(b.promo_nombre)),
    [rows]
  );

  return (
    <>
      {/* Filtros: una fila encima de todo */}
      <div className="flex flex-col gap-3 rounded-r-lg border border-piedra/50 bg-white/80 p-4 shadow-sm sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 block text-xs font-semibold text-carbon/80" id="periodo-label">
            Periodo
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="periodo-label">
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
                <label htmlFor="stats-desde" className="mb-1 block text-xs font-semibold text-carbon/80">
                  Desde
                </label>
                <input
                  id="stats-desde"
                  type="date"
                  value={desde}
                  max={hasta}
                  onChange={(e) => setDesde(e.target.value)}
                  className="rounded-r-sm border border-carbon/25 bg-white px-3 py-2 text-base outline-none focus:border-vino sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="stats-hasta" className="mb-1 block text-xs font-semibold text-carbon/80">
                  Hasta (incluido)
                </label>
                <input
                  id="stats-hasta"
                  type="date"
                  value={hasta}
                  min={desde}
                  onChange={(e) => setHasta(e.target.value)}
                  className="rounded-r-sm border border-carbon/25 bg-white px-3 py-2 text-base outline-none focus:border-vino sm:text-sm"
                />
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || !range}
          className={`btn-outline-vino self-start disabled:cursor-not-allowed disabled:opacity-60 lg:self-auto ${focusRing}`}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
        </button>
      </div>

      {preset === 'custom' && !range && (
        <div className="mt-4">
          <Notice kind="error">La fecha «hasta» debe ser igual o posterior a «desde».</Notice>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Calculando estadísticas…
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
          {/* Resumen */}
          <section aria-label="Resumen del periodo" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Generados" value={totals.generados} />
            <Tile label="Canjeados" value={totals.canjeados} />
            <Tile label="% de canje" value={pct(totals.canjeados, totals.generados)} hint="Canjeados sobre generados" />
            <Tile label="Caducados" value={totals.caducados} />
            <Tile label="Anulados" value={totals.anulados} />
          </section>

          {totals.generados === 0 && totals.canjeados === 0 ? (
            <div className="mt-6 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
              <p className="font-display text-2xl font-semibold text-vino">Sin actividad en este periodo</p>
              <p className="mt-1 text-sm text-carbon/70">Prueba con un periodo más largo.</p>
            </div>
          ) : (
            <>
              <HourlyChart data={porHora} />

              {/* Por promo */}
              <section aria-labelledby="por-promo-title" className="mt-8">
                <h3 id="por-promo-title" className="font-display text-2xl font-semibold text-vino">
                  Por promo
                </h3>
                <div className="mt-3 overflow-x-auto rounded-r-lg border border-piedra/50 bg-white shadow-sm">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-piedra-suave/70 text-xs uppercase tracking-wider text-carbon/70">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">Promo</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Generados</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Canjeados</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">% canje</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Caducados</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Anulados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-carbon/10 tabular-nums">
                      {sortedRows.map((r) => {
                        const vacia = r.generados + r.canjeados + r.caducados + r.anulados === 0;
                        return (
                          <tr key={r.promo_id} className={vacia ? 'text-carbon/40' : 'text-carbon/85'}>
                            <th scope="row" className="px-4 py-2.5 font-medium">{r.promo_nombre}</th>
                            <td className="px-4 py-2.5 text-right">{r.generados}</td>
                            <td className="px-4 py-2.5 text-right">{r.canjeados}</td>
                            <td className="px-4 py-2.5 text-right">{pct(r.canjeados, r.generados)}</td>
                            <td className="px-4 py-2.5 text-right">{r.caducados}</td>
                            <td className="px-4 py-2.5 text-right">{r.anulados}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-carbon/15 font-semibold tabular-nums text-carbon">
                      <tr>
                        <th scope="row" className="px-4 py-3">Total</th>
                        <td className="px-4 py-3 text-right">{totals.generados}</td>
                        <td className="px-4 py-3 text-right">{totals.canjeados}</td>
                        <td className="px-4 py-3 text-right">{pct(totals.canjeados, totals.generados)}</td>
                        <td className="px-4 py-3 text-right">{totals.caducados}</td>
                        <td className="px-4 py-3 text-right">{totals.anulados}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="mt-2 text-xs text-carbon/55">
                  Cada cifra cuenta lo ocurrido dentro del periodo: un ticket creado ayer y canjeado hoy suma «generado» ayer y
                  «canjeado» hoy.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-r-md bg-white p-4 shadow-sm" title={hint}>
      <div className="text-xs font-semibold uppercase tracking-wider text-carbon/60">{label}</div>
      <div className="mt-2 font-display text-[2.2rem] font-semibold leading-none text-carbon tabular-nums">{value}</div>
    </div>
  );
}

/** Columnas de canjes por hora (una sola serie: el título la nombra, sin leyenda). */
function HourlyChart({ data }: { data: { hour: number; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0]);
  const label = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return (
    <section aria-labelledby="por-hora-title" className="mt-8 rounded-r-lg border border-piedra/50 bg-white p-4 shadow-sm sm:p-6">
      <h3 id="por-hora-title" className="font-display text-2xl font-semibold text-vino">
        Canjes por hora
      </h3>
      <p className="mt-1 text-sm text-carbon/65">
        {peak.value > 0
          ? `La hora con más canjes es de ${label(peak.hour)} a ${label((peak.hour + 1) % 24)} (${peak.value}).`
          : 'Todavía no hay canjes en este periodo.'}
      </p>

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="relative min-w-[560px]">
          {/* Línea de referencia del máximo (eje recesivo) */}
          <div className="absolute inset-x-0 top-6 border-t border-dashed border-carbon/10" aria-hidden="true" />
          <span className="absolute right-0 top-1 text-[0.68rem] text-carbon/45" aria-hidden="true">{max}</span>
          <div className="flex h-48 items-end gap-[2px] border-b border-carbon/20 pt-6">
            {data.map((d) => {
              const height = d.value === 0 ? 0 : Math.max(3, (d.value / max) * 100);
              const isPeak = d.value > 0 && d === peak;
              return (
                <div
                  key={d.hour}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  tabIndex={0}
                  role="img"
                  aria-label={`${label(d.hour)}: ${d.value} canjes`}
                >
                  {isPeak && (
                    <span aria-hidden="true" className="absolute -translate-y-1 text-xs font-semibold text-carbon" style={{ bottom: `${height}%` }}>
                      {d.value}
                    </span>
                  )}
                  <div
                    className="w-full max-w-[24px] rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                    style={{ height: `${height}%`, backgroundColor: BAR_COLOR }}
                  />
                  {/* Tooltip (ratón y teclado); el área de toque es toda la columna, no solo la barra */}
                  <span aria-hidden="true" className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-r-sm bg-carbon px-2 py-1 text-xs text-marfil shadow-lg group-hover:block group-focus-visible:block">
                    {label(d.hour)} · {d.value} {d.value === 1 ? 'canje' : 'canjes'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-[2px] text-center text-[0.65rem] text-carbon/55" aria-hidden="true">
            {data.map((d) => (
              <span key={d.hour} className="flex-1">
                {d.hour % 2 === 0 ? String(d.hour).padStart(2, '0') : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Vista en tabla (accesible y para quien prefiera los números) */}
      <details className="mt-4 text-sm">
        <summary className={`cursor-pointer rounded-r-sm font-semibold text-vino ${focusRing}`}>Ver como tabla</summary>
        <table className="mt-2 w-full max-w-[320px] text-left tabular-nums">
          <thead className="text-xs uppercase tracking-wider text-carbon/60">
            <tr>
              <th scope="col" className="py-1">Hora</th>
              <th scope="col" className="py-1 text-right">Canjes</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.hour} className="border-t border-carbon/10">
                <th scope="row" className="py-1 font-normal">{label(d.hour)}</th>
                <td className="py-1 text-right">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
