import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { Notice, Switch, focusRing } from '@/components/club/FormControls';
import { IngredienteModal } from '@/components/admin/rentabilidad/IngredienteModal';
import {
  fetchHistorial,
  fetchInsumos,
  formatCantidad,
  formatCosteUnitario,
  formatPrecioCompra,
  type Insumo,
  type InsumoPrecio,
} from '@/lib/costes';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, signDisplay: 'always' });

/** Lista de ingredientes: buscar, filtrar por categoría, crear y editar (con su histórico). */
export function IngredientesView() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [historial, setHistorial] = useState<InsumoPrecio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [verBajas, setVerBajas] = useState(false);
  const [editando, setEditando] = useState<Insumo | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const idBuscar = useId();
  const idCategoria = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [i, h] = await Promise.all([fetchInsumos(), fetchHistorial()]);
    setInsumos(i.insumos);
    setHistorial(h.precios);
    setError(i.error ?? h.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Último cambio de precio y variación del coste respecto al anterior, por ingrediente. */
  const cambios = useMemo(() => {
    const porInsumo = new Map<number, InsumoPrecio[]>();
    for (const h of historial) porInsumo.set(h.insumo_id, [...(porInsumo.get(h.insumo_id) ?? []), h]);
    const out = new Map<number, { desde: string; variacion: number | null }>();
    for (const [id, lista] of porInsumo) {
      const [ultimo, anterior] = lista; // ya vienen del más reciente al más antiguo
      const variacion = anterior && anterior.coste_unitario > 0 ? (ultimo.coste_unitario / anterior.coste_unitario - 1) * 100 : null;
      out.set(id, { desde: ultimo.vigente_desde, variacion });
    }
    return out;
  }, [historial]);

  const categorias = useMemo(
    () => [...new Set(insumos.map((i) => i.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'es')),
    [insumos]
  );

  const visibles = insumos.filter(
    (i) =>
      (verBajas || i.activo) &&
      (!categoria || i.categoria === categoria) &&
      (!busqueda.trim() || sinAcentos(`${i.nombre} ${i.proveedor ?? ''} ${i.id}`).includes(sinAcentos(busqueda.trim())))
  );
  const bajas = insumos.filter((i) => !i.activo).length;

  return (
    <section aria-label="Ingredientes">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
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
              placeholder="Nombre, proveedor o código"
              className={`h-11 w-full rounded-r-sm border border-carbon/20 bg-white pl-9 pr-3 text-sm ${focusRing}`}
            />
          </div>
        </div>
        <div className="min-w-[170px]">
          <label htmlFor={idCategoria} className="mb-1 block text-xs font-semibold text-carbon/80">
            Categoría
          </label>
          <select
            id={idCategoria}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={`h-11 w-full rounded-r-sm border border-carbon/20 bg-white px-3 text-sm ${focusRing}`}
          >
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditando('nuevo')} className={`btn-vino ${focusRing}`}>
            <Plus size={16} aria-hidden="true" /> Ingrediente
          </button>
          <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className={`btn-outline-vino disabled:opacity-60 ${focusRing}`}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {bajas > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-3 text-sm text-carbon/75">
            <Switch checked={verBajas} onChange={setVerBajas} label={`Ver también los dados de baja (${bajas})`} />
            <span aria-hidden="true">Ver también los dados de baja ({bajas})</span>
          </div>
        </div>
      )}

      {aviso && (
        <div className="mt-4" aria-live="polite">
          <Notice kind="success">{aviso}</Notice>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Cargando ingredientes…
        </div>
      ) : error ? (
        <div className="mt-4 space-y-4">
          <Notice kind="error">{error}</Notice>
          <button type="button" onClick={load} className={`btn-outline-vino ${focusRing}`}>
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : insumos.length === 0 ? (
        <div className="mt-6 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
          <p className="font-display text-2xl font-semibold text-vino">Todavía no hay ingredientes</p>
          <p className="mt-1 text-sm text-carbon/70">Cárgalos desde tu Excel en «Importar Excel», o crea uno con «+ Ingrediente».</p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-carbon/55">
            {visibles.length === insumos.length ? `${insumos.length} ingredientes` : `${visibles.length} de ${insumos.length} ingredientes`}
          </p>
          <ul className="mt-2 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
            {visibles.map((i) => {
              const c = cambios.get(i.id);
              return (
                <li key={i.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 ${i.activo ? '' : 'opacity-60'}`}>
                  <div className="min-w-[180px] flex-1">
                    <p className="font-semibold text-carbon">
                      {i.nombre}
                      {!i.activo && <span className="pend-badge ml-2">DE BAJA</span>}
                    </p>
                    <p className="text-xs text-carbon/55">
                      nº {i.id}
                      {i.categoria ? ` · ${i.categoria}` : ''}
                      {` · ${i.formato || formatCantidad(i.cantidad_formato, i.unidad_base)}`}
                      {i.rendimiento_pct < 100 ? ` · rinde ${i.rendimiento_pct.toLocaleString('es-ES')} %` : ''}
                      {i.proveedor ? ` · ${i.proveedor}` : ''}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="tabular-nums text-carbon/70">{formatPrecioCompra(i.precio_compra_sin_iva)}</p>
                    <p className="font-bold tabular-nums text-vino">{formatCosteUnitario(i.coste_unitario, i.unidad_base)}</p>
                  </div>
                  <div className="w-28 text-right text-xs text-carbon/55">
                    {c?.variacion !== null && c?.variacion !== undefined && Math.abs(c.variacion) >= 0.05 ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${c.variacion > 0 ? 'text-vino' : 'text-[#1f4a2b]'}`}>
                        {c.variacion > 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
                        {pct.format(c.variacion)} %
                      </span>
                    ) : null}
                    {c && <span className="block">{fecha(c.desde)}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditando(i)}
                    aria-label={`Editar ${i.nombre}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/15 text-carbon/65 hover:border-vino hover:text-vino ${focusRing}`}
                  >
                    <Pencil size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
          {visibles.length === 0 && <p className="mt-4 text-center text-sm text-carbon/60">Ningún ingrediente coincide con la búsqueda.</p>}
        </>
      )}

      {editando && (
        <IngredienteModal
          insumo={editando === 'nuevo' ? null : editando}
          categorias={categorias}
          onClose={() => setEditando(null)}
          onSaved={(guardado, nuevo) => {
            setEditando(null);
            setAviso(nuevo ? `Ingrediente «${guardado.nombre}» creado.` : `«${guardado.nombre}» guardado.`);
            load();
          }}
        />
      )}
    </section>
  );
}
