import { useMemo, useState } from 'react';
import { Clock, Loader2, Search, Ticket } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import type { MenuItem, MenuTab } from '@/lib/catalog';
import { TIPOS_PROMO, formatEuros, type PromoVenta } from '@/lib/pos';

const PROMOS_TAB = '__promos';

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Selector de productos del TPV (barra y mesas): pestañas de categorías, buscador por nombre o
 * código y cuadrícula de botones grandes. Los agotados o sin precio no se pueden añadir.
 * Con `promos`, añade la pestaña «Promos» (las de club piden después el ticket del socio).
 */
export function ProductPicker({
  tabs,
  loading,
  qtyById,
  onAdd,
  idPrefix,
  promos,
  onAddPromo,
  promoQty,
}: {
  tabs: MenuTab[];
  loading: boolean;
  qtyById: Map<string, number>;
  onAdd: (item: MenuItem) => void;
  idPrefix: string;
  promos?: PromoVenta[];
  onAddPromo?: (promo: PromoVenta) => void;
  /** Unidades de cada promo en el pedido (por id). */
  promoQty?: Map<string, number>;
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

  const promosVisibles = useMemo(() => {
    if (!promos || !onAddPromo) return [];
    const q = query.trim();
    if (q) return promos.filter((p) => normalize(p.nombre).includes(normalize(q)));
    return activeCategory === PROMOS_TAB ? promos : [];
  }, [promos, onAddPromo, query, activeCategory]);
  const showProducts = query.trim() !== '' || activeCategory !== PROMOS_TAB;
  const hasPromoTab = !!promos && !!onAddPromo && promos.length > 0;

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
          {hasPromoTab && (
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === PROMOS_TAB}
              onClick={() => setCategory(PROMOS_TAB)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${focusRing} ${
                activeCategory === PROMOS_TAB ? 'border-vino bg-vino text-white' : 'border-piedra bg-piedra-suave text-carbon hover:border-vino'
              }`}
            >
              Promos
            </button>
          )}
        </div>
      )}

      {promosVisibles.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {promosVisibles.map((p) => {
            const sinPrecio = p.priceCents === undefined;
            const off = !p.activa || sinPrecio;
            const inCart = promoQty?.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onAddPromo?.(p)}
                  disabled={off}
                  aria-label={`${p.nombre}, ${sinPrecio ? 'sin precio' : formatEuros(p.priceCents!)}${p.soloClub ? ', pide el ticket del socio' : ''}${!p.activa ? ', apagada' : !p.enHorario ? ', fuera de horario' : ''}`}
                  className={`relative flex h-full min-h-[84px] w-full flex-col justify-between rounded-r-md border p-3 text-left shadow-sm transition-all active:scale-[0.97] ${focusRing} ${
                    off ? 'cursor-not-allowed border-carbon/10 bg-carbon/5 text-carbon/40' : inCart ? 'border-vino bg-vino/5' : 'border-piedra bg-piedra-suave/40 hover:border-vino'
                  }`}
                >
                  <span className="text-sm font-semibold leading-tight">{p.nombre}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1 text-[0.68rem] font-semibold">
                    <span className="rounded-full border border-carbon/20 bg-white px-2 py-0.5">{TIPOS_PROMO[p.tipo]}</span>
                    {p.soloClub && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-vino/30 bg-white px-2 py-0.5 text-vino">
                        <Ticket size={11} aria-hidden="true" /> Club · ticket
                      </span>
                    )}
                    {p.activa && !p.enHorario && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#a86b00]/40 bg-[#a86b00]/10 px-2 py-0.5 text-[#7a4e00]">
                        <Clock size={11} aria-hidden="true" /> Fuera de horario
                      </span>
                    )}
                  </span>
                  <span className="mt-2 text-right font-display text-lg font-semibold text-vino">
                    {!p.activa ? 'Apagada' : sinPrecio ? 'Sin precio' : formatEuros(p.priceCents!)}
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

      {!showProducts ? null : loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          <span className="sr-only">Cargando la carta…</span>
        </div>
      ) : products.length === 0 ? (
        promosVisibles.length > 0 ? null : (
          <p className="py-10 text-center text-sm text-carbon/60">{query ? `Nada coincide con «${query}».` : 'Sin productos.'}</p>
        )
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
