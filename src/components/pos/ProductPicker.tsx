import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import type { MenuItem, MenuTab } from '@/lib/catalog';

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Selector de productos del TPV (barra y mesas): pestañas de categorías, buscador por nombre o
 * código y cuadrícula de botones grandes. Los agotados o sin precio no se pueden añadir.
 */
export function ProductPicker({
  tabs,
  loading,
  qtyById,
  onAdd,
  idPrefix,
}: {
  tabs: MenuTab[];
  loading: boolean;
  qtyById: Map<string, number>;
  onAdd: (item: MenuItem) => void;
  idPrefix: string;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const activeCategory = category ?? tabs[0]?.id ?? null;

  const products = useMemo(() => {
    const all = tabs.flatMap((t) => t.items.filter((i) => i.id && i.name).map((i) => ({ ...i, tab: t.id })));
    const q = query.trim();
    if (q) {
      const n = normalize(q);
      return all.filter((i) => i.id === q || normalize(i.name ?? '').includes(n));
    }
    return all.filter((i) => i.tab === activeCategory);
  }, [tabs, query, activeCategory]);

  return (
    <div>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-carbon/45" aria-hidden="true" />
        <label htmlFor={`${idPrefix}-buscar`} className="sr-only">Buscar producto por nombre o código</label>
        <input
          id={`${idPrefix}-buscar`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o código (ej.: 15)"
          className="w-full rounded-r-sm border border-carbon/25 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-vino focus:ring-1 focus:ring-vino/30"
        />
      </div>

      {!query && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Categorías">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === tab.id}
              onClick={() => setCategory(tab.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${focusRing} ${
                activeCategory === tab.id ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          <span className="sr-only">Cargando la carta…</span>
        </div>
      ) : products.length === 0 ? (
        <p className="py-10 text-center text-sm text-carbon/60">{query ? `Nada coincide con «${query}».` : 'Sin productos.'}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((item) => {
            const inCart = qtyById.get(item.id ?? '') ?? 0;
            const agotado = item.available === false;
            const sinPrecio = item.priceCents === undefined;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onAdd(item)}
                  disabled={agotado || sinPrecio}
                  aria-label={`${item.name}, ${item.price ?? 'sin precio'}${agotado ? ', agotado' : ''}${inCart ? `, ${inCart} en el pedido` : ''}`}
                  className={`relative flex h-full min-h-[84px] w-full flex-col justify-between rounded-r-md border p-3 text-left shadow-sm transition-all active:scale-[0.97] ${focusRing} ${
                    agotado || sinPrecio
                      ? 'cursor-not-allowed border-carbon/10 bg-carbon/5 text-carbon/40'
                      : inCart
                        ? 'border-vino bg-vino/5'
                        : 'border-piedra/50 bg-white hover:border-vino'
                  }`}
                >
                  <span className="text-sm font-semibold leading-tight">{item.name}</span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[0.68rem] text-carbon/45">#{item.id}</span>
                    <span className={`font-display text-lg font-semibold ${agotado ? 'line-through' : 'text-vino'}`}>
                      {agotado ? 'Agotado' : (item.price ?? '—')}
                    </span>
                  </span>
                  {inCart > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-vino px-1.5 text-xs font-bold text-white" aria-hidden="true">
                      {inCart}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
