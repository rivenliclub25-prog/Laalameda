import { useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { UNIDADES, UNIDADES_FORMULARIO, fetchInsumos, formatCosteUnitario, parseNumero, type Insumo } from '@/lib/costes';
import {
  calcularMargen,
  costeReceta,
  fetchReceta,
  formatEur,
  guardarReceta,
  type Ajustes,
  type ProductoRentabilidad,
} from '@/lib/rentabilidad';

interface Linea {
  key: number;
  insumo_id: number | null;
  cantidad: string;
  /** Unidad en la que se escribe (ml, cl, l, g, kg, ud): se guarda en la base del ingrediente. */
  unidad: string;
  merma: string;
}

const aTexto = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3, useGrouping: false });
const inputClass = `h-10 rounded-r-sm border border-carbon/20 bg-white px-2 text-sm ${focusRing}`;
let siguiente = 1;

/** Receta de un producto: ingredientes, cantidades y merma, con coste y margen en directo. */
export function RecetaModal({
  producto,
  ajustes,
  onClose,
  onSaved,
}: {
  producto: ProductoRentabilidad;
  ajustes: Ajustes;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const idTitulo = useId();

  useEffect(() => {
    Promise.all([fetchInsumos(), fetchReceta(producto.product_id)]).then(([i, r]) => {
      setInsumos(i.insumos);
      setError(i.error ?? r.error);
      setLineas(
        r.lineas.map((l) => ({
          key: siguiente++,
          insumo_id: l.insumo_id,
          cantidad: aTexto(l.cantidad),
          unidad: l.insumos?.unidad_base ?? 'ud',
          merma: l.merma_pct ? aTexto(l.merma_pct) : '',
        }))
      );
    });
  }, [producto.product_id]);

  const porId = useMemo(() => new Map((insumos ?? []).map((i) => [i.id, i])), [insumos]);
  const categorias = useMemo(() => {
    const m = new Map<string, Insumo[]>();
    for (const i of insumos ?? []) {
      if (!i.activo && !lineas.some((l) => l.insumo_id === i.id)) continue;
      const c = i.categoria ?? 'Sin categoría';
      m.set(c, [...(m.get(c) ?? []), i]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [insumos, lineas]);

  /** Cantidad en la unidad base del ingrediente (null si no es válida). */
  const base = (l: Linea) => {
    const i = l.insumo_id ? porId.get(l.insumo_id) : undefined;
    const u = UNIDADES[l.unidad];
    const c = parseNumero(l.cantidad);
    if (!i || !u || u.base !== i.unidad_base || c === null || c <= 0) return null;
    return Math.round(c * u.factor * 1000) / 1000;
  };
  const merma = (l: Linea) => (l.merma.trim() ? parseNumero(l.merma) : 0);
  const validas = lineas.every((l) => base(l) !== null && merma(l) !== null && merma(l)! >= 0 && merma(l)! < 100);
  const coste = validas
    ? costeReceta(lineas.map((l) => ({ cantidad: base(l)!, merma_pct: merma(l)!, coste_unitario: porId.get(l.insumo_id!)!.coste_unitario })))
    : null;
  const calc = calcularMargen(producto.precio_centimos, coste, ajustes);

  const cambiar = (key: number, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)));

  const guardar = async () => {
    setError(null);
    if (!validas) return setError('Revisa las líneas: elige el ingrediente y una cantidad mayor que 0 (merma de 0 a 99 %).');
    const ids = lineas.map((l) => l.insumo_id);
    if (new Set(ids).size !== ids.length) return setError('Hay un ingrediente repetido: júntalo en una sola línea.');
    setSaving(true);
    const r = await guardarReceta(
      producto.product_id,
      lineas.map((l) => ({ insumo_id: l.insumo_id!, cantidad: base(l)!, merma_pct: merma(l)!, nota: null }))
    );
    setSaving(false);
    if (r.error) return setError(r.error);
    onSaved();
  };

  return (
    <Modal open title={`Receta · ${producto.nombre}`} onClose={onClose} busy={saving} maxWidth="680px">
      <p className="text-sm text-carbon/70">
        Precio en carta: <strong>{producto.precio_centimos !== null ? formatEur(producto.precio_centimos / 100) : 'sin precio'}</strong>
        {calc.precioSinIva !== null && ` (${formatEur(calc.precioSinIva)} sin IVA)`}. Se cambia en la pestaña Carta.
      </p>

      {insumos === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-carbon/60" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando…
        </p>
      ) : (
        <>
          <h3 id={idTitulo} className="mt-4 text-xs font-semibold uppercase tracking-wider text-carbon/60">
            Ingredientes
          </h3>
          {lineas.length === 0 && <p className="mt-2 text-sm text-carbon/60">Sin receta: el producto sale como «Sin coste».</p>}
          <ul className="mt-2 space-y-3" aria-labelledby={idTitulo}>
            {lineas.map((l) => {
              const i = l.insumo_id ? porId.get(l.insumo_id) : undefined;
              const opciones = UNIDADES_FORMULARIO.filter((u) => !i || UNIDADES[u].base === i.unidad_base);
              const b = base(l);
              return (
                <li key={l.key} className="rounded-r-md border border-carbon/10 bg-white p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[200px] flex-1 text-xs font-semibold text-carbon/80">
                      Ingrediente
                      <select
                        value={l.insumo_id ?? ''}
                        onChange={(e) => {
                          const nuevo = porId.get(Number(e.target.value));
                          cambiar(l.key, { insumo_id: nuevo ? nuevo.id : null, unidad: nuevo ? nuevo.unidad_base : l.unidad });
                        }}
                        className={`${inputClass} mt-1 block w-full`}
                      >
                        <option value="">— Elegir —</option>
                        {categorias.map(([cat, lista]) => (
                          <optgroup key={cat} label={cat}>
                            {lista.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.nombre}
                                {x.activo ? '' : ' (de baja)'}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="w-24 text-xs font-semibold text-carbon/80">
                      Cantidad
                      <input value={l.cantidad} onChange={(e) => cambiar(l.key, { cantidad: e.target.value })} inputMode="decimal" className={`${inputClass} mt-1 block w-full text-right`} />
                    </label>
                    <label className="text-xs font-semibold text-carbon/80">
                      <span className="sr-only">Unidad</span>
                      <select value={l.unidad} onChange={(e) => cambiar(l.key, { unidad: e.target.value })} className={`${inputClass} mt-1 block`}>
                        {opciones.map((u) => (
                          <option key={u} value={u}>
                            {UNIDADES[u].etiqueta}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="w-20 text-xs font-semibold text-carbon/80">
                      Merma %
                      <input value={l.merma} onChange={(e) => cambiar(l.key, { merma: e.target.value })} inputMode="decimal" placeholder="0" className={`${inputClass} mt-1 block w-full text-right`} />
                    </label>
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                      aria-label={`Quitar ${i?.nombre ?? 'línea'}`}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/15 text-carbon/60 hover:border-vino hover:text-vino ${focusRing}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {i && (
                    <p className="mt-1.5 text-xs text-carbon/55">
                      {formatCosteUnitario(i.coste_unitario, i.unidad_base)}
                      {b !== null && ` → ${formatEur((b * i.coste_unitario) / (1 - (merma(l) ?? 0) / 100))}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setLineas((ls) => [...ls, { key: siguiente++, insumo_id: null, cantidad: '', unidad: 'ml', merma: '' }])}
            className={`btn-outline-vino mt-3 ${focusRing}`}
          >
            <Plus size={16} aria-hidden="true" /> Ingrediente
          </button>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-r-md border border-piedra/60 bg-piedra-suave/40 px-4 py-3" aria-live="polite">
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wider text-carbon/60">Coste</span>
              <span className="font-display text-xl font-bold tabular-nums">{coste !== null ? formatEur(coste) : '—'}</span>
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wider text-carbon/60">Ganancia</span>
              <span className="font-display text-xl font-bold tabular-nums">{calc.ganancia !== null ? formatEur(calc.ganancia) : '—'}</span>
            </span>
            <EtiquetaBadge etiqueta={calc.etiqueta} margen={calc.margen} />
          </div>

          {error && (
            <div className="mt-3">
              <Notice kind="error">{error}</Notice>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={guardar} disabled={saving} className={`btn-vino min-h-12 disabled:opacity-60 ${focusRing}`}>
              {saving && <Loader2 size={18} className="animate-spin" aria-hidden="true" />} Guardar receta
            </button>
            <button type="button" onClick={onClose} disabled={saving} className={`btn-outline-vino min-h-12 ${focusRing}`}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
