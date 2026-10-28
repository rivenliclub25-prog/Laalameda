import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, Gift, Loader2, LogIn, Minus, Plus, Send, Ticket, X, XCircle } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { ClubCard, Notice, focusRing } from '@/components/club/FormControls';
import { useAuth } from '@/auth/AuthContext';
import { getHashParams, navigate, routeHref } from '@/lib/router';
import { useCatalog } from '@/lib/catalog';
import { TIPOS_PROMO, formatEuros, newRequestId, promosParaVender, type PromoVenta } from '@/lib/pos';
import { usePromoStates } from '@/lib/tickets';
import { fetchMisPedidos, mesaInfo, mesasParaPedir, pedirRonda, pedirRondaMesa, type MesaInfo, type MiPedido } from '@/lib/mesaPedido';
import { subscribeChanges } from '@/lib/realtime';
import { useScrollLock } from '@/lib/useScrollLock';

/** Mismos límites que socio_pedir_ronda (supabase/pos-pedidos.sql). */
const MAX_UNIDADES_RONDA = 20;

/** Clave: código del producto ("15") o "promo:<id>". */
type Carrito = Record<string, number>;

const PROMO_KEY = /^promo:([a-z0-9-]+)$/;

/** Una línea del carrito, ya con su nombre y precio de la carta. */
interface LineaCarrito {
  key: string;
  nombre: string;
  priceCents: number;
  cantidad: number;
  promo?: PromoVenta;
}

const cartKey = (token: string) => `alameda-mesa-carrito-${token}`;

/** El carrito se guarda en la pestaña para que sobreviva a iniciar sesión. */
function loadCart(token: string): Carrito {
  try {
    const raw = window.sessionStorage.getItem(cartKey(token));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const cart: Carrito = {};
    for (const [id, qty] of Object.entries(parsed as Record<string, unknown>)) {
      if ((/^\d+$/.test(id) || PROMO_KEY.test(id)) && typeof qty === 'number' && qty > 0) cart[id] = Math.min(Math.floor(qty), MAX_UNIDADES_RONDA);
    }
    return cart;
  } catch {
    return {};
  }
}

function saveCart(token: string, cart: Carrito) {
  try {
    if (Object.keys(cart).length === 0) window.sessionStorage.removeItem(cartKey(token));
    else window.sessionStorage.setItem(cartKey(token), JSON.stringify(cart));
  } catch {
    // Sin almacenamiento (modo privado): el carrito vive solo en memoria.
  }
}

const estadoRonda: Record<MiPedido['estado'], { label: string; className: string }> = {
  pendiente: { label: 'Esperando al camarero', className: 'bg-[#a86b00]/12 text-[#7a4e00]' },
  aceptada: { label: 'Aceptada · en preparación', className: 'bg-vino/10 text-vino' },
  servida: { label: 'Servida', className: 'bg-[#2f6b3f]/12 text-[#1f4a2b]' },
  anulada: { label: 'Rechazada', className: 'bg-carbon/10 text-carbon/70' },
};

/** Estado de una ronda a partir de sus líneas: la más atrasada manda. */
function estadoDeRonda(lineas: MiPedido[]): MiPedido['estado'] {
  const activas = lineas.filter((l) => l.estado !== 'anulada');
  if (activas.length === 0) return 'anulada';
  if (activas.some((l) => l.estado === 'pendiente')) return 'pendiente';
  if (activas.some((l) => l.estado === 'aceptada')) return 'aceptada';
  return 'servida';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cómo se llegó a la mesa: leyendo su QR o eligiéndola a mano desde la carta (#/pedir). */
type Origen = { kind: 'qr'; token: string } | { kind: 'mano'; mesaId: string };

/**
 * "#/mesa?m=<token>": un socio pide desde la mesa leyendo su QR.
 * "#/mesa?n=<id>": la eligió a mano en #/pedir (el TPV lo marca para que el camarero lo compruebe).
 * Se paga al camarero al final.
 */
export function MesaPage() {
  const [origen] = useState<Origen | null>(() => {
    const params = getHashParams();
    const m = params.get('m') ?? '';
    if (/^[A-Za-z0-9_-]{8,64}$/.test(m)) return { kind: 'qr', token: m };
    const n = params.get('n') ?? '';
    return UUID.test(n) ? { kind: 'mano', mesaId: n } : null;
  });
  // Clave del carrito guardado en la pestaña.
  const token = origen ? (origen.kind === 'qr' ? origen.token : `n-${origen.mesaId}`) : null;
  const { session, user, loading: authLoading } = useAuth();
  const { catalog } = useCatalog();
  const { states } = usePromoStates();

  const uidActual = user?.id ?? null;
  const [mesa, setMesa] = useState<MesaInfo | null>(null);
  const [mesaState, setMesaState] = useState<'cargando' | 'ok' | 'invalida' | 'error'>(token ? 'cargando' : 'invalida');
  const [mesaError, setMesaError] = useState<string | null>(null);

  const [cart, setCart] = useState<Carrito>(() => (token ? loadCart(token) : {}));
  const [category, setCategory] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [envioError, setEnvioError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  const [pedidos, setPedidos] = useState<MiPedido[]>([]);

  const loadMesa = useCallback(async () => {
    if (!origen) return;
    if (origen.kind === 'mano') {
      // Elegir la mesa a mano exige sesión: sin ella, se vuelve a #/pedir (que pide iniciar sesión).
      if (authLoading) return;
      if (!uidActual) {
        navigate('/pedir', { replace: true });
        return;
      }
      setMesaState('cargando');
      const { mesas, error } = await mesasParaPedir();
      const found = mesas.find((m) => m.id === origen.mesaId);
      if (error) {
        setMesaError(error);
        setMesaState('error');
      } else if (!found) {
        setMesaState('invalida');
      } else {
        setMesa({ id: found.id, nombre: found.nombre, activa: true });
        setMesaState('ok');
      }
      return;
    }
    setMesaState('cargando');
    const { mesa: info, error } = await mesaInfo(origen.token);
    if (error) {
      setMesaError(error);
      setMesaState('error');
    } else if (!info || !info.activa) {
      setMesaState('invalida');
    } else {
      setMesa(info);
      setMesaState('ok');
    }
  }, [origen, authLoading, uidActual]);

  useEffect(() => {
    loadMesa();
  }, [loadMesa]);

  useEffect(() => {
    if (token) saveCart(token, cart);
  }, [token, cart]);

  // Mis pedidos en esta mesa, en directo (Realtime) y con un repaso cada 10 s por si se corta.
  const mesaId = mesa?.id ?? null;
  const uid = user?.id ?? null;
  useEffect(() => {
    if (!mesaId || !uid) {
      setPedidos([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { pedidos: rows, error } = await fetchMisPedidos(mesaId);
      if (!cancelled && !error) setPedidos(rows);
    };
    load();
    const unsubscribe = subscribeChanges('mesa-socio', [{ table: 'order_items', filter: `pedido_por=eq.${uid}` }], load);
    const timer = window.setInterval(load, 10_000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mesaId, uid]);

  const tabs = useMemo(
    () =>
      (catalog?.menuTabs ?? [])
        .map((t) => ({ ...t, items: t.items.filter((i) => i.id && i.name && i.priceCents != null) }))
        .filter((t) => t.items.length > 0),
    [catalog]
  );
  const productos = useMemo(() => {
    const map = new Map<string, { nombre: string; priceCents: number }>();
    for (const t of tabs) for (const i of t.items) map.set(i.id!, { nombre: i.name!, priceCents: i.priceCents! });
    return map;
  }, [tabs]);
  // Promos que el socio puede pedir: encendidas y con precio (fuera de horario se ven, pero no se piden).
  const promos = useMemo(
    () => promosParaVender(catalog?.promotions ?? [], states).filter((p) => p.activa && p.priceCents !== undefined),
    [catalog, states]
  );
  const promoPorId = useMemo(() => new Map(promos.map((p) => [p.id, p])), [promos]);
  const activeCategory = category ?? tabs[0]?.id ?? null;
  const visibles = tabs.find((t) => t.id === activeCategory)?.items ?? [];

  // Solo cuenta lo que sigue en la carta (un producto o promo retirados desaparecen del carrito).
  const lineas: LineaCarrito[] = Object.entries(cart).flatMap(([key, cantidad]) => {
    const promoId = key.match(PROMO_KEY)?.[1];
    if (promoId) {
      const promo = promoPorId.get(promoId);
      return promo && promo.enHorario ? [{ key, nombre: promo.nombre, priceCents: promo.priceCents ?? 0, cantidad, promo }] : [];
    }
    const p = productos.get(key);
    return p ? [{ key, nombre: p.nombre, priceCents: p.priceCents, cantidad }] : [];
  });
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const total = lineas.reduce((s, l) => s + l.cantidad * l.priceCents, 0);

  /** max: 1 para las promos del club (cada una usa un ticket). */
  const changeQty = (id: string, delta: number, max = MAX_UNIDADES_RONDA) => {
    setEnviada(false);
    requestIdRef.current = null;
    setCart((prev) => {
      const current = prev[id] ?? 0;
      const totalOthers = Object.entries(prev).reduce((s, [k, q]) => (k === id ? s : s + q), 0);
      const next = Math.max(0, Math.min(current + delta, max, MAX_UNIDADES_RONDA - totalOthers));
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  };

  const enviar = async () => {
    if (!origen || enviando || lineas.length === 0) return;
    // El mismo id en los reintentos: si la primera llegó, la base de datos no la duplica.
    requestIdRef.current ??= newRequestId();
    setEnviando(true);
    setEnvioError(null);
    const items = lineas.map((l) =>
      l.promo ? { promo_id: l.promo.id, cantidad: l.cantidad } : { product_id: Number(l.key), cantidad: l.cantidad }
    );
    const { ok, error } =
      origen.kind === 'qr'
        ? await pedirRonda(origen.token, items, requestIdRef.current)
        : await pedirRondaMesa(origen.mesaId, items, requestIdRef.current);
    setEnviando(false);
    if (!ok) {
      setEnvioError(error);
      return;
    }
    requestIdRef.current = null;
    setCart({});
    setConfirmando(false);
    setEnviada(true);
    if (mesaId) fetchMisPedidos(mesaId).then(({ pedidos: rows, error: e }) => !e && setPedidos(rows));
  };

  const rondas = useMemo(() => {
    const groups = new Map<string, MiPedido[]>();
    for (const p of pedidos) {
      const key = p.ronda ?? p.id;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()].map(([ronda, items]) => ({ ronda, items, estado: estadoDeRonda(items), at: items[0].created_at }));
  }, [pedidos]);
  // Promos del club que ya están en una ronda pendiente (su ticket está reservado).
  const promosEnPedido = new Set(pedidos.filter((p) => p.estado === 'pendiente' && p.promo_id).map((p) => p.promo_id!));
  const miTotal = pedidos
    .filter((p) => p.estado !== 'anulada' && p.estado !== 'pendiente')
    .reduce((s, p) => s + p.cantidad * p.precio_unitario_centimos, 0);

  if (mesaState === 'invalida' || mesaState === 'error' || mesaState === 'cargando') {
    return (
      <PageShell>
        <div className="mx-auto max-w-md">
          <ClubCard>
            {mesaState === 'cargando' ? (
              <p className="flex items-center justify-center gap-2 py-6 text-carbon/70">
                <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Buscando tu mesa…
              </p>
            ) : mesaState === 'error' ? (
              <div className="space-y-4">
                <Notice kind="error">{mesaError}</Notice>
                <button type="button" onClick={loadMesa} className={`btn-outline-vino w-full ${focusRing}`}>
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="py-4 text-center">
                <XCircle size={40} className="mx-auto text-vino" aria-hidden="true" />
                <h1 className="mt-3 font-display text-2xl font-semibold text-vino">
                  {origen?.kind === 'mano' ? 'Esa mesa ya no está disponible' : 'Este QR no es válido'}
                </h1>
                <p className="mt-2 text-carbon/75">Pide ayuda al camarero.</p>
                <a href={routeHref('/pedir')} className={`btn-outline-vino mt-4 inline-flex ${focusRing}`}>
                  Elegir mi mesa
                </a>
              </div>
            )}
          </ClubCard>
        </div>
      </PageShell>
    );
  }

  const loginHref =
    origen?.kind === 'qr' ? routeHref('/club', { modo: 'login', volver: 'mesa', m: origen.token }) : routeHref('/club', { modo: 'login', volver: 'pedir' });

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl pb-28">
        <div className="text-center">
          <div className="eyebrow text-vino">Pedir desde la mesa</div>
          <h1 className="mt-2 font-display text-[2.2rem] font-semibold leading-tight text-vino">Estás en {mesa!.nombre}</h1>
          {origen?.kind === 'mano' && (
            <a href={routeHref('/pedir')} className={`mt-1 inline-block text-sm font-semibold text-vino underline-offset-4 hover:underline ${focusRing}`}>
              ¿No es tu mesa? Cambiar
            </a>
          )}
          <p className="mt-2 text-carbon/75">Elige, envía la ronda y el camarero te la trae. Se paga al camarero al final.</p>
          {promos.length === 0 && (
            <a href="#promos" className={`mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-vino underline-offset-4 hover:underline ${focusRing}`}>
              <Gift size={16} aria-hidden="true" /> Ver promos del club
            </a>
          )}
        </div>

        {!authLoading && !session && (
          <div className="mt-6 rounded-r-sm border border-vino/25 bg-vino/5 p-4 text-center">
            <p className="text-carbon/85">
              Para pedir desde la mesa tienes que ser socio del club. Puedes ir eligiendo: tu pedido se guarda mientras inicias sesión.
            </p>
            <a href={loginHref} className={`btn-vino mt-3 inline-flex items-center gap-2 ${focusRing}`}>
              <LogIn size={18} aria-hidden="true" /> Iniciar sesión o hacerme socio
            </a>
          </div>
        )}

        {enviada && (
          <div className="mt-6">
            <Notice kind="success">Ronda enviada · esperando a que el camarero la acepte.</Notice>
          </div>
        )}

        {rondas.length > 0 && (
          <section className="mt-6" aria-labelledby="mis-pedidos">
            <h2 id="mis-pedidos" className="text-xs font-semibold uppercase tracking-wider text-carbon/60">
              Mis pedidos en esta mesa
            </h2>
            <ul className="mt-2 space-y-2">
              {rondas.map((r) => {
                const est = estadoRonda[r.estado];
                return (
                  <li key={r.ronda} className="rounded-r-sm border border-carbon/15 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-carbon/60">
                        <Clock size={14} aria-hidden="true" />
                        {new Date(r.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${est.className}`}>{est.label}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {r.items.map((p) => (
                        <li key={p.id} className={`flex justify-between gap-3 ${p.estado === 'anulada' ? 'text-carbon/45 line-through' : ''}`}>
                          <span>
                            {p.cantidad} × {p.nombre}
                            {p.ticket_codigo && (
                              <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-semibold text-vino">
                                <Ticket size={12} aria-hidden="true" /> {p.ticket_codigo}
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums">{formatEuros(p.cantidad * p.precio_unitario_centimos)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            {miTotal > 0 && (
              <p className="mt-2 text-right text-sm text-carbon/75">
                Lo tuyo hasta ahora: <strong className="tabular-nums text-carbon">{formatEuros(miTotal)}</strong>
              </p>
            )}
          </section>
        )}

        {promos.length > 0 && (
          <section className="mt-8" aria-labelledby="promos-mesa">
            <h2 id="promos-mesa" className="flex items-center gap-2 font-display text-2xl font-semibold text-vino">
              <Gift size={20} aria-hidden="true" /> Promos del club
            </h2>
            <p className="mt-1 text-sm text-carbon/65">Las del club usan tu ticket: si no lo tienes, se saca solo al enviar la ronda.</p>
            <ul className="mt-3 divide-y divide-carbon/10 rounded-r-sm border border-piedra bg-piedra-suave/30">
              {promos.map((p) => {
                const key = `promo:${p.id}`;
                const qty = cart[key] ?? 0;
                const enPedido = p.soloClub && promosEnPedido.has(p.id);
                const max = p.soloClub ? 1 : MAX_UNIDADES_RONDA;
                const bloqueada = !p.enHorario || enPedido;
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${bloqueada ? 'text-carbon/50' : 'text-carbon'}`}>{p.nombre}</p>
                      <p className="mt-0.5 text-xs text-carbon/60">
                        {TIPOS_PROMO[p.tipo]}
                        {p.soloClub ? ' · con tu ticket del club' : ''}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-vino">
                        {!p.enHorario ? (
                          <span className="text-carbon/50">Fuera de horario</span>
                        ) : enPedido ? (
                          <span className="text-carbon/50">Ya está en tu pedido pendiente</span>
                        ) : (
                          formatEuros(p.priceCents ?? 0)
                        )}
                      </p>
                    </div>
                    {!bloqueada && (
                      <div className="flex shrink-0 items-center gap-1">
                        {qty > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => changeQty(key, -1, max)}
                              aria-label={`Quitar ${p.nombre}`}
                              className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/25 text-carbon ${focusRing}`}
                            >
                              <Minus size={18} aria-hidden="true" />
                            </button>
                            <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
                              {qty}
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => changeQty(key, 1, max)}
                          disabled={qty >= max || unidades >= MAX_UNIDADES_RONDA}
                          aria-label={`Añadir ${p.nombre}`}
                          className={`flex h-10 w-10 items-center justify-center rounded-full bg-vino text-marfil disabled:opacity-40 ${focusRing}`}
                        >
                          <Plus size={18} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-8" aria-labelledby="carta-mesa">
          <h2 id="carta-mesa" className="sr-only">Carta</h2>
          {!catalog ? (
            <p className="flex items-center justify-center gap-2 py-8 text-carbon/70">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Cargando la carta…
            </p>
          ) : (
            <>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Categorías">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={t.id === activeCategory}
                    onClick={() => setCategory(t.id)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${focusRing} ${
                      t.id === activeCategory ? 'border-vino bg-vino text-marfil' : 'border-carbon/20 bg-white text-carbon/80 hover:border-vino/50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <ul className="mt-4 divide-y divide-carbon/10 rounded-r-sm border border-carbon/15 bg-white">
                {visibles.map((item) => {
                  const qty = cart[item.id!] ?? 0;
                  const agotado = item.available === false;
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold ${agotado ? 'text-carbon/45' : 'text-carbon'}`}>{item.name}</p>
                        {item.desc && <p className="mt-0.5 text-sm leading-snug text-carbon/60">{item.desc}</p>}
                        <p className="mt-1 text-sm font-semibold text-vino">
                          {agotado ? <span className="text-carbon/50">Agotado</span> : item.price}
                        </p>
                      </div>
                      {!agotado && (
                        <div className="flex shrink-0 items-center gap-1">
                          {qty > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => changeQty(item.id!, -1)}
                                aria-label={`Quitar un ${item.name}`}
                                className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/25 text-carbon ${focusRing}`}
                              >
                                <Minus size={18} aria-hidden="true" />
                              </button>
                              <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
                                {qty}
                              </span>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => changeQty(item.id!, 1)}
                            disabled={unidades >= MAX_UNIDADES_RONDA}
                            aria-label={`Añadir un ${item.name}`}
                            className={`flex h-10 w-10 items-center justify-center rounded-full bg-vino text-marfil disabled:opacity-40 ${focusRing}`}
                          >
                            <Plus size={18} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {unidades >= MAX_UNIDADES_RONDA && (
                <p className="mt-2 text-center text-sm text-carbon/65">Máximo {MAX_UNIDADES_RONDA} unidades por ronda.</p>
              )}
            </>
          )}
        </section>
      </div>

      {unidades > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-carbon/15 bg-marfil/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            {session ? (
              <button
                type="button"
                onClick={() => {
                  setEnvioError(null);
                  setConfirmando(true);
                }}
                className={`btn-vino flex w-full items-center justify-center gap-2 ${focusRing}`}
              >
                <Send size={18} aria-hidden="true" /> Enviar ronda ({unidades}) · {formatEuros(total)}
              </button>
            ) : (
              <a href={loginHref} className={`btn-vino flex w-full items-center justify-center gap-2 ${focusRing}`}>
                <LogIn size={18} aria-hidden="true" /> Inicia sesión para enviar ({unidades}) · {formatEuros(total)}
              </a>
            )}
          </div>
        </div>
      )}

      {confirmando && (
        <ConfirmarRonda
          lineas={lineas}
          total={total}
          mesa={mesa!.nombre}
          enviando={enviando}
          error={envioError}
          onClose={() => !enviando && setConfirmando(false)}
          onConfirm={enviar}
        />
      )}
    </PageShell>
  );
}

function ConfirmarRonda({
  lineas,
  total,
  mesa,
  enviando,
  error,
  onClose,
  onConfirm,
}: {
  lineas: LineaCarrito[];
  total: number;
  mesa: string;
  enviando: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useScrollLock(true);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-carbon/50 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirmar-ronda">
      <div className="w-full max-w-md rounded-t-r-md bg-marfil p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] shadow-xl sm:rounded-r-md">
        <div className="flex items-start justify-between gap-3">
          <h2 id="confirmar-ronda" className="font-display text-2xl font-semibold text-vino">
            Enviar ronda a {mesa}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={`rounded-full p-1 text-carbon/60 hover:text-carbon ${focusRing}`}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          {lineas.map((l) => (
            <li key={l.key} className="flex justify-between gap-3">
              <span>
                {l.cantidad} × {l.nombre}
                {l.promo?.soloClub && <span className="block text-xs text-carbon/60">Se usa tu ticket del club</span>}
              </span>
              <span className="tabular-nums">{formatEuros(l.cantidad * l.priceCents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-carbon/15 pt-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatEuros(total)}</span>
        </p>
        <p className="mt-3 flex items-start gap-2 text-sm text-carbon/70">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          No se paga ahora: se paga al camarero al final. El camarero confirmará la ronda.
        </p>
        {error && (
          <div className="mt-3">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        <button
          type="button"
          onClick={onConfirm}
          disabled={enviando}
          className={`btn-vino mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}
        >
          {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
          {enviando ? 'Enviando…' : 'Confirmar y enviar'}
        </button>
      </div>
    </div>
  );
}
