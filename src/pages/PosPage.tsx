import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronUp,
  ClipboardCheck,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Ticket,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { Notice, focusRing } from '@/components/club/FormControls';
import { ProductPicker } from '@/components/pos/ProductPicker';
import { MesasPanel } from '@/components/pos/MesasPanel';
import { VentaHecha } from '@/components/pos/VentaHecha';
import { JustificanteModal } from '@/components/pos/Justificante';
import { justificanteDeVenta, lugarDeVenta } from '@/lib/justificante';
import { CierreJornadaModal } from '@/components/pos/CierreJornada';
import { TicketPromoModal, type TicketElegido } from '@/components/pos/TicketPromoModal';
import { useCatalog, type MenuItem, type MenuTab } from '@/lib/catalog';
import { loadSoundEnabled, playFeedback, saveSoundEnabled } from '@/lib/feedback';
import { useScrollLock } from '@/lib/useScrollLock';
import { getHashParams } from '@/lib/router';
import { usePromoStates } from '@/lib/tickets';
import {
  METODOS,
  TIPOS_PROMO,
  fetchUltimasVentas,
  formatEuros,
  newRequestId,
  promosParaVender,
  ventaBarra,
  type ItemPedido,
  type Metodo,
  type PromoVenta,
  type Venta,
  type VentaResultado,
} from '@/lib/pos';

/** Mesas y Barra: cuentas abiertas que se cobran al final. Venta rápida: se anota y se cobra al momento. */
type Modo = 'mesas' | 'barra' | 'rapida';

const MODOS: { id: Modo; label: string }[] = [
  { id: 'mesas', label: 'Mesas' },
  { id: 'barra', label: 'Barra' },
  { id: 'rapida', label: 'Venta rápida' },
];

interface CartLine {
  /** Producto: "p:15". Promo: "promo:<id>", o "promo:<id>:<ticket>" si es de club. */
  key: string;
  kind: 'producto' | 'promo';
  /** Código del producto o id de la promo. */
  id: string;
  name: string;
  priceCents: number;
  qty: number;
  tipo?: PromoVenta['tipo'];
  ticket?: TicketElegido;
}

function toItem(l: CartLine): ItemPedido {
  return l.kind === 'producto'
    ? { product_id: Number(l.id), cantidad: l.qty }
    : { promo_id: l.id, cantidad: l.qty, ...(l.ticket ? { ticket_codigo: l.ticket.codigo } : {}) };
}

/** TPV (#/pos): pestañas Mesas (cuentas de mesa) y Barra (venta rápida). Solo camareros. */
export function PosPage() {
  const { catalog, fromBackup } = useCatalog();
  const tabs = useMemo(() => catalog?.menuTabs ?? [], [catalog]);
  const { states } = usePromoStates();
  const promos = useMemo(() => promosParaVender(catalog?.promotions ?? [], states), [catalog, states]);
  const [modo, setModo] = useState<Modo>(() => {
    const m = getHashParams().get('modo');
    return m === 'barra' || m === 'rapida' ? m : 'mesas';
  });
  const [soundOn, setSoundOn] = useState(loadSoundEnabled);
  const [cerrando, setCerrando] = useState(false);
  // Pantalla completa (portátil táctil en la barra): sin el menú ni el pie de la web, a todo el ancho
  // y, si el navegador lo permite, sin sus barras. Se sale con el botón o con Esc.
  const [completa, setCompleta] = useState(false);

  const entrarCompleta = async () => {
    setCompleta(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Sin permiso o sin soporte (p. ej. iPhone): se queda el modo compacto igualmente.
    }
  };

  const salirCompleta = async () => {
    setCompleta(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ya había salido.
      }
    }
  };

  // Si se sale de la pantalla completa del navegador (Esc), se vuelve también a la vista normal.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setCompleta(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const elegirModo = (m: Modo) => {
    setModo(m);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/pos?modo=${m}`);
  };

  const toggleSound = () =>
    setSoundOn((on) => {
      saveSoundEnabled(!on);
      return !on;
    });

  const roundButton = `flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-carbon/20 bg-white text-sm font-semibold text-carbon/75 hover:border-vino hover:text-vino ${focusRing}`;

  const botones = (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" onClick={() => setCerrando(true)} className={`${roundButton} px-4`}>
        <ClipboardCheck size={18} aria-hidden="true" />
        <span className="hidden sm:inline">Cerrar jornada</span>
        <span className="sr-only sm:hidden">Cerrar jornada</span>
      </button>
      <button type="button" onClick={toggleSound} aria-pressed={soundOn} className={`${roundButton} w-12`}>
        {soundOn ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
        <span className="sr-only">{soundOn ? 'Silenciar sonido' : 'Activar sonido'}</span>
      </button>
      <button
        type="button"
        onClick={completa ? salirCompleta : entrarCompleta}
        aria-pressed={completa}
        className={`${roundButton} ${completa ? 'w-12 border-vino text-vino' : 'px-4'}`}
      >
        {completa ? <Minimize2 size={20} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        {!completa && <span className="hidden sm:inline">Pantalla completa</span>}
        <span className={completa ? 'sr-only' : 'sr-only sm:hidden'}>{completa ? 'Salir de pantalla completa' : 'Pantalla completa'}</span>
      </button>
    </div>
  );

  const pestanas = (
    <div role="tablist" aria-label="Modo del TPV" className={`grid grid-cols-3 rounded-r-sm bg-piedra-suave p-1 ${completa ? 'w-[420px] max-w-full' : 'mt-4 max-w-[480px]'}`}>
      {MODOS.map(({ id: m, label }) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={modo === m}
          onClick={() => elegirModo(m)}
          className={`rounded-r-sm px-3 font-semibold transition-all ${completa ? 'py-3 text-base' : 'py-2.5 text-sm'} ${focusRing} ${
            modo === m ? 'bg-vino text-white shadow-sm' : 'text-carbon/70 hover:text-vino'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const contenido = (
    <>
      {cerrando && <CierreJornadaModal onClose={() => setCerrando(false)} />}

      {fromBackup && (
        <div className="mb-4">
          <Notice kind="error">
            Sin conexión con la base de datos: se muestra una copia de la carta. Los cobros no funcionarán hasta que vuelva.
          </Notice>
        </div>
      )}

      {modo === 'mesas' ? (
        <>
          <MesasPanel key="mesa" tipo="mesa" tabs={tabs} promos={promos} catalogLoading={!catalog} soundOn={soundOn} />
          <UltimasVentas />
        </>
      ) : modo === 'barra' ? (
        <>
          <MesasPanel key="barra" tipo="barra" tabs={tabs} promos={promos} catalogLoading={!catalog} soundOn={soundOn} />
          <UltimasVentas />
        </>
      ) : (
        <VentaRapidaPanel tabs={tabs} promos={promos} catalogLoading={!catalog} soundOn={soundOn} completa={completa} />
      )}
    </>
  );

  if (completa) {
    return (
      <main className="min-h-[100dvh] bg-marfil px-3 pb-4 pt-3 sm:px-5">
        <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-piedra/50 pb-3">
          <h1 className="font-display text-2xl font-semibold text-vino">TPV</h1>
          {pestanas}
          <div className="ml-auto">{botones}</div>
        </header>
        {contenido}
      </main>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-container">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-vino">Personal del bar</div>
            <h1 className="mt-2 font-display text-[2.2rem] font-semibold leading-[1.05] text-vino sm:text-[2.6rem]">TPV</h1>
          </div>
          <div className="mt-1">{botones}</div>
        </header>
        {pestanas}
        <div className="divider-gold mb-5 ml-0 mt-4" />
        {contenido}
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------
// Venta rápida: se anota y se cobra al momento (la antigua pestaña «Barra», P2)
// ---------------------------------------------------------------------

function VentaRapidaPanel({
  tabs,
  promos,
  catalogLoading,
  soundOn,
  completa,
}: {
  tabs: MenuTab[];
  promos: PromoVenta[];
  catalogLoading: boolean;
  soundOn: boolean;
  /** Pantalla completa: sin el menú de la web encima. */
  completa: boolean;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pidiendoTicket, setPidiendoTicket] = useState<PromoVenta | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ venta: VentaResultado; clientTotal: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recargaUltimas, setRecargaUltimas] = useState(0);
  const chargingRef = useRef(false);

  useScrollLock(sheetOpen);
  const closeDone = useCallback(() => setDone(null), []);

  const total = cart.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const units = cart.reduce((sum, l) => sum + l.qty, 0);
  const qtyById = useMemo(() => new Map(cart.filter((l) => l.kind === 'producto').map((l) => [l.id, l.qty])), [cart]);
  const promoQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of cart) if (l.kind === 'promo') map.set(l.id, (map.get(l.id) ?? 0) + l.qty);
    return map;
  }, [cart]);

  const addLine = (line: Omit<CartLine, 'qty'>) => {
    setError(null);
    setCart((prev) => {
      const found = prev.find((l) => l.key === line.key);
      if (found) return prev.map((l) => (l.key === line.key ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [...prev, { ...line, qty: 1 }];
    });
  };

  const add = (item: MenuItem) => {
    if (!item.id || item.priceCents === undefined || item.available === false) return;
    addLine({ key: `p:${item.id}`, kind: 'producto', id: item.id, name: item.name ?? '', priceCents: item.priceCents });
  };

  // Las promos del club piden antes el ticket del socio; las demás se añaden sin más.
  const addPromo = (p: PromoVenta) => {
    if (p.priceCents === undefined || !p.activa) return;
    if (p.soloClub) setPidiendoTicket(p);
    else addLine({ key: `promo:${p.id}`, kind: 'promo', id: p.id, name: p.nombre, priceCents: p.priceCents, tipo: p.tipo });
  };

  const addPromoConTicket = (p: PromoVenta, ticket: TicketElegido) => {
    setPidiendoTicket(null);
    addLine({ key: `promo:${p.id}:${ticket.codigo}`, kind: 'promo', id: p.id, name: p.nombre, priceCents: p.priceCents ?? 0, tipo: p.tipo, ticket });
  };

  // Una promo con ticket va de una en una: solo se puede quitar.
  const changeQty = (key: string, delta: number) =>
    setCart((prev) =>
      prev.flatMap((l) =>
        l.key !== key ? [l] : l.qty + delta <= 0 ? [] : l.ticket ? [l] : [{ ...l, qty: Math.min(99, l.qty + delta) }]
      )
    );

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
    const { venta, error: err } = await ventaBarra(cart.map(toItem), metodo, requestId);
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
    setRecargaUltimas((n) => n + 1);
  };

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
    <div className="pb-24 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <section aria-label="Productos">
          <ProductPicker
            tabs={tabs}
            loading={catalogLoading}
            qtyById={qtyById}
            onAdd={add}
            idPrefix="barra"
            promos={promos}
            onAddPromo={addPromo}
            promoQty={promoQty}
          />
          <UltimasVentas recarga={recargaUltimas} />
        </section>
        <aside className={`hidden lg:sticky lg:block ${completa ? 'lg:top-3' : 'lg:top-24'}`} aria-label="Pedido">
          {cartPanel}
        </aside>
      </div>

      {/* Móvil: barra fija abajo que despliega el pedido */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-piedra/50 bg-marfil/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setSheetOpen(true)} className={`btn-vino w-full justify-between py-3.5 text-base ${focusRing}`} aria-expanded={sheetOpen}>
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

      {pidiendoTicket && (
        <TicketPromoModal
          promo={pidiendoTicket}
          usados={cart.flatMap((l) => (l.ticket ? [l.ticket.codigo] : []))}
          soundOn={soundOn}
          onClose={() => setPidiendoTicket(null)}
          onConfirm={(ticket) => addPromoConTicket(pidiendoTicket, ticket)}
        />
      )}

      {done && <VentaHecha venta={done.venta} clientTotal={done.clientTotal} titulo="Venta rápida" onClose={closeDone} />}
    </div>
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
  onQty: (key: string, delta: number) => void;
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
            <li key={l.key} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-carbon">{l.name}</p>
                <p className="text-xs text-carbon/55">
                  {formatEuros(l.priceCents)} · {l.kind === 'producto' ? `#${l.id}` : TIPOS_PROMO[l.tipo ?? 'pack']}
                </p>
                {l.ticket && (
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-vino">
                    <Ticket size={12} aria-hidden="true" /> {l.ticket.codigo}
                    {l.ticket.socio ? ` · ${l.ticket.socio}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onQty(l.key, -1)} disabled={charging} aria-label={`Quitar uno de ${l.name}`} className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/20 ${focusRing}`}>
                  <Minus size={16} />
                </button>
                <span className="w-7 text-center font-bold tabular-nums">{l.qty}</span>
                <button type="button" onClick={() => onQty(l.key, 1)} disabled={charging || !!l.ticket} aria-label={`Añadir uno de ${l.name}`} className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/20 ${focusRing}`}>
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

/** Últimas ventas de todo el TPV, con su justificante (para reimprimirlo). `recarga` cambia tras cobrar. */
function UltimasVentas({ recarga = 0 }: { recarga?: number }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [justificante, setJustificante] = useState<Venta | null>(null);

  const load = useCallback(async () => {
    const { ventas: rows } = await fetchUltimasVentas(8);
    setVentas(rows);
  }, []);

  useEffect(() => {
    load();
  }, [load, recarga]);

  return (
    <section aria-labelledby="ultimas-title" className="mt-8">
      <div className="flex items-center justify-between">
        <h2 id="ultimas-title" className="font-display text-xl font-semibold text-vino">Últimas ventas</h2>
        <button type="button" onClick={load} aria-label="Actualizar últimas ventas" className={`flex h-9 w-9 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}>
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
              <span className="min-w-0 flex-1 truncate text-carbon/60">
                {lugarDeVenta(v)} · {METODOS[v.metodo]}
              </span>
              <span className="font-semibold tabular-nums">{formatEuros(v.total_centimos)}</span>
              <button
                type="button"
                onClick={() => setJustificante(v)}
                aria-label={`Justificante de la venta nº ${v.numero}`}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-carbon/20 text-carbon/70 hover:border-vino hover:text-vino ${focusRing}`}
              >
                <Receipt size={17} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {justificante && <JustificanteModal datos={justificanteDeVenta(justificante)} onClose={() => setJustificante(null)} />}
    </section>
  );
}
