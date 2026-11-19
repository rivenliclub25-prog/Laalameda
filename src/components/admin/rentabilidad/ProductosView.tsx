import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChefHat, Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { Notice, Switch, focusRing } from '@/components/club/FormControls';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { RecetaModal } from '@/components/admin/rentabilidad/RecetaModal';
import { descargarRentabilidad } from '@/lib/exportarRentabilidad';
import {
  AJUSTES_POR_DEFECTO,
  ETIQUETAS,
  ORDEN_ETIQUETAS,
  fetchAjustes,
  fetchRentabilidad,
  formatEur,
  type Ajustes,
  type Etiqueta,
  type ProductoRentabilidad,
} from '@/lib/rentabilidad';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
type Orden = 'carta' | 'margen' | 'ganancia';

/** Productos de la carta con su coste, margen y etiqueta (calculados al momento en el servidor). */
export function ProductosView() {
  const [productos, setProductos] = useState<ProductoRentabilidad[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_POR_DEFECTO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Etiqueta | null>(null);
  const [categoria, setCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [verOcultos, setVerOcultos] = useState(false);
  const [orden, setOrden] = useState<Orden>('carta');
  const [abierto, setAbierto] = useState<ProductoRentabilidad | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const idBuscar = useId();
  const idCategoria = useId();
  const idOrden = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [r, a] = await Promise.all([fetchRentabilidad(), fetchAjustes()]);
    setProductos(r.productos);
    setAjustes(a.ajustes);
    setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enCarta = productos.filter((p) => verOcultos || p.activo);
  const contadores = useMemo(() => {
    const c = new Map<Etiqueta, number>();
    for (const p of enCarta) c.set(p.etiqueta, (c.get(p.etiqueta) ?? 0) + 1);
    return c;
  }, [enCarta]);
  const categorias = useMemo(() => {
    const m = new Map<string, { nombre: string; orden: number }>();
    for (const p of productos) if (!m.has(p.categoria_id)) m.set(p.categoria_id, { nombre: p.categoria ?? p.categoria_id, orden: p.categoria_orden ?? 999 });
    return [...m.entries()].sort((a, b) => a[1].orden - b[1].orden);
  }, [productos]);

  const visibles = enCarta
    .filter(
      (p) =>
        (!filtro || p.etiqueta === filtro) &&
        (!categoria || p.categoria_id === categoria) &&
        (!busqueda.trim() || sinAcentos(`${p.nombre} ${p.product_id}`).includes(sinAcentos(busqueda.trim())))
    )
    .sort((a, b) => {
      if (orden === 'margen') return (a.margen_pct ?? 999) - (b.margen_pct ?? 999);
      if (orden === 'ganancia') return (b.ganancia_30d ?? -1) - (a.ganancia_30d ?? -1);
      return 0; // ya viene en el orden de la carta
    });

  return (
    <section aria-label="Productos">
      <p className="text-sm text-carbon/70">
        <strong>% de ganancia</strong> = (precio − coste) ÷ precio, con el precio tal cual (como en el Excel). Toca un producto para ver o cambiar su
        receta. Los precios se cambian en <strong>Carta</strong> o importando el Excel.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por etiqueta">
        {ORDEN_ETIQUETAS.filter((e) => contadores.get(e)).map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={filtro === e}
            onClick={() => setFiltro(filtro === e ? null : e)}
            className={`flex min-h-12 min-w-[96px] flex-col items-start rounded-r-md border px-3 py-1.5 text-left transition-colors ${focusRing} ${
              filtro === e ? 'border-vino ring-2 ring-vino/30' : 'border-piedra/50 bg-white hover:border-vino'
            }`}
          >
            <span className="font-display text-xl font-bold tabular-nums text-carbon">{contadores.get(e)}</span>
            <span className={`rounded-full border px-1.5 text-[0.68rem] font-semibold ${ETIQUETAS[e].clase}`}>{ETIQUETAS[e].texto}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label htmlFor={idBuscar} className="mb-1 block text-xs font-semibold text-carbon/80">
            Buscar
          </label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-carbon/45" aria-hidden="true" />
            <input
              id={idBuscar}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Producto o código"
              className={`h-11 w-full rounded-r-sm border border-carbon/20 bg-white pl-9 pr-3 text-sm ${focusRing}`}
            />
          </div>
        </div>
        <div>
          <label htmlFor={idCategoria} className="mb-1 block text-xs font-semibold text-carbon/80">
            Categoría
          </label>
          <select id={idCategoria} value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`h-11 rounded-r-sm border border-carbon/20 bg-white px-3 text-sm ${focusRing}`}>
            <option value="">Todas</option>
            {categorias.map(([id, c]) => (
              <option key={id} value={id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={idOrden} className="mb-1 block text-xs font-semibold text-carbon/80">
            Ordenar
          </label>
          <select id={idOrden} value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={`h-11 rounded-r-sm border border-carbon/20 bg-white px-3 text-sm ${focusRing}`}>
            <option value="carta">Como en la carta</option>
            <option value="margen">Menor margen primero</option>
            <option value="ganancia">Más ganancia (30 días)</option>
          </select>
        </div>
        <button
          type="button"
          onClick={async () => {
            setDescargando(true);
            const e = await descargarRentabilidad();
            setDescargando(false);
            if (e) setError(e);
          }}
          disabled={descargando || loading}
          className={`btn-outline-vino h-11 disabled:opacity-60 ${focusRing}`}
        >
          {descargando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Excel
        </button>
        <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className={`btn-outline-vino h-11 disabled:opacity-60 ${focusRing}`}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-carbon/75">
        <Switch checked={verOcultos} onChange={setVerOcultos} label="Ver también los productos que no salen en la carta" />
        <span aria-hidden="true">Ver también los que no salen en la carta</span>
      </div>

      {aviso && (
        <div className="mt-4" aria-live="polite">
          <Notice kind="success">{aviso}</Notice>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Calculando márgenes…
        </div>
      ) : error ? (
        <div className="mt-4 space-y-4">
          <Notice kind="error">{error}</Notice>
          <button type="button" onClick={load} className={`btn-outline-vino ${focusRing}`}>
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-carbon/55">
            {visibles.length} productos · vendidos y ganancia de los últimos 30 días con el coste de hoy
          </p>
          <ul className="mt-2 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
            {visibles.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => setAbierto(p)}
                  className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-piedra-suave/40 ${focusRing} ${p.activo ? '' : 'opacity-60'}`}
                >
                  <span className="min-w-[160px] flex-1">
                    <span className="block font-semibold text-carbon">{p.nombre}</span>
                    <span className="block text-xs text-carbon/55">
                      {p.categoria ?? p.categoria_id}
                      {p.lineas > 0 ? ` · ${p.lineas} ${p.lineas === 1 ? 'ingrediente' : 'ingredientes'}` : ' · sin receta'}
                      {!p.activo && ' · no sale en la carta'}
                    </span>
                  </span>
                  <span className="w-24 text-right text-xs text-carbon/60">
                    <span className="block text-sm font-semibold tabular-nums text-carbon">
                      {p.precio_centimos !== null ? formatEur(p.precio_centimos / 100) : '—'}
                    </span>
                    coste {p.coste !== null ? formatEur(p.coste) : '—'}
                  </span>
                  <span className="w-36 text-right">
                    <EtiquetaBadge etiqueta={p.etiqueta} margen={p.margen_pct} />
                    {p.ganancia !== null && <span className="mt-0.5 block text-xs tabular-nums text-carbon/60">gana {formatEur(p.ganancia)}/ud</span>}
                  </span>
                  <span className="w-28 text-right text-xs text-carbon/60">
                    <span className="block text-sm tabular-nums text-carbon">{p.vendidos_30d} vendidos</span>
                    {p.ganancia_30d !== null && p.vendidos_30d > 0 ? `${formatEur(p.ganancia_30d)} ganados` : ''}
                  </span>
                  <ChefHat size={18} className="text-carbon/40" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {visibles.length === 0 && <p className="mt-4 text-center text-sm text-carbon/60">Ningún producto coincide con los filtros.</p>}
        </>
      )}

      {abierto && (
        <RecetaModal
          producto={abierto}
          ajustes={ajustes}
          onClose={() => setAbierto(null)}
          onSaved={() => {
            setAviso(`Receta de «${abierto.nombre}» guardada.`);
            setAbierto(null);
            load();
          }}
        />
      )}
    </section>
  );
}
