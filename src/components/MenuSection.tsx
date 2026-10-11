import { useState } from 'react';
import { Reveal } from '@/components/Reveal';
import {
  formatPromotionPrice,
  isPromotionVisible,
  promotions,
} from '@/data/promos';
import { menuTabs, type MenuCategory } from '@/data/site';

export function MenuSection() {
  const [active, setActive] = useState<MenuCategory>('promos');

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

        <Reveal delay={1}>
          <div className="mb-10 flex flex-wrap justify-center gap-2.5">
            {menuTabs.map((tab) => (
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
          {active === 'promos' && (
            <div className="grid gap-3">
              {promotions
                .filter((promotion) => isPromotionVisible(promotion, new Date()))
                .map((promotion) => {
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
                            -{promotion.discount} %
                          </span>
                        )}
                      </span>
                    </a>
                  );
                })}
            </div>
          )}
          {menuTabs.map((tab) => (
            <div key={tab.id} className={active === tab.id && tab.id !== 'promos' ? 'block' : 'hidden'}>
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
                        {promotions
                          .flatMap((promotion) =>
                            promotion.regularProducts?.filter(
                              (product) => product.category === tab.id && product.name === item.name
                            ).map(() => promotion.id) ?? []
                          )
                          .filter((id, index, ids) => ids.indexOf(id) === index)
                          .map((id) => (
                            <a
                              key={id}
                              href={`#promo-${id}`}
                              className="mt-1 inline-flex rounded-full bg-vino/10 px-2 py-0.5 text-[0.68rem] font-semibold text-vino hover:bg-vino/20"
                            >
                              En promo
                            </a>
                          ))}
                      </div>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="font-display text-lg font-semibold text-vino">{item.price}</span>
                        {item.pending && <span className="pend-badge">PENDIENTE</span>}
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
