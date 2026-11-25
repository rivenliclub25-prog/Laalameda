import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, FileText, Loader2, Pencil, Receipt, XCircle } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { JustificanteModal } from '@/components/pos/Justificante';
import { justificanteDeVenta } from '@/lib/justificante';
import type { AdminUser } from '@/lib/admin';
import { METODOS, devueltoVenta, fetchVentasDeCuenta, formatEuros, type Venta } from '@/lib/pos';
import {
  ESTADOS_EVENTO,
  REGISTRO_TEXTO,
  cancelarEvento,
  confirmarEvento,
  fechaLarga,
  fetchLineasCuenta,
  fetchRegistroEvento,
  horaCorta,
  nombreItem,
  pendientePlazos,
  type Evento,
  type LineaCuentaEvento,
  type RegistroEvento,
} from '@/lib/eventos';
import { HojaEventoModal } from '@/components/admin/eventos/HojaEvento';

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Detalle de un evento (Panel → Eventos): datos, contenido, plazos (cobrado o pendiente), extras de su
 * cuenta, cobros con su justificante y registro. Acciones: editar, confirmar, cancelar y hoja para el cliente.
 */
export function EventoDetalle({
  evento,
  users,
  onClose,
  onEditar,
  onCambiado,
}: {
  evento: Evento;
  users: AdminUser[];
  onClose: () => void;
  onEditar: () => void;
  onCambiado: (aviso?: string) => void;
}) {
  const [lineas, setLineas] = useState<LineaCuentaEvento[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [registro, setRegistro] = useState<RegistroEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<'confirmar' | 'cancelar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [accionError, setAccionError] = useState<string | null>(null);
  const [hoja, setHoja] = useState(false);
  const [justificante, setJustificante] = useState<Venta | null>(null);

  const nombre = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.nombre || u.email]));
    return (id: string | null) => (id ? map.get(id) ?? 'Alguien del equipo' : '—');
  }, [users]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [l, v, r] = await Promise.all([
      evento.order_id ? fetchLineasCuenta(evento.order_id) : Promise.resolve({ lineas: [], error: null }),
      evento.order_id ? fetchVentasDeCuenta(evento.order_id) : Promise.resolve({ ventas: [], error: null }),
      fetchRegistroEvento(evento.id, evento.order_id),
    ]);
    setLineas(l.lineas);
    setVentas(v.ventas);
    setRegistro(r.registro);
    setError(l.error ?? v.error ?? r.error);
    setLoading(false);
  }, [evento.id, evento.order_id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const extras = lineas.filter((l) => l.tipo_linea !== 'evento');
  const pendiente = pendientePlazos(evento);
  const extrasPendientes = extras
    .filter((l) => !l.sale_id && l.estado !== 'anulada')
    .reduce((s, l) => s + l.cantidad * l.precio_unitario_centimos, 0);
  const editable = evento.estado === 'borrador' || evento.estado === 'confirmado';
  const est = ESTADOS_EVENTO[evento.estado];

  const ejecutar = async () => {
    setAccionError(null);
    if (accion === 'cancelar' && !motivo.trim()) return setAccionError('Escribe el motivo de la cancelación.');
    setBusy(true);
    const r = accion === 'confirmar' ? await confirmarEvento(evento.id) : await cancelarEvento(evento.id, motivo.trim());
    setBusy(false);
    if (r.error) return setAccionError(r.error);
    setAccion(null);
    onCambiado(accion === 'confirmar' ? 'Evento confirmado: su cuenta ya está en el TPV.' : 'Evento cancelado.');
  };

  return (
    <>
    <Modal open={!hoja && !justificante} title={evento.nombre} onClose={onClose} busy={busy} maxWidth="760px">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${est.clase}`}>{est.texto}</span>
          <span className="text-sm text-carbon/75">
            {fechaLarga(evento.fecha)}
            {evento.hora_inicio ? `, ${horaCorta(evento.hora_inicio)}` : ''}
            {evento.personas ? ` · unas ${evento.personas} personas` : ''}
          </span>
        </div>

        {evento.estado === 'cancelado' && evento.motivo_cancelacion && (
          <Notice kind="info">Cancelado: {evento.motivo_cancelacion}</Notice>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap gap-2">
          {editable && (
            <button type="button" onClick={onEditar} className={`btn-outline-vino ${focusRing}`}>
              <Pencil size={16} aria-hidden="true" /> Editar
            </button>
          )}
          {evento.estado === 'borrador' && (
            <button type="button" onClick={() => setAccion('confirmar')} className={`btn-vino ${focusRing}`}>
              <CalendarCheck size={16} aria-hidden="true" /> Confirmar
            </button>
          )}
          {evento.estado !== 'cancelado' && evento.items.length + evento.plazos.length > 0 && (
            <button type="button" onClick={() => setHoja(true)} className={`btn-outline-vino ${focusRing}`}>
              <FileText size={16} aria-hidden="true" /> Hoja para el cliente
            </button>
          )}
          {editable && (
            <button type="button" onClick={() => setAccion('cancelar')} className={`btn-outline-vino ${focusRing}`}>
              <XCircle size={16} aria-hidden="true" /> Cancelar evento
            </button>
          )}
        </div>

        {accion && (
          <div className="rounded-r-md border border-vino/30 bg-vino/5 p-4" role="group" aria-label={accion === 'confirmar' ? 'Confirmar evento' : 'Cancelar evento'}>
            {accion === 'confirmar' ? (
              <p className="text-sm text-carbon/80">
                Se abre su cuenta en el TPV con {evento.plazos.length === 1 ? 'el plazo' : `los ${evento.plazos.length} plazos`} para cobrarlos cuando
                llegue cada uno. Después se puede seguir editando lo que no esté cobrado.
              </p>
            ) : (
              <>
                <p className="text-sm text-carbon/80">
                  {evento.cobrado_centimos > 0
                    ? `Ya hay ${formatEuros(evento.cobrado_centimos)} cobrados: se quedan cobrados. Si hay que devolver algo, se hace desde Ventas (devolución). `
                    : ''}
                  Lo pendiente se anula y su cuenta se cierra.
                </p>
                <label className="mt-3 block text-xs font-semibold text-carbon/80">
                  Motivo
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={200}
                    placeholder="El cliente lo ha anulado"
                    className={`mt-1 h-11 w-full rounded-r-sm border border-carbon/20 bg-white px-3 text-sm ${focusRing}`}
                  />
                </label>
              </>
            )}
            {accionError && (
              <div className="mt-3">
                <Notice kind="error">{accionError}</Notice>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setAccion(null); setAccionError(null); }} disabled={busy} className={`btn-outline-vino ${focusRing}`}>
                Volver
              </button>
              <button type="button" onClick={ejecutar} disabled={busy} className={`btn-vino ${focusRing}`}>
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {accion === 'confirmar' ? 'Sí, confirmar' : 'Sí, cancelar el evento'}
              </button>
            </div>
          </div>
        )}

        {/* Datos */}
        {(evento.contacto_nombre || evento.contacto_telefono || evento.socio_id || evento.notas) && (
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {(evento.contacto_nombre || evento.contacto_telefono) && (
              <>
                <dt className="font-semibold text-carbon/70">Contacto</dt>
                <dd>{[evento.contacto_nombre, evento.contacto_telefono].filter(Boolean).join(' · ')}</dd>
              </>
            )}
            {evento.socio_id && (
              <>
                <dt className="font-semibold text-carbon/70">Socio</dt>
                <dd>{nombre(evento.socio_id)}</dd>
              </>
            )}
            {evento.notas && (
              <>
                <dt className="font-semibold text-carbon/70">Notas</dt>
                <dd className="whitespace-pre-line">{evento.notas}</dd>
              </>
            )}
          </dl>
        )}

        <section aria-labelledby="det-incluye">
          <h3 id="det-incluye" className="font-display text-lg font-semibold text-vino">Incluye</h3>
          {evento.items.length === 0 ? (
            <p className="text-sm text-carbon/60">Sin contenido apuntado.</p>
          ) : (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {evento.items.map((i) => (
                <li key={i.id}>
                  {i.cantidad} × {nombreItem(i)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="det-plazos" className="rounded-r-md border border-piedra/60 bg-piedra-suave/30 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="det-plazos" className="font-display text-lg font-semibold text-vino">Precio cerrado</h3>
            <span className="font-display text-xl font-semibold tabular-nums">{formatEuros(evento.precio_centimos)}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {evento.plazos.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {p.nombre}
                  {p.venta ? (
                    <span className="ml-2 text-xs font-semibold text-[#1f4a2b]">
                      Cobrado · venta nº {p.venta.numero} · {METODOS[p.venta.metodo]}
                    </span>
                  ) : (
                    <span className="ml-2 text-xs font-semibold text-[#7a4e00]">{evento.estado === 'cancelado' ? 'Anulado' : 'Pendiente'}</span>
                  )}
                </span>
                <span className="tabular-nums">{formatEuros(p.importe_centimos)}</span>
              </li>
            ))}
          </ul>
          {evento.estado !== 'cancelado' && (
            <p className="mt-2 text-sm text-carbon/75">
              Pendiente de los plazos: <strong className="tabular-nums">{formatEuros(pendiente)}</strong>
              {evento.estado === 'borrador' ? ' · se cobra en el TPV cuando esté confirmado' : ''}
            </p>
          )}
        </section>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-carbon/60">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando cuenta y registro…
          </p>
        ) : (
          <>
            {error && <Notice kind="error">{error}</Notice>}

            {evento.order_id && (
              <section aria-labelledby="det-extras">
                <h3 id="det-extras" className="font-display text-lg font-semibold text-vino">Extras fuera del precio</h3>
                {extras.length === 0 ? (
                  <p className="text-sm text-carbon/60">Ninguno. Lo que se añada desde el TPV a su cuenta saldrá aquí.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {extras.map((l) => (
                      <li key={l.id} className={`flex justify-between gap-2 ${l.estado === 'anulada' ? 'text-carbon/45 line-through' : ''}`}>
                        <span>
                          {l.cantidad} × {l.nombre}
                          {l.estado !== 'anulada' && <span className="ml-2 text-xs text-carbon/60">{l.sale_id ? 'cobrado' : 'pendiente'}</span>}
                        </span>
                        <span className="tabular-nums">{formatEuros(l.cantidad * l.precio_unitario_centimos)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {extrasPendientes > 0 && (
                  <p className="mt-1 text-sm text-carbon/75">
                    Extras pendientes: <strong className="tabular-nums">{formatEuros(extrasPendientes)}</strong>
                  </p>
                )}
              </section>
            )}

            {ventas.length > 0 && (
              <section aria-labelledby="det-cobros">
                <h3 id="det-cobros" className="font-display text-lg font-semibold text-vino">Cobros</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {ventas.map((v) => {
                    const dev = devueltoVenta(v);
                    return (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Venta nº {v.numero} · {fechaHora(v.cobrado_at)} · {METODOS[v.metodo]} · {nombre(v.cobrado_por)}
                          {dev > 0 && <span className="ml-2 text-xs font-semibold text-vino">devuelto {formatEuros(dev)}</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums font-semibold">{formatEuros(v.total_centimos)}</span>
                          <button
                            type="button"
                            onClick={() => setJustificante(v)}
                            aria-label={`Justificante de la venta ${v.numero}`}
                            className={`flex h-9 w-9 items-center justify-center rounded-r-sm border border-carbon/15 text-carbon/70 ${focusRing}`}
                          >
                            <Receipt size={16} />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-sm text-carbon/75">
                  Total cobrado: <strong className="tabular-nums">{formatEuros(evento.cobrado_centimos - evento.devuelto_centimos)}</strong>
                  {evento.devuelto_centimos > 0 ? ` (descontando ${formatEuros(evento.devuelto_centimos)} devueltos)` : ''}
                </p>
              </section>
            )}

            {registro.length > 0 && (
              <section aria-labelledby="det-registro">
                <h3 id="det-registro" className="font-display text-lg font-semibold text-vino">Registro</h3>
                <ol className="mt-1 space-y-0.5 text-xs text-carbon/75">
                  {registro.map((r) => (
                    <li key={r.id}>
                      {fechaHora(r.at)} · {REGISTRO_TEXTO[r.tipo] ?? r.tipo}
                      {typeof r.detalle?.nombre === 'string' && r.tipo.startsWith('linea') ? ` · ${r.detalle.nombre}` : ''}
                      {typeof r.detalle?.motivo === 'string' ? ` · ${r.detalle.motivo}` : ''} · {nombre(r.actor)}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
    {hoja && <HojaEventoModal evento={evento} onClose={() => setHoja(false)} />}
    {justificante && <JustificanteModal datos={justificanteDeVenta(justificante)} onClose={() => setJustificante(null)} />}
    </>
  );
}
