import { useState } from 'react';
import { Reveal } from '@/components/Reveal';
import { Notice } from '@/components/club/FormControls';
import {
  formatPromotionDiscount,
  formatPromotionPrice,
  isPromotionVisible,
  useCatalog,
} from '@/lib/catalog';

// La pestaña "Promos" de la carta es una vista (lista las promos visibles), no una categoría de productos.
const PROMOS_TAB = { id: 'promos', label: 'Promos' };

export function MenuSection() {
  const [active, setActive] = useState<string>('promos');
  const { catalog, fromBackup } = useCatalog();
  const now = new Date();
  const promotions = catalog?.promotions ?? [];
  const visiblePromotions = promotions.filter((promotion) => isPromotionVisible(promotion, now, promotions));
  const tabs = [PROMOS_TAB, ...(catalog?.menuTabs ?? [])];

  return (
    <section id="carta" className="bg-piedra-suave py-20 lg:py-32">
      <div className="mx-auto max-w-container px-6">
        <Reveal className="mb-10 text-center">
          <h2 className="font-display text-[2rem] font-semibold text-vino sm:text-[2.5rem]">
            La carta
          </h2>
          <p className="mt-2 max-w-[560px] mx-auto opacity-75">
            Precios por unidad. Copas servidas solas o con tónica/refresco.
          </p>
          <div className="divider-gold mt-4" />
        </Reveal>

        {fromBackup && (
          <div className="mx-auto mb-6 max-w-[640px]">
            <Notice kind="info">Estás viendo una copia guardada de la carta: algunos precios pueden no estar al día.</Notice>
          </div>
        )}

        <Reveal delay={1}>
          <div className="mb-10 flex flex-wrap justify-center gap-2.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`rounded-full border px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  active === tab.id
                    ? 'border-vino bg-vino text-white'
                    : tab.id === 'promos'
                      ? 'border-piedra bg-piedra/20 text-vino hover:border-vino'
                    : 'border-carbon/30 bg-transparent text-carbon hover:border-vino hover:text-vino'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mx-auto max-w-[640px]">
          {!catalog && <MenuSkeleton />}
          {catalog && active === 'promos' && (
            <div className="grid gap-3">
              {visiblePromotions.map((promotion) => {
                const price = formatPromotionPrice(promotion);
                return (
                  <a
                    key={promotion.id}
                    href={`#promo-${promotion.id}`}
                    className="flex items-baseline justify-between gap-4 border-b border-dashed border-carbon/25 pb-2.5 transition-colors hover:text-vino"
                  >
                    <span>
                      <span className="font-display text-lg font-semibold">{promotion.title}</span>
                      <span className="mt-0.5 block text-xs opacity-65">{promotion.scheduleLabel}</span>
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-2 text-right">
                      {price && (
                        <span className="font-display text-lg font-semibold text-vino">
                          {price}
                        </span>
                      )}
                      {promotion.discount !== undefined && promotion.priceCents !== 0 && (
                        <span className="inline-flex rounded-full bg-vino px-2.5 py-1 text-xs font-bold text-white">
                          {formatPromotionDiscount(promotion.discount)}
                        </span>
                      )}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
          {catalog?.menuTabs.map((tab) => (
            <div key={tab.id} className={active === tab.id ? 'block' : 'hidden'}>
              <div className="grid gap-4">
                {tab.items.map((item, idx) => {
                  if (item.sectionHeader) {
                    return (
                      <div
                        key={idx}
                        className={`font-display text-lg text-vino ${idx === 0 ? 'mt-4' : 'mt-6'}`}
                      >
                        {item.sectionHeader}
                        {item.sectionSub && (
                          <span className="ml-2 font-primary text-xs opacity-60">
                            — {item.sectionSub}
                          </span>
                        )}
                      </div>
                    );
                  }
                  // "En promo": promos visibles que llevan este producto.
                  const inPromos = visiblePromotions.filter((promotion) =>
                    item.id ? promotion.productIds.includes(item.id) : false
                  );
                  return (
                    <div
                      key={idx}
                      className="flex items-baseline justify-between gap-4 border-b border-dashed border-carbon/25 pb-2.5"
                    >
                      <div>
                        <h4 className="font-display text-lg font-semibold text-carbon">
                          {item.name}
                          {item.recommended && (
                            <span className="recommend-badge ml-2">★ RECOMENDADO</span>
                          )}
                        </h4>
                        {item.desc && (
                          <span className="mt-0.5 block text-xs font-primary opacity-65">{item.desc}</span>
                        )}
                        {inPromos.map((promotion) => (
                          <a
                            key={promotion.id}
                            href={`#promo-${promotion.id}`}
                            className="mt-1 inline-flex rounded-full bg-vino/10 px-2 py-0.5 text-[0.68rem] font-semibold text-vino hover:bg-vino/20"
                          >
                            En promo
                          </a>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="font-display text-lg font-semibold text-vino">{item.price}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Solo en la primera visita, mientras llega la carta. */
function MenuSkeleton() {
  return (
    <div className="grid gap-4" role="status" aria-label="Cargando la carta">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-baseline justify-between gap-4 border-b border-dashed border-carbon/25 pb-2.5">
          <span className="h-5 w-1/2 rounded-r-sm bg-carbon/10" />
          <span className="h-5 w-12 rounded-r-sm bg-carbon/10" />
        </div>
      ))}
    </div>
  );
}
