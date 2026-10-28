import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ClipboardCheck, Download, Loader2, Printer, RefreshCw } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { CierreJornadaModal, HojaCierre } from '@/components/pos/CierreJornada';
import type { AdminUser } from '@/lib/admin';
import { formatEuros } from '@/lib/pos';
import { downloadCierresCsv, fetchCierres, formatJornada, printArea, textoDescuadre, type Cierre } from '@/lib/informes';

/** Panel → Ventas → Cierres: los cierres de jornada guardados (con sus versiones), para revisar e imprimir. */
export function CierresView({ users }: { users: AdminUser[] }) {
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const nombre = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.nombre || u.email]));
    return (id: string | null) => (id ? (map.get(id) ?? 'Cuenta borrada') : '—');
  }, [users]);

  const load = useCallback(async () => {
    setLoading(true);
    const { cierres: rows, error: err } = await fetchCierres();
    setCierres(rows);
    setError(err);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Una jornada con varios cierres: la última versión es la que vale; las anteriores se ven atenuadas.
  const ultimaVersion = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cierres) map.set(c.jornada, Math.max(map.get(c.jornada) ?? 0, c.version));
    return map;
  }, [cierres]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-carbon/70">Cada cierre guarda el cuadre de caja de su jornada y no se puede modificar.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCerrando(true)} className={`btn-vino ${focusRing}`}>
            <ClipboardCheck size={16} aria-hidden="true" /> Cerrar jornada
          </button>
          <button type="button" onClick={() => downloadCierresCsv(cierres, nombre)} disabled={cierres.length === 0} className={`btn-outline-vino disabled:opacity-50 ${focusRing}`}>
            <Download size={16} aria-hidden="true" /> CSV
          </button>
          <button type="button" onClick={load} aria-label="Actualizar cierres" className={`flex h-11 w-11 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}>
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {loading && cierres.length === 0 ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          <span className="sr-only">Cargando cierres…</span>
        </div>
      ) : cierres.length === 0 ? (
        <div className="mt-6 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
          <p className="font-display text-2xl font-semibold text-vino">Aún no hay cierres</p>
          <p className="mt-1 text-sm text-carbon/70">Se cierran desde el TPV («Cerrar jornada») o con el botón de arriba.</p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
          {cierres.map((c) => {
            const open = abierto === c.id;
            const antigua = c.version < (ultimaVersion.get(c.jornada) ?? c.version);
            const descuadre = textoDescuadre(c.descuadre_centimos);
            return (
              <li key={c.id} className={antigua ? 'opacity-60' : ''}>
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : c.id)}
                  aria-expanded={open}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-marfil sm:grid-cols-[1fr_120px_140px_24px] ${focusRing}`}
                >
                  <span>
                    <span className="font-semibold capitalize text-carbon">{formatJornada(c.jornada, true)}</span>
                    <span className="block text-xs text-carbon/55">
                      {c.version > 1 || antigua ? `Versión ${c.version}${antigua ? ' (sustituida)' : ''} · ` : ''}
                      {new Date(c.cerrado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {nombre(c.cerrado_por)} · {c.ventas} ventas
                    </span>
                  </span>
                  <span className="text-right font-semibold tabular-nums">{formatEuros(c.neto_centimos)}</span>
                  <span className={`col-span-2 text-xs font-semibold sm:col-span-1 sm:text-right ${descuadre?.className ?? 'text-carbon/45'}`}>
                    {descuadre ? descuadre.text : 'Efectivo sin contar'}
                  </span>
                  <ChevronDown size={16} className={`hidden text-carbon/50 transition-transform sm:block ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {open && (
                  <div className="border-t border-carbon/10 bg-marfil/60 px-4 py-4">
                    <div className="print-area max-w-[520px]">
                      <HojaCierre jornada={c.jornada} resumen={c.resumen} cierre={c} cerradoPor={nombre(c.cerrado_por)} />
                    </div>
                    <button type="button" onClick={printArea} className={`btn-outline-vino mt-4 ${focusRing}`}>
                      <Printer size={16} aria-hidden="true" /> Imprimir
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cerrando && <CierreJornadaModal onClose={() => setCerrando(false)} onClosed={() => load()} />}
    </>
  );
}
