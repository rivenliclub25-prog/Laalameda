import { useMemo } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { UNIDADES, UNIDADES_FORMULARIO, formatCosteUnitario, type Insumo } from '@/lib/costes';
import { calcularMargen, formatEur, type Ajustes } from '@/lib/rentabilidad';
import { nuevaClave, type LineaEditable, type Receta } from '@/components/admin/rentabilidad/useReceta';

/**
 * Editor de la receta de un producto (ingredientes, cantidad, merma) con coste, precio, ganancia y
 * % de ganancia en directo. Se usa en Rentabilidad → Productos y al crear o editar un producto en la Carta.
 */



const inputClass = `h-10 rounded-r-sm border border-carbon/20 bg-white px-2 text-sm ${focusRing}`;

export function RecetaEditor({
  receta,
  precioCentimos,
  ajustes,
  disabled = false,
}: {
  receta: Receta;
  precioCentimos: number | null;
  ajustes: Ajustes;
  disabled?: boolean;
}) {
  const { insumos, lineas, setLineas, porId, base, merma, coste } = receta;
  const calc = calcularMargen(precioCentimos, coste, ajustes);

  const categorias = useMemo(() => {
    const m = new Map<string, Insumo[]>();
    for (const i of insumos ?? []) {
      if (!i.activo && !lineas.some((l) => l.insumo_id === i.id)) continue;
      const c = i.categoria ?? 'Sin categoría';
      m.set(c, [...(m.get(c) ?? []), i]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [insumos, lineas]);

  const cambiar = (key: number, cambios: Partial<LineaEditable>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)));

  if (insumos === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-carbon/60" role="status">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando ingredientes…
      </p>
    );
  }

  return (
    <div>
      {insumos.length === 0 && (
        <p className="text-sm text-carbon/60">Todavía no hay ingredientes: impórtalos en Rentabilidad → Importar Excel o créalos en Rentabilidad → Ingredientes.</p>
      )}
      {lineas.length === 0 && insumos.length > 0 && <p className="text-sm text-carbon/60">Sin receta: añade sus ingredientes para ver el coste y la ganancia.</p>}
      <ul className="space-y-3">
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
                    disabled={disabled}
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
                  <input value={l.cantidad} disabled={disabled} onChange={(e) => cambiar(l.key, { cantidad: e.target.value })} inputMode="decimal" className={`${inputClass} mt-1 block w-full text-right`} />
                </label>
                <label className="text-xs font-semibold text-carbon/80">
                  <span className="sr-only">Unidad</span>
                  <select value={l.unidad} disabled={disabled} onChange={(e) => cambiar(l.key, { unidad: e.target.value })} className={`${inputClass} mt-1 block`}>
                    {opciones.map((u) => (
                      <option key={u} value={u}>
                        {UNIDADES[u].etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-20 text-xs font-semibold text-carbon/80">
                  Merma %
                  <input value={l.merma} disabled={disabled} onChange={(e) => cambiar(l.key, { merma: e.target.value })} inputMode="decimal" placeholder="0" className={`${inputClass} mt-1 block w-full text-right`} />
                </label>
                <button
                  type="button"
                  disabled={disabled}
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
      {insumos.length > 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setLineas((ls) => [...ls, { key: nuevaClave(), insumo_id: null, cantidad: '', unidad: 'ml', merma: '' }])}
          className={`btn-outline-vino mt-3 ${focusRing}`}
        >
          <Plus size={16} aria-hidden="true" /> Ingrediente
        </button>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-r-md border border-piedra/60 bg-piedra-suave/40 px-4 py-3 sm:grid-cols-4" aria-live="polite">
        <Dato titulo="Coste" valor={coste !== null ? formatEur(coste) : '—'} />
        <Dato titulo="Precio de venta" valor={calc.precio !== null ? formatEur(calc.precio) : '—'} />
        <Dato titulo="Ganancia" valor={calc.ganancia !== null ? formatEur(calc.ganancia) : '—'} />
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-carbon/60">% de ganancia</span>
          <span className="mt-1 inline-block">
            <EtiquetaBadge etiqueta={calc.etiqueta} margen={calc.margen} />
          </span>
        </div>
      </div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span>
      <span className="block text-xs font-semibold uppercase tracking-wider text-carbon/60">{titulo}</span>
      <span className="font-display text-xl font-bold tabular-nums">{valor}</span>
    </span>
  );
}
