import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Download, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { formatCosteUnitario } from '@/lib/costes';
import { descargarRentabilidad } from '@/lib/exportarRentabilidad';
import { fetchResumen, formatEur, formatPct, type ResumenRentabilidad } from '@/lib/rentabilidad';

type Periodo = '7' | '30' | 'mes' | 'fechas';
const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: '7', texto: 'Últimos 7 días' },
  { id: '30', texto: 'Últimos 30 días' },
  { id: 'mes', texto: 'Este mes' },
  { id: 'fechas', texto: 'Fechas…' },
];

// Barras: el vino de la marca validado para gráficos (el mismo de Estadísticas; contraste ≥ 3:1).
const BAR_COLOR = '#A3283A';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaCorta = (s: string) => new Date(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const pctSigno = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, signDisplay: 'always' });

function rango(p: Periodo, desde: string, hasta: string): [string, string] {
  const hoy = new Date();
  if (p === '7') return [iso(new Date(Date.now() - 6 * 86_400_000)), iso(hoy)];
  if (p === '30') return [iso(new Date(Date.now() - 29 * 86_400_000)), iso(hoy)];
  if (p === 'mes') return [iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), iso(hoy)];
  return [desde, hasta];
}

/** Resumen de lo vendido: margen medio ponderado, por categoría, lo que más y menos deja, y cambios de precio. */
export function ResumenView() {
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [desde, setDesde] = useState(() => iso(new Date(Date.now() - 29 * 86_400_000)));
  const [hasta, setHasta] = useState(() => iso(new Date()));
  const [resumen, setResumen] = useState<ResumenRentabilidad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const idDesde = useId();
  const idHasta = useId();

  const load = useCallback(async () => {
    const [d, h] = rango(periodo, desde, hasta);
    if (!d || !h || d > h) {
      setError('Elige un periodo válido: «desde» no puede ser posterior a «hasta».');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await fetchResumen(d, h);
    setResumen(r.resumen);
    setError(r.error);
    setLoading(false);
  }, [periodo, desde, hasta]);

  useEffect(() => {
    load();
  }, [load]);

  const descargar = async () => {
    setDescargando(true);
    const e = await descargarRentabilidad(resumen);
    setDescargando(false);
    if (e) setError(e);
  };

  const t = resumen?.totales;
  const conGanancia = (resumen?.productos ?? []).filter((p) => p.ganancia !== null);
  const masGanancia = [...conGanancia].sort((a, b) => b.ganancia! - a.ganancia!).slice(0, 8);
  const menosMargen = [...conGanancia].filter((p) => p.margen_pct !== null).sort((a, b) => a.margen_pct! - b.margen_pct!).slice(0, 8);
  const maxPct = Math.max(1, ...(resumen?.por_categoria ?? []).map((c) => Number(c.pct_venta ?? 0)));

  return (
    <section aria-label="Resumen">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={periodo === p.id}
              onClick={() => setPeriodo(p.id)}
              className={`min-h-10 rounded-r-sm border px-3 text-sm font-semibold ${focusRing} ${
                periodo === p.id ? 'border-carbon bg-carbon text-white' : 'border-carbon/20 bg-white text-carbon/75 hover:border-carbon'
              }`}
            >
              {p.texto}
            </button>
          ))}
        </div>
        {periodo === 'fechas' && (
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor={idDesde} className="text-xs font-semibold text-carbon/80">
              Desde
              <input id={idDesde} type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={`mt-1 block h-10 rounded-r-sm border border-carbon/20 bg-white px-2 text-sm ${focusRing}`} />
            </label>
            <label htmlFor={idHasta} className="text-xs font-semibold text-carbon/80">
              Hasta
              <input id={idHasta} type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={`mt-1 block h-10 rounded-r-sm border border-carbon/20 bg-white px-2 text-sm ${focusRing}`} />
            </label>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={descargar} disabled={descargando || loading} className={`btn-outline-vino disabled:opacity-60 ${focusRing}`}>
            {descargando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Descargar Excel
          </button>
          <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className={`btn-outline-vino disabled:opacity-60 ${focusRing}`}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-carbon/60">
        Jornadas del periodo · precios <strong>sin IVA</strong> · calculado con el <strong>coste de hoy</strong> de cada producto · las devoluciones van aparte.
      </p>

      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {loading && !resumen ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Calculando…
        </div>
      ) : resumen && t ? (
        <div className={`mt-4 space-y-6 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {/* Cifras */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra titulo="Ventas sin IVA" valor={formatEur(Number(t.ventas_sin_iva))} detalle={`${t.unidades} unidades`} />
            <Cifra titulo="Ganancia" valor={formatEur(Number(t.ganancia))} detalle={`de lo que tiene coste (${formatEur(Number(t.ventas_con_coste))})`} />
            <Cifra
              titulo="Margen medio"
              valor={t.margen_pct !== null ? formatPct(Number(t.margen_pct)) : '—'}
              detalle={<EtiquetaBadge etiqueta={t.etiqueta} />}
            />
            <Cifra
              titulo="Vendido sin coste"
              valor={formatEur(Number(t.ventas_sin_coste))}
              detalle={t.pct_sin_coste !== null ? `${formatPct(Number(t.pct_sin_coste))} de la venta` : '—'}
            />
          </div>
          {Number(t.devuelto) > 0 && <p className="text-sm text-carbon/70">Devoluciones del periodo: {formatEur(Number(t.devuelto))} (con IVA, no se restan del margen).</p>}

          {Number(t.ventas_sin_iva) === 0 ? (
            <Notice kind="info">No hay ventas en este periodo.</Notice>
          ) : (
            <>
              {/* Por categoría: barra = % de la venta (una sola serie, sin leyenda) */}
              <div>
                <h3 className="font-display text-xl font-semibold text-vino">Por categoría</h3>
                <p className="text-xs text-carbon/60">La barra es la parte de la venta; a la derecha, el margen y lo que ha dejado.</p>
                <ul className="mt-3 space-y-2">
                  {resumen.por_categoria.map((c) => (
                    <li key={c.id} className="grid grid-cols-[minmax(90px,140px)_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[140px_1fr_auto]">
                      <span className="truncate text-sm font-semibold text-carbon" title={c.nombre}>
                        {c.nombre}
                      </span>
                      <span className="flex items-center gap-2" title={`${c.nombre}: ${formatPct(Number(c.pct_venta ?? 0))} de la venta · ${formatEur(Number(c.ventas_sin_iva))} sin IVA`}>
                        <span className="h-5 flex-1">
                          <span
                            className="block h-full rounded-r-[4px]"
                            style={{ width: `${Math.max(1, (Number(c.pct_venta ?? 0) / maxPct) * 100)}%`, background: BAR_COLOR }}
                          />
                        </span>
                        <span className="w-14 text-right text-xs tabular-nums text-carbon/70">{formatPct(Number(c.pct_venta ?? 0))}</span>
                      </span>
                      <span className="col-span-2 flex items-center justify-end gap-2 text-xs sm:col-span-1 sm:w-56">
                        <EtiquetaBadge etiqueta={c.etiqueta} margen={c.margen_pct === null ? null : Number(c.margen_pct)} />
                        <span className="w-20 text-right tabular-nums text-carbon/70">{c.ganancia !== null ? formatEur(Number(c.ganancia)) : '—'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Lista titulo="Lo que más dinero deja" vacio="Nada con coste en este periodo.">
                  {masGanancia.map((p) => (
                    <li key={`${p.clase}-${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{p.nombre}</span>
                        <span className="text-xs text-carbon/55">
                          {p.unidades} vendidos · {p.categoria}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-bold tabular-nums">{formatEur(p.ganancia!)}</span>
                        <EtiquetaBadge etiqueta={p.etiqueta} margen={p.margen_pct} />
                      </span>
                    </li>
                  ))}
                </Lista>
                <Lista titulo="Menos margen de lo que se vende" vacio="Nada con coste en este periodo.">
                  {menosMargen.map((p) => (
                    <li key={`${p.clase}-${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{p.nombre}</span>
                        <span className="text-xs text-carbon/55">
                          {p.unidades} vendidos · deja {formatEur(p.ganancia!)}
                        </span>
                      </span>
                      <EtiquetaBadge etiqueta={p.etiqueta} margen={p.margen_pct} />
                    </li>
                  ))}
                </Lista>
              </div>
            </>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Lista titulo="Ingredientes que han cambiado de precio" vacio="Ningún cambio en este periodo.">
              {resumen.ingredientes.map((i, k) => (
                <li key={`${i.insumo_id}-${k}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{i.nombre}</span>
                    <span className="text-xs text-carbon/55">
                      {fechaCorta(i.fecha)} · {formatCosteUnitario(Number(i.antes), i.unidad)} → {formatCosteUnitario(Number(i.despues), i.unidad)} · {i.productos}{' '}
                      {i.productos === 1 ? 'producto' : 'productos'}
                    </span>
                  </span>
                  {i.variacion_pct !== null && (
                    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${Number(i.variacion_pct) > 0 ? 'text-vino' : 'text-[#1f4a2b]'}`}>
                      {Number(i.variacion_pct) > 0 ? <TrendingUp size={15} aria-hidden="true" /> : <TrendingDown size={15} aria-hidden="true" />}
                      {pctSigno.format(Number(i.variacion_pct))} %
                    </span>
                  )}
                </li>
              ))}
            </Lista>
            <Lista titulo="Cambios de precio en la carta" vacio="Ningún cambio en este periodo.">
              {resumen.precios_carta.map((p, k) => (
                <li key={`${p.product_id}-${k}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="truncate font-semibold">{p.nombre}</span>
                  <span className="text-xs tabular-nums text-carbon/70">
                    {fechaCorta(p.fecha)} · {p.antes !== null ? formatEur(p.antes / 100) : '—'} → <strong>{p.despues !== null ? formatEur(p.despues / 100) : 'sin precio'}</strong>
                  </span>
                </li>
              ))}
            </Lista>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: ReactNode }) {
  return (
    <div className="rounded-r-lg border border-piedra/50 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-carbon/60">{titulo}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-carbon">{valor}</p>
      <div className="mt-1 text-xs text-carbon/60">{detalle}</div>
    </div>
  );
}

function Lista({ titulo, vacio, children }: { titulo: string; vacio: string; children: ReactNode[] }) {
  return (
    <div>
      <h3 className="font-display text-xl font-semibold text-vino">{titulo}</h3>
      {children.length === 0 ? (
        <p className="mt-2 text-sm text-carbon/60">{vacio}</p>
      ) : (
        <ul className="mt-2 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">{children}</ul>
      )}
    </div>
  );
}
