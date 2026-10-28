import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { fetchAppSettings, jornadaInicio } from '@/lib/adminTickets';
import { csvEuros } from '@/lib/csv';
import { METODOS, TIPOS_PROMO, formatEuros, type Metodo } from '@/lib/pos';
import { addDays, downloadTablaCsv, fetchInforme, formatJornada, isoDate, type Informe } from '@/lib/informes';

type Preset = 'hoy' | 'ayer' | '7' | 'mes' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoy', label: 'Jornada de hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: '7', label: 'Últimos 7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'custom', label: 'Fechas…' },
];

interface Columna<T> {
  label: string;
  /** Texto en pantalla. */
  show: (row: T) => ReactNode;
  /** Valor en el CSV (números con coma decimal para Excel). */
  csv: (row: T) => string | number;
  right?: boolean;
}

/** Tabla del informe con su botón de CSV. */
function Tabla<T>({ titulo, archivo, filas, columnas, vacio }: { titulo: string; archivo: string; filas: T[]; columnas: Columna<T>[]; vacio: string }) {
  return (
    <section className="rounded-r-lg border border-piedra/50 bg-white shadow-sm" aria-label={titulo}>
      <header className="flex items-center justify-between gap-3 border-b border-carbon/10 px-4 py-3">
        <h3 className="font-display text-xl font-semibold text-vino">{titulo}</h3>
        <button
          type="button"
          disabled={filas.length === 0}
          onClick={() => downloadTablaCsv(archivo, columnas.map((c) => c.label), filas.map((f) => columnas.map((c) => c.csv(f))))}
          className={`inline-flex items-center gap-1 rounded-r-sm text-xs font-semibold text-carbon/60 hover:text-vino disabled:opacity-40 ${focusRing}`}
        >
          <Download size={14} aria-hidden="true" /> CSV
        </button>
      </header>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-carbon/55">{vacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-carbon/55">
                {columnas.map((c) => (
                  <th key={c.label} scope="col" className={`whitespace-nowrap px-4 py-2 font-semibold ${c.right ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon/10">
              {filas.map((f, i) => (
                <tr key={i}>
                  {columnas.map((c) => (
                    <td key={c.label} className={`px-4 py-2 ${c.right ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                      {c.show(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-r-lg border p-4 shadow-sm ${strong ? 'border-vino bg-vino text-white' : 'border-piedra/50 bg-white'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${strong ? 'text-white/80' : 'text-carbon/55'}`}>{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className={`mt-0.5 text-xs ${strong ? 'text-white/80' : 'text-carbon/55'}`}>{hint}</p>}
    </div>
  );
}

const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)} %` : '—');

/** Panel → Ventas → Informes: qué se vende, quién cobra y cuándo, en un periodo de jornadas. */
export function InformesView() {
  const [preset, setPreset] = useState<Preset>('hoy');
  const [hoy, setHoy] = useState<string | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [informe, setInforme] = useState<Informe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // La jornada de hoy depende de la hora de cierre del bar (p. ej. a las 2:00 sigue siendo «ayer»).
  useEffect(() => {
    fetchAppSettings().then(({ settings }) => {
      const j = isoDate(jornadaInicio(settings?.hora_cierre ?? '03:00:00'));
      setHoy(j);
      setDesde(j);
      setHasta(j);
    });
  }, []);

  const range = useMemo((): { desde: string; hasta: string } | null => {
    if (!hoy) return null;
    if (preset === 'hoy') return { desde: hoy, hasta: hoy };
    if (preset === 'ayer') return { desde: addDays(hoy, -1), hasta: addDays(hoy, -1) };
    if (preset === '7') return { desde: addDays(hoy, -6), hasta: hoy };
    if (preset === 'mes') return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
    return desde && hasta && desde <= hasta ? { desde, hasta } : null;
  }, [preset, hoy, desde, hasta]);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchInforme(range.desde, range.hasta);
    setInforme(data);
    setError(err);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const sufijo = range ? (range.desde === range.hasta ? range.desde : `${range.desde}_${range.hasta}`) : '';
  const caja = informe?.caja;
  const vendidoLineas = informe ? informe.comprobacion.suma_lineas_centimos : 0;
  const maxHora = Math.max(1, ...(informe?.por_hora ?? []).map((h) => h.cobrado_centimos));

  return (
    <>
      <div className="flex flex-col gap-3 rounded-r-lg border border-piedra/50 bg-white/80 p-4 shadow-sm sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span id="informe-periodo" className="mb-2 block text-xs font-semibold text-carbon/80">Periodo (por jornadas)</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="informe-periodo">
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
                <label htmlFor="informe-desde" className="mb-1 block text-xs font-semibold text-carbon/80">Desde</label>
                <input id="informe-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className="rounded-r-sm border border-carbon/25 bg-white px-3 py-2 text-base outline-none focus:border-vino sm:text-sm" />
              </div>
              <div>
                <label htmlFor="informe-hasta" className="mb-1 block text-xs font-semibold text-carbon/80">Hasta (incluida)</label>
                <input id="informe-hasta" type="date" value={hasta} min={desde || undefined} max={hoy ?? undefined} onChange={(e) => setHasta(e.target.value)} className="rounded-r-sm border border-carbon/25 bg-white px-3 py-2 text-base outline-none focus:border-vino sm:text-sm" />
              </div>
            </div>
          )}
          {range && (
            <p className="mt-2 text-xs capitalize text-carbon/55">
              {range.desde === range.hasta ? formatJornada(range.desde, true) : `${formatJornada(range.desde)} – ${formatJornada(range.hasta, true)}`}
            </p>
          )}
        </div>
        <button type="button" onClick={load} disabled={loading || !range} className={`btn-outline-vino self-start disabled:opacity-60 lg:self-auto ${focusRing}`}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
        </button>
      </div>

      {loading && !informe ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Preparando el informe…
        </div>
      ) : error ? (
        <div className="mt-6">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : informe && caja ? (
        <div className={`mt-6 space-y-6 ${loading ? 'opacity-60' : ''}`}>
          <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Neto" value={formatEuros(caja.neto_centimos)} hint="Cobrado − devuelto" strong />
            <Tile label="Cobrado" value={formatEuros(caja.cobrado_centimos)} hint={`${caja.ventas} ventas · media ${formatEuros(caja.ventas ? Math.round(caja.cobrado_centimos / caja.ventas) : 0)}`} />
            <Tile label="Devuelto" value={formatEuros(caja.devuelto_centimos)} hint={`${caja.devoluciones} devoluciones hechas en el periodo`} />
            <Tile label="Ahorro en promos" value={formatEuros(caja.descuentos_centimos)} hint={`${caja.anuladas} líneas anuladas (${formatEuros(caja.anuladas_centimos)})`} />
          </section>

          <p className={`flex items-center gap-2 text-sm font-semibold ${informe.comprobacion.cuadra ? 'text-[#1f4a2b]' : 'text-vino'}`}>
            {informe.comprobacion.cuadra ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            {informe.comprobacion.cuadra
              ? `Cuadra: la suma de lo vendido (${formatEuros(vendidoLineas)}) es igual a lo cobrado.`
              : `No cuadra: lo vendido suma ${formatEuros(vendidoLineas)} y lo cobrado ${formatEuros(informe.comprobacion.cobrado_centimos)}. Avisa al desarrollador.`}
          </p>

          <div className="grid gap-6 xl:grid-cols-2">
            <Tabla
              titulo="Por método de pago"
              archivo={`informe-metodos-${sufijo}`}
              filas={(Object.keys(METODOS) as Metodo[]).map((m) => ({ m, ...caja.por_metodo[m] }))}
              vacio="Sin ventas."
              columnas={[
                { label: 'Método', show: (r) => METODOS[r.m], csv: (r) => METODOS[r.m] },
                { label: 'Ventas', show: (r) => r.ventas, csv: (r) => r.ventas, right: true },
                { label: 'Cobrado', show: (r) => formatEuros(r.cobrado_centimos), csv: (r) => csvEuros(r.cobrado_centimos), right: true },
                { label: 'Devuelto', show: (r) => formatEuros(r.devuelto_centimos), csv: (r) => csvEuros(r.devuelto_centimos), right: true },
                { label: 'Neto', show: (r) => <strong>{formatEuros(r.neto_centimos)}</strong>, csv: (r) => csvEuros(r.neto_centimos), right: true },
              ]}
            />

            <section className="rounded-r-lg border border-piedra/50 bg-white shadow-sm" aria-label="Por hora">
              <header className="flex items-center justify-between gap-3 border-b border-carbon/10 px-4 py-3">
                <h3 className="font-display text-xl font-semibold text-vino">Por hora</h3>
                <button
                  type="button"
                  disabled={informe.por_hora.length === 0}
                  onClick={() =>
                    downloadTablaCsv(`informe-horas-${sufijo}`, ['Hora', 'Ventas', 'Cobrado (€)'], informe.por_hora.map((h) => [`${String(h.hora).padStart(2, '0')}:00`, h.ventas, csvEuros(h.cobrado_centimos)]))
                  }
                  className={`inline-flex items-center gap-1 rounded-r-sm text-xs font-semibold text-carbon/60 hover:text-vino disabled:opacity-40 ${focusRing}`}
                >
                  <Download size={14} aria-hidden="true" /> CSV
                </button>
              </header>
              {informe.por_hora.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-carbon/55">Sin ventas.</p>
              ) : (
                <ul className="space-y-1.5 px-4 py-3 text-sm">
                  {informe.por_hora.map((h) => (
                    <li key={h.hora} className="grid grid-cols-[48px_1fr_88px] items-center gap-2">
                      <span className="tabular-nums text-carbon/60">{String(h.hora).padStart(2, '0')}:00</span>
                      <span className="h-4 rounded-sm bg-piedra-suave">
                        <span className="block h-4 rounded-sm bg-vino" style={{ width: `${Math.max(2, (h.cobrado_centimos / maxHora) * 100)}%` }} />
                      </span>
                      <span className="text-right tabular-nums">
                        {formatEuros(h.cobrado_centimos)} <span className="text-xs text-carbon/50">({h.ventas})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <Tabla
            titulo="Por producto"
            archivo={`informe-productos-${sufijo}`}
            filas={informe.productos}
            vacio="No se ha vendido ningún producto."
            columnas={[
              { label: 'Código', show: (r) => <span className="text-carbon/55">#{r.id}</span>, csv: (r) => r.id },
              { label: 'Producto', show: (r) => r.nombre, csv: (r) => r.nombre },
              { label: 'Unidades', show: (r) => r.unidades, csv: (r) => r.unidades, right: true },
              { label: 'Importe', show: (r) => formatEuros(r.importe_centimos), csv: (r) => csvEuros(r.importe_centimos), right: true },
              { label: '% de lo vendido', show: (r) => pct(r.importe_centimos, vendidoLineas), csv: (r) => pct(r.importe_centimos, vendidoLineas), right: true },
            ]}
          />

          <Tabla
            titulo="Por promo"
            archivo={`informe-promos-${sufijo}`}
            filas={informe.promos}
            vacio="No se ha vendido ninguna promo."
            columnas={[
              { label: 'Promo', show: (r) => r.nombre, csv: (r) => r.nombre },
              { label: 'Tipo', show: (r) => TIPOS_PROMO[r.tipo] ?? r.tipo, csv: (r) => TIPOS_PROMO[r.tipo] ?? r.tipo },
              { label: 'Usos', show: (r) => r.usos, csv: (r) => r.usos, right: true },
              { label: 'Con ticket', show: (r) => r.con_ticket, csv: (r) => r.con_ticket, right: true },
              { label: 'Importe', show: (r) => formatEuros(r.importe_centimos), csv: (r) => csvEuros(r.importe_centimos), right: true },
              { label: 'Ahorro clientes', show: (r) => formatEuros(r.ahorro_centimos), csv: (r) => csvEuros(r.ahorro_centimos), right: true },
            ]}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <Tabla
              titulo="Por camarero"
              archivo={`informe-camareros-${sufijo}`}
              filas={informe.camareros}
              vacio="Sin ventas ni anulaciones."
              columnas={[
                { label: 'Camarero', show: (r) => r.nombre, csv: (r) => r.nombre },
                { label: 'Ventas', show: (r) => r.ventas, csv: (r) => r.ventas, right: true },
                { label: 'Cobrado', show: (r) => formatEuros(r.cobrado_centimos), csv: (r) => csvEuros(r.cobrado_centimos), right: true },
                { label: 'Anulaciones', show: (r) => r.anulaciones || '—', csv: (r) => r.anulaciones, right: true },
                { label: 'Anulado', show: (r) => (r.anulaciones ? formatEuros(r.anulado_centimos) : '—'), csv: (r) => csvEuros(r.anulado_centimos), right: true },
              ]}
            />

            <Tabla
              titulo="Motivos de anulación"
              archivo={`informe-anulaciones-${sufijo}`}
              filas={informe.anulaciones}
              vacio="No se ha anulado nada."
              columnas={[
                { label: 'Motivo', show: (r) => r.motivo, csv: (r) => r.motivo },
                { label: 'Veces', show: (r) => r.veces, csv: (r) => r.veces, right: true },
                { label: 'Importe', show: (r) => formatEuros(r.importe_centimos), csv: (r) => csvEuros(r.importe_centimos), right: true },
              ]}
            />
          </div>

          <Tabla
            titulo="Por socio"
            archivo={`informe-socios-${sufijo}`}
            filas={informe.socios}
            vacio="Ningún socio ha pedido desde la mesa ni ha usado promos del club."
            columnas={[
              { label: 'Socio', show: (r) => r.nombre, csv: (r) => r.nombre },
              { label: 'Cuentas', show: (r) => r.cuentas, csv: (r) => r.cuentas, right: true },
              { label: 'Gasto', show: (r) => formatEuros(r.importe_centimos), csv: (r) => csvEuros(r.importe_centimos), right: true },
              { label: 'Promos del club', show: (r) => r.promos_con_ticket, csv: (r) => r.promos_con_ticket, right: true },
              { label: 'Ahorro', show: (r) => formatEuros(r.ahorro_centimos), csv: (r) => csvEuros(r.ahorro_centimos), right: true },
            ]}
          />
          <p className="text-xs text-carbon/55">
            «Por socio» cuenta lo que cada socio pidió desde su mesa y las promos del club en las que se usó su ticket. Lo que el camarero añade sin ticket no se atribuye a nadie.
          </p>
        </div>
      ) : null}
    </>
  );
}
