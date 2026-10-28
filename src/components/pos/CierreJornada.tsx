import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Printer } from 'lucide-react';
import { Notice, SubmitButton, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { METODOS, formatEuros, type Metodo } from '@/lib/pos';
import { parseEurosToCents } from '@/lib/tickets';
import {
  cerrarJornada,
  fetchEstadoJornada,
  fetchJornadasSinCerrar,
  formatJornada,
  printArea,
  textoDescuadre,
  type Cierre,
  type EstadoJornada,
  type JornadaSinCerrar,
  type ResumenCaja,
} from '@/lib/informes';

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Hoja del cierre (o del estado de una jornada aún sin cerrar): lo que se imprime y se guarda.
 * Las devoluciones son las hechas ese día; el efectivo esperado es el neto en efectivo.
 */
export function HojaCierre({
  jornada,
  resumen,
  cierre,
  cerradoPor,
}: {
  jornada: string;
  resumen: ResumenCaja;
  cierre?: Cierre | null;
  cerradoPor?: string | null;
}) {
  const descuadre = textoDescuadre(cierre?.descuadre_centimos ?? null);
  const fila = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 py-1 ${strong ? 'font-semibold text-carbon' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <div className="text-sm text-carbon/85">
      <p className="text-xs font-semibold uppercase tracking-wider text-carbon/55">La Alameda · Cierre de jornada</p>
      <h3 className="mt-1 font-display text-2xl font-semibold capitalize text-vino">{formatJornada(jornada, true)}</h3>
      {cierre && (
        <p className="mt-1 text-xs text-carbon/60">
          {cierre.version > 1 ? `Versión ${cierre.version} · ` : ''}Cerrado el {new Date(cierre.cerrado_at).toLocaleString('es-ES')}
          {cerradoPor ? ` por ${cerradoPor}` : ''}
        </p>
      )}
      <dl className="mt-3 divide-y divide-carbon/10 border-y border-carbon/15">
        {fila('Ventas', String(resumen.ventas))}
        {(Object.keys(METODOS) as Metodo[]).map((m) => {
          const pm = resumen.por_metodo[m];
          if (!pm.ventas && !pm.devuelto_centimos) return null;
          return (
            <div key={m} className="py-1">
              <div className="flex justify-between gap-3">
                <dt>{METODOS[m]}</dt>
                <dd className="tabular-nums">{formatEuros(pm.neto_centimos)}</dd>
              </div>
              {pm.devuelto_centimos > 0 && (
                <p className="text-xs text-carbon/55">
                  {pm.ventas} ventas · {formatEuros(pm.cobrado_centimos)} cobrado − {formatEuros(pm.devuelto_centimos)} devuelto
                </p>
              )}
            </div>
          );
        })}
        {fila('Cobrado', formatEuros(resumen.cobrado_centimos))}
        {resumen.devuelto_centimos > 0 && fila(`Devoluciones hechas hoy (${resumen.devoluciones})`, `− ${formatEuros(resumen.devuelto_centimos)}`)}
        {fila('Neto', formatEuros(resumen.neto_centimos), true)}
        {resumen.descuentos_centimos > 0 && fila('Ahorro de los clientes en promos', formatEuros(resumen.descuentos_centimos))}
        {resumen.anuladas > 0 && fila(`Líneas anuladas (${resumen.anuladas})`, formatEuros(resumen.anuladas_centimos))}
      </dl>
      <dl className="mt-3 rounded-r-sm bg-piedra-suave/60 px-3 py-2">
        {fila('Efectivo que debería haber', formatEuros(resumen.por_metodo.efectivo.neto_centimos), true)}
        {cierre?.efectivo_contado_centimos !== null && cierre?.efectivo_contado_centimos !== undefined && (
          <>
            {fila('Efectivo contado', formatEuros(cierre.efectivo_contado_centimos))}
            {descuadre && (
              <div className={`flex justify-between gap-3 py-1 font-semibold ${descuadre.className}`}>
                <dt>Descuadre</dt>
                <dd>{descuadre.text}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      {cierre?.notas && <p className="mt-2 text-xs italic text-carbon/65">Notas: {cierre.notas}</p>}
    </div>
  );
}

/** Cerrar jornada (TPV y panel): elige la jornada, revisa el resumen, cuenta el efectivo y cierra. */
export function CierreJornadaModal({ onClose, onClosed }: { onClose: () => void; onClosed?: (c: Cierre) => void }) {
  const [jornadas, setJornadas] = useState<JornadaSinCerrar[] | null>(null);
  const [jornada, setJornada] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoJornada | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [efectivo, setEfectivo] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [hecho, setHecho] = useState<Cierre | null>(null);

  useEffect(() => {
    fetchJornadasSinCerrar().then(({ data, error: err }) => {
      if (err || !data) {
        setError(err);
        setLoading(false);
        return;
      }
      setJornadas(data);
      // Por defecto, la jornada más reciente con ventas sin cerrar; si no, la actual.
      const sugerida = data.find((j) => !j.cerrada && j.ventas > 0) ?? data.find((j) => j.actual) ?? data[0];
      setJornada(sugerida?.jornada ?? null);
    });
  }, []);

  const loadEstado = useCallback(async (j: string) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchEstadoJornada(j);
    setEstado(data);
    setError(err);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (jornada) loadEstado(jornada);
  }, [jornada, loadEstado]);

  const contado = parseEurosToCents(efectivo);
  const esperado = estado?.resumen.por_metodo.efectivo.neto_centimos ?? 0;
  const preview = typeof contado === 'number' ? textoDescuadre(contado - esperado) : null;
  const bloqueada = (estado?.mesas_abiertas.length ?? 0) > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!jornada || !estado || bloqueada) return;
    if (contado === undefined) {
      setError('Escribe el efectivo como 120,50 o déjalo vacío.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await cerrarJornada(jornada, contado, notas.trim() || null);
    setSaving(false);
    if (!data) {
      setError(err);
      if (jornada) loadEstado(jornada);
      return;
    }
    setHecho(data);
    onClosed?.(data);
  };

  if (hecho) {
    return (
      <Modal open title="Jornada cerrada" onClose={onClose} maxWidth="560px">
        <div className="mb-4 flex items-center gap-2 font-semibold text-[#1f4a2b]">
          <CheckCircle2 size={20} aria-hidden="true" /> Cierre guardado. Ya no se puede modificar.
        </div>
        <div className="print-area">
          <HojaCierre jornada={hecho.jornada} resumen={hecho.resumen} cierre={hecho} />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={printArea} className={`btn-outline-vino flex-1 ${focusRing}`}>
            <Printer size={16} aria-hidden="true" /> Imprimir
          </button>
          <button type="button" onClick={onClose} className={`btn-vino flex-1 ${focusRing}`}>
            Hecho
          </button>
        </div>
      </Modal>
    );
  }

  const ultimo = estado?.ultimo_cierre ?? null;
  const cambios = !!ultimo && (estado!.ventas_despues_del_cierre !== 0 || estado!.neto_despues_del_cierre_centimos !== 0);

  return (
    <Modal open title="Cerrar jornada" onClose={onClose} busy={saving} maxWidth="560px">
      {jornadas && jornadas.length > 1 && (
        <div className="mb-4">
          <span id="cierre-jornada" className="mb-2 block text-xs font-semibold text-carbon/70">Jornada</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="cierre-jornada">
            {jornadas.map((j) => (
              <button
                key={j.jornada}
                type="button"
                aria-pressed={jornada === j.jornada}
                onClick={() => setJornada(j.jornada)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize ${focusRing} ${
                  jornada === j.jornada ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino'
                }`}
              >
                {formatJornada(j.jornada)}
                {j.actual ? ' (actual)' : ''}
                {!j.cerrada && !j.actual ? ' · sin cerrar' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10" role="status">
          <Loader2 size={28} className="animate-spin text-vino" aria-hidden="true" />
          <span className="sr-only">Cargando la jornada…</span>
        </div>
      ) : !estado ? (
        error && <Notice kind="error">{error}</Notice>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="print-area">
            <HojaCierre jornada={estado.jornada} resumen={estado.resumen} />
          </div>

          {bloqueada && (
            <Notice kind="error">Antes de cerrar, cobra o cancela: {estado.mesas_abiertas.join(', ')}.</Notice>
          )}
          {ultimo && !cambios && (
            <Notice kind="info">
              Esta jornada ya se cerró a las {hora(ultimo.cerrado_at)}
              {ultimo.version > 1 ? ` (versión ${ultimo.version})` : ''} y no ha cambiado desde entonces.
            </Notice>
          )}
          {cambios && (
            <Notice kind="info">
              Se cerró a las {hora(ultimo!.cerrado_at)}, pero después ha habido {estado.ventas_despues_del_cierre} venta(s) más (
              {estado.neto_despues_del_cierre_centimos >= 0 ? '+' : '−'}
              {formatEuros(Math.abs(estado.neto_despues_del_cierre_centimos))}). Vuelve a cerrar para actualizarlo: la versión anterior se conserva.
            </Notice>
          )}

          {!bloqueada && (
            <>
              <div>
                <label htmlFor="cierre-efectivo" className="mb-1 block text-sm font-semibold text-carbon/85">
                  Efectivo contado en la caja (opcional)
                </label>
                <div className="flex items-center overflow-hidden rounded-r-sm border border-carbon/25 bg-white focus-within:border-vino">
                  <input
                    id="cierre-efectivo"
                    value={efectivo}
                    onChange={(e) => setEfectivo(e.target.value)}
                    inputMode="decimal"
                    placeholder={formatEuros(esperado).replace(/\s?€/, '')}
                    className="min-w-0 flex-1 px-3 py-2.5 text-base outline-none"
                  />
                  <span className="px-3 text-carbon/60" aria-hidden="true">€</span>
                </div>
                {preview && <p className={`mt-1 text-sm font-semibold ${preview.className}`}>{preview.text}</p>}
              </div>
              <div>
                <label htmlFor="cierre-notas" className="mb-1 block text-sm font-semibold text-carbon/85">Notas (opcional)</label>
                <textarea
                  id="cierre-notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2 text-base outline-none focus:border-vino sm:text-sm"
                />
              </div>
              {error && <Notice kind="error">{error}</Notice>}
              <SubmitButton loading={saving} loadingText="Cerrando…">
                {ultimo ? 'Volver a cerrar la jornada' : 'Cerrar la jornada'}
              </SubmitButton>
              <p className="text-xs text-carbon/55">El cierre queda guardado y no se puede modificar. El TPV sigue funcionando.</p>
            </>
          )}
        </form>
      )}
    </Modal>
  );
}
