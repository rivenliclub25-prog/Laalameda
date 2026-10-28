import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, Loader2, RefreshCw, Ticket, Undo2 } from 'lucide-react';
import { Notice, SubmitButton, TextField, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { fetchAppSettings, jornadaInicio } from '@/lib/adminTickets';
import { centsToInput } from '@/lib/adminCatalog';
import { parseEurosToCents } from '@/lib/tickets';
import type { AdminUser } from '@/lib/admin';
import {
  METODOS,
  TIPOS_PROMO,
  devolverVenta,
  devueltoVenta,
  fetchEventosCuenta,
  fetchVentas,
  formatEuros,
  resumenVentas,
  type Metodo,
  type PosEvento,
  type Venta,
} from '@/lib/pos';

type Preset = 'hoy' | '7' | '30' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoy', label: 'Jornada de hoy' },
  { id: '7', label: 'Últimos 7 días' },
  { id: '30', label: 'Últimos 30 días' },
  { id: 'custom', label: 'Fechas…' },
];

const EVENTOS: Record<string, string> = {
  abierta: 'Cuenta abierta',
  linea_anadida: 'Añadido',
  linea_aceptada: 'Aceptado',
  linea_servida: 'Servido',
  linea_anulada: 'Anulado',
  pagada: 'Cobrada',
  cancelada: 'Cancelada',
  devuelta: 'Devolución',
  mesa_cambiada: 'Cambio de mesa',
};

function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function origenTexto(v: Venta) {
  return v.orders?.origen === 'mesa' ? `Mesa · ${v.orders.mesas?.nombre ?? '—'}` : 'Barra';
}

function detalleEvento(e: PosEvento): string {
  const d = e.detalle ?? {};
  const partes: string[] = [];
  if (typeof d.producto === 'string') partes.push(`${typeof d.cantidad === 'number' ? `${d.cantidad} × ` : ''}${d.producto}`);
  if (typeof d.notas === 'string' && d.notas) partes.push(`«${d.notas}»`);
  if (typeof d.motivo === 'string') partes.push(`Motivo: ${d.motivo}`);
  if (typeof d.importe_centimos === 'number') partes.push(formatEuros(d.importe_centimos));
  if (typeof d.total_centimos === 'number') partes.push(formatEuros(d.total_centimos));
  if (typeof d.metodo === 'string' && d.metodo in METODOS) partes.push(METODOS[d.metodo as Metodo]);
  if (typeof d.de === 'string' && typeof d.a === 'string') partes.push(`${d.de} → ${d.a}`);
  if (typeof d.mesa === 'string') partes.push(d.mesa);
  return partes.join(' · ');
}

/** Pestaña "Ventas": neto por método para cuadrar la caja, ventas con líneas, registro y devoluciones. */
export function VentasSection({ users }: { users: AdminUser[] }) {
  const [preset, setPreset] = useState<Preset>('hoy');
  const [desde, setDesde] = useState(() => localDate(new Date()));
  const [hasta, setHasta] = useState(() => localDate(new Date()));
  const [horaCierre, setHoraCierre] = useState<string | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Record<string, PosEvento[]>>({});
  const [devolviendo, setDevolviendo] = useState<Venta | null>(null);

  const nombre = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.nombre || u.email]));
    return (id: string | null) => (id ? (map.get(id) ?? 'Cuenta borrada') : '—');
  }, [users]);

  useEffect(() => {
    fetchAppSettings().then(({ settings }) => setHoraCierre(settings?.hora_cierre ?? '03:00:00'));
  }, []);

  const range = useMemo((): { from: Date; to: Date } | null => {
    const now = new Date();
    const end = new Date(now.getTime() + 60_000);
    if (preset === 'hoy') return horaCierre ? { from: jornadaInicio(horaCierre, now), to: end } : null;
    if (preset === '7') return { from: new Date(now.getTime() - 7 * 86_400_000), to: end };
    if (preset === '30') return { from: new Date(now.getTime() - 30 * 86_400_000), to: end };
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

  const toggle = async (v: Venta) => {
    const open = abierta === v.id ? null : v.id;
    setAbierta(open);
    if (open && !eventos[v.order_id]) {
      const r = await fetchEventosCuenta(v.order_id);
      setEventos((prev) => ({ ...prev, [v.order_id]: r.eventos }));
    }
  };

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
          {/* Para cuadrar la caja: neto = cobrado − devuelto (las cuentas canceladas no generan venta) */}
          <section aria-label="Resumen" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Neto"
              value={formatEuros(resumen.neto)}
              hint={`${resumen.n} ventas · cobrado ${formatEuros(resumen.total)}${resumen.devuelto ? ` · devuelto ${formatEuros(resumen.devuelto)}` : ''}${resumen.descuentos ? ` · ahorro en promos ${formatEuros(resumen.descuentos)}` : ''}`}
              strong
            />
            {(Object.keys(METODOS) as Metodo[]).map((m) => {
              const pm = resumen.porMetodo[m];
              return (
                <Tile
                  key={m}
                  label={METODOS[m]}
                  value={formatEuros(pm.neto)}
                  hint={`${pm.n} ventas${pm.devuelto ? ` · devuelto ${formatEuros(pm.devuelto)}` : ''}`}
                />
              );
            })}
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
                const devuelto = devueltoVenta(v);
                const restante = v.total_centimos - devuelto;
                const lineas = v.orders?.order_items ?? [];
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => toggle(v)}
                      aria-expanded={open}
                      className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-marfil sm:grid-cols-[110px_1fr_100px_120px_24px] ${focusRing}`}
                    >
                      <span className="tabular-nums text-carbon/70">
                        {new Date(v.cobrado_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="hidden min-w-0 truncate text-carbon/70 sm:block">
                        nº {v.numero} · {origenTexto(v)} · {nombre(v.cobrado_por)}
                      </span>
                      <span className="hidden text-carbon/70 sm:block">{METODOS[v.metodo]}</span>
                      <span className="text-right tabular-nums">
                        <span className={`font-semibold ${devuelto ? 'text-carbon/50 line-through' : ''}`}>{formatEuros(v.total_centimos)}</span>
                        {devuelto > 0 && <span className="block text-xs font-semibold text-vino">neto {formatEuros(restante)}</span>}
                      </span>
                      <ChevronDown size={16} className={`hidden text-carbon/50 transition-transform sm:block ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      <span className="col-span-2 text-xs text-carbon/55 sm:hidden">
                        nº {v.numero} · {origenTexto(v)} · {METODOS[v.metodo]} · {nombre(v.cobrado_por)}
                      </span>
                    </button>
                    {open && (
                      <div className="space-y-4 border-t border-carbon/10 bg-marfil/60 px-4 py-3 text-sm">
                        {v.descuentos_centimos > 0 && (
                          <p className="text-xs text-carbon/60">
                            Sin promos habría sido {formatEuros(v.bruto_centimos)}: ahorro de {formatEuros(v.descuentos_centimos)}.
                          </p>
                        )}
                        <ul>
                          {lineas.map((l, i) => (
                            <li key={i} className={`flex justify-between gap-3 py-1 ${l.estado === 'anulada' ? 'text-carbon/45 line-through' : ''}`}>
                              <span>
                                {l.cantidad} × {l.nombre} <span className="text-carbon/50">({formatEuros(l.precio_unitario_centimos)})</span>
                                {l.notas && <span className="ml-1 italic text-carbon/55">«{l.notas}»</span>}
                                {l.estado === 'anulada' && <span className="ml-1 no-underline">· anulada</span>}
                                {l.tipo_linea !== 'producto' && (
                                  <span className="ml-1.5 inline-flex flex-wrap items-center gap-x-1 text-xs font-semibold text-vino">
                                    {TIPOS_PROMO[l.tipo_linea]}
                                    {l.ticket_codigo && (
                                      <>
                                        {' · '}
                                        <Ticket size={12} aria-hidden="true" /> {l.ticket_codigo}
                                      </>
                                    )}
                                    {l.descuento_centimos ? <span className="font-normal text-carbon/60">· ahorra {formatEuros(l.descuento_centimos)}</span> : null}
                                  </span>
                                )}
                              </span>
                              <span className="tabular-nums">{formatEuros(l.cantidad * l.precio_unitario_centimos)}</span>
                            </li>
                          ))}
                        </ul>

                        {(v.sale_refunds ?? []).length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-carbon/60">Devoluciones</h4>
                            <ul className="mt-1">
                              {v.sale_refunds.map((r) => (
                                <li key={r.id} className="flex justify-between gap-3 py-0.5 text-vino">
                                  <span>
                                    {new Date(r.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {r.motivo} · {nombre(r.por)}
                                  </span>
                                  <span className="tabular-nums">−{formatEuros(r.importe_centimos)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-carbon/60">Registro</h4>
                          {!eventos[v.order_id] ? (
                            <p className="mt-1 text-xs text-carbon/55" role="status">Cargando…</p>
                          ) : (
                            <ol className="mt-1 space-y-0.5 border-l-2 border-piedra/60 pl-3 text-xs text-carbon/70">
                              {eventos[v.order_id].map((e) => (
                                <li key={e.id}>
                                  <span className="tabular-nums">{new Date(e.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>{' '}
                                  <strong className="text-carbon">{EVENTOS[e.tipo] ?? e.tipo}</strong>
                                  {detalleEvento(e) ? ` · ${detalleEvento(e)}` : ''} · {nombre(e.actor)}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>

                        {restante > 0 && (
                          <button type="button" onClick={() => setDevolviendo(v)} className={`btn-outline-vino ${focusRing}`}>
                            <Undo2 size={16} aria-hidden="true" /> Devolver
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {devolviendo && (
        <DevolverModal
          venta={devolviendo}
          onClose={() => setDevolviendo(null)}
          onDone={async () => {
            setDevolviendo(null);
            setEventos((prev) => {
              const next = { ...prev };
              delete next[devolviendo.order_id];
              return next;
            });
            await load();
          }}
        />
      )}
    </>
  );
}

function DevolverModal({ venta, onClose, onDone }: { venta: Venta; onClose: () => void; onDone: () => void }) {
  const restante = venta.total_centimos - devueltoVenta(venta);
  const [importe, setImporte] = useState(centsToInput(restante));
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseEurosToCents(importe);
    if (!cents || cents <= 0) return setError('Escribe el importe a devolver, por ejemplo 2,50.');
    if (cents > restante) return setError(`No se puede devolver más de ${formatEuros(restante)}.`);
    if (!motivo.trim()) return setError('Escribe el motivo.');
    setSaving(true);
    setError(null);
    const r = await devolverVenta(venta.id, cents, motivo.trim());
    setSaving(false);
    if (r.data) onDone();
    else setError(r.error);
  };

  return (
    <Modal open title={`Devolver · venta nº ${venta.numero}`} onClose={onClose} busy={saving} maxWidth="460px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-carbon/75">
          Cobrado {formatEuros(venta.total_centimos)} ({METODOS[venta.metodo]}). Queda por devolver <strong>{formatEuros(restante)}</strong>. La
          devolución resta del neto y queda registrada; no se puede deshacer.
        </p>
        <TextField label="Importe a devolver (€)" value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" required />
        <TextField label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: caña en mal estado" required />
        {error && <Notice kind="error">{error}</Notice>}
        <SubmitButton loading={saving} loadingText="Devolviendo…">Devolver</SubmitButton>
      </form>
    </Modal>
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
