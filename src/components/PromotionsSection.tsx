import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, MessageCircle, UserRound, Users } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { useAuth } from '@/auth/AuthContext';
import {
  clubLoginHref,
  clubPromoWhatsappHref,
  findPromotion,
  formatPromotionDiscount,
  formatPromotionPrice,
  formatPromoPrice,
  isPromotionActive,
  isPromotionVisible,
  promoSegments,
  promotions,
  reservationHref,
  type Promotion,
  type PromoSegmentId,
} from '@/data/promos';

function PromotionCard({ promotion, highlighted }: { promotion: Promotion; highlighted: boolean }) {
  const { user } = useAuth();
  const reserveUrl = reservationHref(promotion);
  const pricePerPerson =
    promotion.priceCents !== undefined && promotion.people
      ? Math.round(promotion.priceCents / promotion.people)
      : null;

  return (
    <article
      id={`promo-${promotion.id}`}
      className={`flex h-full flex-col rounded-r-lg border border-piedra/50 bg-white/80 p-5 shadow-sm transition-shadow duration-500 ${
        highlighted ? 'ring-2 ring-vino ring-offset-2 ring-offset-marfil' : ''
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-vino/10 px-3 py-1 text-xs font-semibold text-vino">
          <Clock3 size={13} /> {promotion.scheduleLabel}
        </span>
        {promotion.people && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-carbon/70">
            <Users size={14} /> Para {promotion.people}
          </span>
        )}
      </div>

      <h3 className="font-display text-xl font-semibold text-carbon">{promotion.title}</h3>
      {promotion.description && (
        <p className="mt-1 text-sm text-carbon/70">{promotion.description}</p>
      )}
      <ul className="mt-3 space-y-1 text-sm text-carbon/75">
        {promotion.contents.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-piedra" aria-hidden="true">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1">
        {promotion.priceCents !== undefined ? (
          promotion.priceCents === 0 ? (
            <span className="font-display text-3xl font-bold text-vino">Gratis</span>
          ) : (
            <>
              {pricePerPerson !== null && (
              <span className="font-display text-2xl font-bold text-vino">
                {formatPromoPrice(pricePerPerson)}
                <span className="ml-1 text-sm font-semibold">por persona</span>
              </span>
            )}
            {pricePerPerson === null && (
              <span className="font-display text-3xl font-bold text-vino">
                {formatPromoPrice(promotion.priceCents)}
              </span>
            )}
            {pricePerPerson !== null && (
              <span className="text-sm font-semibold text-carbon">
                {formatPromoPrice(promotion.priceCents)} total
              </span>
            )}
            </>
          )
        ) : (
          <span className="font-display text-2xl font-bold text-vino">Consulta condiciones</span>
        )}
        {promotion.discount !== undefined && promotion.priceCents !== 0 && (
          <span className="inline-flex rounded-full bg-vino px-3 py-1 text-sm font-bold text-white shadow-sm">
            {formatPromotionDiscount(promotion.discount)}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-5">
        {user ? (
          <a
            href={clubPromoWhatsappHref(promotion, {
              nombre: user.user_metadata?.nombre as string | undefined,
              email: user.email,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-vino w-full"
          >
            <MessageCircle size={16} /> Activar con el club
          </a>
        ) : (
          <a href={clubLoginHref(promotion)} className="btn-vino w-full">
            <UserRound size={16} aria-hidden="true" /> Activar con el club
          </a>
        )}
        {reserveUrl && (
          <a
            href={reserveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline-vino w-full"
          >
            <MessageCircle size={16} /> Reservar por WhatsApp
          </a>
        )}
      </div>
    </article>
  );
}

export function PromotionsSection() {
  const [activeSegment, setActiveSegment] = useState<PromoSegmentId>('mananas');
  const [now, setNow] = useState(() => new Date());

  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // Un enlace "#promo-<id>" (desde Promos de hoy, la carta o al volver de iniciar sesión) abre la franja
  // de esa promo, baja hasta la tarjeta y la resalta un momento.
  useEffect(() => {
    let timer: number | undefined;
    const syncFromHash = () => {
      const match = window.location.hash.match(/^#promo-(.+)$/);
      const promotion = findPromotion(match ? decodeURIComponent(match[1]) : null);
      if (!promotion) return;

      setActiveSegment((prev) => (promotion.segmentIds.includes(prev) ? prev : promotion.segmentIds[0]));
      setHighlightId(promotion.id);
      window.requestAnimationFrame(() =>
        document.getElementById(`promo-${promotion.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHighlightId(null), 2500);
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.clearTimeout(timer);
    };
  }, []);

  const visiblePromotions = promotions.filter((promotion) => isPromotionVisible(promotion, now));
  const activePromotions = visiblePromotions.filter((promotion) =>
    isPromotionActive(promotion, now)
  );
  const segmentPromotions = visiblePromotions.filter((promotion) =>
    promotion.segmentIds.includes(activeSegment)
  );

  return (
    <section id="promos" className="bg-marfil py-16 lg:py-24">
      <div className="mx-auto max-w-container px-6">
        <Reveal className="mb-10 text-center">
          <div className="eyebrow text-vino">Elige tu momento</div>
          <h2 className="mt-3 font-display text-[2rem] font-semibold text-vino sm:text-[2.5rem]">
            Promociones
          </h2>
        </Reveal>

        <Reveal>
          <div className="mb-8 rounded-r-lg border border-piedra/50 bg-piedra-suave p-5 text-carbon sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-vino">Según el día y la hora</div>
                <h3 className="mt-1 font-display text-2xl font-semibold text-vino">Promos de hoy</h3>
              </div>
              <span className="rounded-full border border-carbon/20 px-3 py-1 text-xs tabular-nums">
                {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {activePromotions.length > 0 ? (
              <ul className="mt-5 grid gap-x-6 sm:grid-cols-2">
                {activePromotions.map((promotion) => (
                  <li key={promotion.id} className="border-b border-carbon/15">
                    <a
                      href={`#promo-${promotion.id}`}
                      className="flex min-h-12 items-center justify-between gap-3 py-2.5 text-sm text-carbon transition-colors hover:text-vino"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{promotion.title}</span>
                        <span className="mt-0.5 block text-xs text-carbon/65">
                          {promotion.contents.join(' · ')}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-right font-display font-semibold text-vino">
                          {formatPromotionPrice(promotion) ?? 'Ver promo'}
                        </span>
                        {promotion.discount !== undefined && promotion.priceCents !== 0 && (
                          <span className="rounded-full bg-vino px-2 py-0.5 text-[0.7rem] font-bold text-white">
                            {formatPromotionDiscount(promotion.discount)}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-carbon/70">
                No hay promociones activas ahora. Elige un momento para ver sus ofertas.
              </p>
            )}
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div
            className="mx-auto mb-3 grid max-w-[850px] grid-cols-2 gap-x-3 gap-y-1 border-y border-piedra/50 py-2 sm:grid-cols-3 lg:grid-cols-6"
            role="tablist"
            aria-label="Promos por momento"
          >
            {promoSegments
              .filter((segment) => visiblePromotions.some((promo) => promo.segmentIds.includes(segment.id)))
              .map((segment) => (
                <button
                  key={segment.id}
                  id={`segment-${segment.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeSegment === segment.id}
                  aria-controls={`segment-panel-${segment.id}`}
                  onClick={() => setActiveSegment(segment.id)}
                  className={`min-h-10 rounded-r-sm px-2 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                    activeSegment === segment.id
                      ? 'bg-vino/10 text-vino'
                      : 'text-carbon/65 hover:bg-white/70 hover:text-vino'
                  }`}
                >
                  {segment.label}
                </button>
              ))}
          </div>
        </Reveal>

        <p className="mb-5 text-center text-xs text-carbon/60">
          {promoSegments.find((segment) => segment.id === activeSegment)?.audience}
        </p>

        <div
          id={`segment-panel-${activeSegment}`}
          role="tabpanel"
          aria-labelledby={`segment-${activeSegment}`}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {segmentPromotions.map((promotion) => (
            <PromotionCard key={promotion.id} promotion={promotion} highlighted={highlightId === promotion.id} />
          ))}
        </div>

        <a href="#carta" className="mx-auto mt-5 flex w-fit items-center gap-2 text-sm font-semibold text-vino hover:underline">
          Ver la carta <ArrowRight size={15} />
        </a>
      </div>
    </section>
  );
}
