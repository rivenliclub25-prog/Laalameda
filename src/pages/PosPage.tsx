import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronUp, Loader2, Minus, Plus, RefreshCw, Search, ShoppingBag, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { Notice, focusRing } from '@/components/club/FormControls';
import { useCatalog, type MenuItem } from '@/lib/catalog';
import { loadSoundEnabled, playFeedback, saveSoundEnabled } from '@/lib/feedback';
import { useScrollLock } from '@/lib/useScrollLock';
import {
  METODOS,
  fetchUltimasVentas,
  formatEuros,
  newRequestId,
  ventaBarra,
  type Metodo,
  type Venta,
  type VentaResultado,
} from '@/lib/pos';

interface CartLine {
  id: number; // código del producto
  name: string;
  priceCents: number;
  qty: number;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** TPV de barra (#/pos): el camarero añade productos, elige el método de pago y cobra. Solo camareros. */
export function PosPage() {
  const { catalog, fromBackup } = useCatalog();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ venta: VentaResultado; clientTotal: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(loadSoundEnabled);
  const [ultimas, setUltimas] = useState<Venta[]>([]);
  const chargingRef = useRef(false);

  useScrollLock(sheetOpen);
  const closeDone = useCallback(() => setDone(null), []);

  const tabs = useMemo(() => catalog?.menuTabs ?? [], [catalog]);
  const activeCategory = category ?? tabs[0]?.id ?? null;

  const loadUltimas = useCallback(async () => {
    const { ventas } = await fetchUltimasVentas(8);
    setUltimas(ventas);
  }, []);

  useEffect(() => {
    loadUltimas();
  }, [loadUltimas]);

  // Productos a mostrar: los de la categoría, o los que coinciden con la búsqueda (nombre o código).
  const products = useMemo(() => {
    const all = tabs.flatMap((t) => t.items.filter((i) => i.id && i.name).map((i) => ({ ...i, tab: t.id })));
    const q = query.trim();
    if (q) {
      const n = normalize(q);
      return all.filter((i) => i.id === q || normalize(i.name ?? '').includes(n));
    }
    return all.filter((i) => i.tab === activeCategory);
  }, [tabs, query, activeCategory]);

  const total = cart.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const units = cart.reduce((sum, l) => sum + l.qty, 0);

  const add = (item: MenuItem) => {
    if (!item.id || item.priceCents === undefined || item.available === false) return;
    const id = Number(item.id);
    setError(null);
    setCart((prev) => {
      const line = prev.find((l) => l.id === id);
      if (line) return prev.map((l) => (l.id === id ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [...prev, { id, name: item.name ?? '', priceCents: item.priceCents!, qty: 1 }];
    });
  };

  const changeQty = (id: number, delta: number) =>
    setCart((prev) => prev.flatMap((l) => (l.id !== id ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: Math.min(99, l.qty + delta) }])));

  const clear = () => {
    setCart([]);
    setMetodo(null);
    setError(null);
    setRequestId(newRequestId());
  };

  const charge = async () => {
    if (chargingRef.current || cart.length === 0 || !metodo) return;
    chargingRef.current = true;
    setCharging(true);
    setError(null);
    const clientTotal = total;
    // Se reutiliza el mismo requestId hasta que el cobro sale bien: un reintento nunca cobra dos veces.
    const { venta, error: err } = await ventaBarra(
      cart.map((l) => ({ product_id: l.id, cantidad: l.qty })),
      metodo,
      requestId
    );
    chargingRef.current = false;
    setCharging(false);
    if (!venta) {
      setError(err);
      playFeedback('error', soundOn);
      return;
    }
    playFeedback('ok', soundOn);
    setDone({ venta, clientTotal });
    setSheetOpen(false);
    setCart([]);
    setMetodo(null);
    setRequestId(newRequestId());
    loadUltimas();
  };

  const toggleSound = () =>
    setSoundOn((on) => {
      saveSoundEnabled(!on);
      return !on;
    });

  const cartPanel = (
    <CartPanel
      cart={cart}
      total={total}
      metodo={metodo}
      charging={charging}
      error={error}
      onQty={changeQty}
      onMetodo={setMetodo}
      onCharge={charge}
      onClear={clear}
    />
  );

  return (
    <PageShell>
      <div className="mx-auto max-w-container pb-24 lg:pb-0">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-vino">Personal del bar</div>
            <h1 className="mt-2 font-display text-[2.2rem] font-semibold leading-[1.05] text-vino sm:text-[2.6rem]">TPV · Barra</h1>
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-carbon/20 bg-white text-carbon/70 hover:text-vino ${focusRing}`}
          >
            {soundOn ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
            <span className="sr-only">{soundOn ? 'Silenciar sonido' : 'Activar sonido'}</span>
          </button>
        </header>
        <div className="divider-gold mb-5 ml-0 mt-4" />

        {fromBackup && (
          <div className="mb-4">
            <Notice kind="error">
              Sin conexión con la base de datos: se muestra una copia de la carta. Los cobros no funcionarán hasta que vuelva.
            </Notice>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          <section aria-label="Productos">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-carbon/45" aria-hidden="true" />
              <label htmlFor="pos-buscar" className="sr-only">Buscar producto por nombre o código</label>
              <input
                id="pos-buscar"
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

            {!catalog ? (
              <div className="flex justify-center py-16" role="status">
                <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
                <span className="sr-only">Cargando la carta…</span>
              </div>
            ) : products.length === 0 ? (
              <p className="py-10 text-center text-sm text-carbon/60">{query ? `Nada coincide con «${query}».` : 'Sin productos.'}</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((item) => {
                  const inCart = cart.find((l) => String(l.id) === item.id)?.qty ?? 0;
                  const agotado = item.available === false;
                  const sinPrecio = item.priceCents === undefined;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => add(item)}
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

            <UltimasVentas ventas={ultimas} onRefresh={loadUltimas} />
          </section>

          {/* Escritorio y tablet: pedido en columna */}
          <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Pedido">
            {cartPanel}
          </aside>
        </div>
      </div>

      {/* Móvil: barra fija abajo que despliega el pedido */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-piedra/50 bg-marfil/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`btn-vino w-full justify-between py-3.5 text-base ${focusRing}`}
          aria-expanded={sheetOpen}
        >
          <span className="inline-flex items-center gap-2">
            <ShoppingBag size={18} aria-hidden="true" /> Pedido ({units})
          </span>
          <span className="inline-flex items-center gap-2 font-bold">
            {formatEuros(total)} <ChevronUp size={18} aria-hidden="true" />
          </span>
        </button>
      </div>
      {sheetOpen && (
        <div className="fixed inset-0 z-[150] flex items-end bg-carbon/60 animate-fade-in lg:hidden" onClick={() => setSheetOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pedido"
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-r-lg bg-marfil p-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] animate-slide-down"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Cerrar pedido" className={`flex h-9 w-9 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}>
                <X size={20} />
              </button>
            </div>
            {cartPanel}
          </div>
        </div>
      )}

      {done && <VentaHecha done={done} onClose={closeDone} />}
    </PageShell>
  );
}

function CartPanel({
  cart,
  total,
  metodo,
  charging,
  error,
  onQty,
  onMetodo,
  onCharge,
  onClear,
}: {
  cart: CartLine[];
  total: number;
  metodo: Metodo | null;
  charging: boolean;
  error: string | null;
  onQty: (id: number, delta: number) => void;
  onMetodo: (m: Metodo) => void;
  onCharge: () => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-r-lg border border-piedra/50 bg-white p-4 shadow-md">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold text-vino">Pedido</h2>
        {cart.length > 0 && (
          <button type="button" onClick={onClear} disabled={charging} className={`inline-flex items-center gap-1 rounded-r-sm text-xs font-semibold text-carbon/60 hover:text-vino ${focusRing}`}>
            <Trash2 size={14} aria-hidden="true" /> Vaciar
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="py-8 text-center text-sm text-carbon/55">Toca un producto para añadirlo.</p>
      ) : (
        <ul className="mt-3 divide-y divide-carbon/10" aria-live="polite">
          {cart.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-carbon">{l.name}</p>
                <p className="text-xs text-carbon/55">{formatEuros(l.priceCents)} · #{l.id}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onQty(l.id, -1)} disabled={charging} aria-label={`Quitar uno de ${l.name}`} className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/20 ${focusRing}`}>
                  <Minus size={16} />
                </button>
                <span className="w-7 text-center font-bold tabular-nums">{l.qty}</span>
                <button type="button" onClick={() => onQty(l.id, 1)} disabled={charging} aria-label={`Añadir uno de ${l.name}`} className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/20 ${focusRing}`}>
                  <Plus size={16} />
                </button>
              </div>
              <span className="w-20 text-right font-semibold tabular-nums">{formatEuros(l.priceCents * l.qty)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-baseline justify-between border-t border-carbon/15 pt-3">
        <span className="text-sm font-semibold text-carbon/70">Total</span>
        <span className="font-display text-3xl font-bold text-vino tabular-nums">{formatEuros(total)}</span>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-carbon/60">Cómo paga</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(METODOS) as Metodo[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metodo === m}
              onClick={() => onMetodo(m)}
              disabled={charging}
              className={`min-h-12 rounded-r-sm border text-sm font-semibold transition-colors ${focusRing} ${
                metodo === m ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino'
              }`}
            >
              {METODOS[m]}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      <button
        type="button"
        onClick={onCharge}
        disabled={charging || cart.length === 0 || !metodo}
        aria-busy={charging}
        className={`btn-vino mt-4 min-h-14 w-full text-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-vino ${focusRing}`}
      >
        {charging ? (
          <>
            <Loader2 size={20} className="animate-spin" aria-hidden="true" /> Cobrando…
          </>
        ) : cart.length === 0 ? (
          'Cobrar'
        ) : !metodo ? (
          'Elige cómo paga'
        ) : (
          `Cobrar ${formatEuros(total)}`
        )}
      </button>
    </div>
  );
}

function UltimasVentas({ ventas, onRefresh }: { ventas: Venta[]; onRefresh: () => void }) {
  return (
    <section aria-labelledby="ultimas-title" className="mt-8">
      <div className="flex items-center justify-between">
        <h2 id="ultimas-title" className="font-display text-xl font-semibold text-vino">Últimas ventas</h2>
        <button type="button" onClick={onRefresh} aria-label="Actualizar últimas ventas" className={`flex h-9 w-9 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}>
          <RefreshCw size={16} />
        </button>
      </div>
      {ventas.length === 0 ? (
        <p className="mt-2 text-sm text-carbon/55">Aún no hay ventas.</p>
      ) : (
        <ul className="mt-2 divide-y divide-carbon/10 rounded-r-md border border-piedra/40 bg-white/80">
          {ventas.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-carbon/60 tabular-nums">
                {new Date(v.cobrado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · nº {v.numero}
              </span>
              <span className="text-carbon/60">{METODOS[v.metodo]}</span>
              <span className="font-semibold tabular-nums">{formatEuros(v.total_centimos)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Confirmación a pantalla completa: vuelve sola a los 3 s. */
function VentaHecha({ done, onClose }: { done: { venta: VentaResultado; clientTotal: number }; onClose: () => void }) {
  const { venta, clientTotal } = done;
  const buttonRef = useRef<HTMLButtonElement>(null);
  useScrollLock(true);

  useEffect(() => {
    buttonRef.current?.focus();
    const timer = window.setTimeout(onClose, venta.repetida || venta.total_centimos !== clientTotal ? 6000 : 3000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, venta, clientTotal]);

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Venta registrada" className="fixed inset-0 z-[200] flex flex-col bg-[#2f6b3f] px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+32px)] text-white animate-fade-in">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center text-center">
        <CheckCircle2 size={88} aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.28em] opacity-85">Venta registrada · nº {venta.numero}</p>
        <p className="mt-3 font-display text-[3.2rem] font-semibold leading-none" aria-live="assertive">
          {formatEuros(venta.total_centimos)}
        </p>
        <p className="mt-2 text-lg opacity-90">{METODOS[venta.metodo]}</p>
        {venta.repetida && (
          <p className="mt-4 rounded-r-sm bg-white/15 px-3 py-2 text-sm">Esta venta ya estaba registrada: no se ha cobrado dos veces.</p>
        )}
        {!venta.repetida && venta.total_centimos !== clientTotal && (
          <p className="mt-4 rounded-r-sm bg-white/15 px-3 py-2 text-sm">
            Algún precio había cambiado: el total es el de la carta actual ({formatEuros(venta.total_centimos)}).
          </p>
        )}
      </div>
      <button ref={buttonRef} type="button" onClick={onClose} className="mx-auto mt-6 flex min-h-16 w-full max-w-[460px] items-center justify-center rounded-r-md bg-white text-lg font-bold text-[#1f4a2b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
        Nueva venta
      </button>
    </div>
  );
}
