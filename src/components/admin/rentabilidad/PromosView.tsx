import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Notice, Switch, focusRing } from '@/components/club/FormControls';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { fetchRentabilidadPromos, formatEur, formatPct, type PromoRentabilidad } from '@/lib/rentabilidad';

const TIPO = { pack: 'Pack', obsequio: 'Obsequio', sorteo: 'Sorteo' } as const;

/** Promos con su precio normal, descuento real, coste, margen y etiqueta. Se editan en Panel → Promos. */
export function PromosView() {
  const [promos, setPromos] = useState<PromoRentabilidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloActivas, setSoloActivas] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await fetchRentabilidadPromos();
    setPromos(r.promos);
    setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibles = promos.filter((p) => !soloActivas || p.activa);
  const avisos = promos.filter((p) => p.aviso_descuento).length;

  return (
    <section aria-label="Promos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-carbon/70">
          El coste de una promo sale de los <strong>productos que lleva</strong> (Panel → Promos → editar → «Productos de la carta que lleva»).
        </p>
        <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className={`btn-outline-vino disabled:opacity-60 ${focusRing}`}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-carbon/75">
        <Switch checked={soloActivas} onChange={setSoloActivas} label="Ver solo las promos encendidas" />
        <span aria-hidden="true">Solo las encendidas</span>
      </div>
      {avisos > 0 && (
        <div className="mt-3">
          <Notice kind="info">
            {avisos === 1 ? '1 promo anuncia' : `${avisos} promos anuncian`} un descuento que no coincide con el real (más de 2 puntos de diferencia).
          </Notice>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Calculando…
        </div>
      ) : error ? (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
          {visibles.map((p) => (
            <li key={p.promo_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${p.activa ? '' : 'opacity-70'}`}>
              <div className="min-w-[180px] flex-1">
                <p className="font-semibold text-carbon">
                  {p.nombre}
                  {!p.activa && <span className="pend-badge ml-2">APAGADA</span>}
                </p>
                <p className="text-xs text-carbon/55">
                  {TIPO[p.tipo]}
                  {p.productos === 0
                    ? ' · sin productos: añádelos en Panel → Promos'
                    : ` · ${p.productos} ${p.productos === 1 ? 'producto' : 'productos'}`}
                  {p.vendidas_30d > 0 && ` · ${p.vendidas_30d} vendidas en 30 días`}
                </p>
                {p.sin_receta.length > 0 && <p className="text-xs text-[#7a4e00]">Sin receta: {p.sin_receta.join(', ')}</p>}
              </div>
              <div className="w-40 text-right text-xs text-carbon/60">
                <span className="block text-sm font-semibold tabular-nums text-carbon">
                  {p.precio_centimos === null ? 'Sin precio' : p.precio_centimos === 0 ? 'Gratis' : formatEur(p.precio_centimos / 100)}
                </span>
                {p.precio_normal_centimos !== null && <>normal {formatEur(p.precio_normal_centimos / 100)}</>}
                {p.descuento_real_pct !== null && (
                  <span className={`block ${p.aviso_descuento ? 'font-semibold text-[#7a4e00]' : ''}`}>
                    {p.aviso_descuento && <AlertTriangle size={12} className="mr-1 inline" aria-hidden="true" />}
                    descuento real {formatPct(p.descuento_real_pct)}
                    {p.descuento_anunciado_pct !== null && ` (anuncia ${p.descuento_anunciado_pct} %)`}
                  </span>
                )}
              </div>
              <div className="w-36 text-right">
                {p.etiqueta === 'sin_precio' && p.coste !== null ? (
                  <span className="text-sm">
                    Cuesta <strong className="tabular-nums">{formatEur(p.coste)}</strong>
                  </span>
                ) : (
                  <>
                    <EtiquetaBadge etiqueta={p.etiqueta} margen={p.margen_pct} />
                    {p.coste !== null && <span className="mt-0.5 block text-xs tabular-nums text-carbon/60">coste {formatEur(p.coste)}</span>}
                  </>
                )}
              </div>
            </li>
          ))}
          {visibles.length === 0 && <li className="px-4 py-8 text-center text-sm text-carbon/60">No hay promos.</li>}
        </ul>
      )}
    </section>
  );
}
