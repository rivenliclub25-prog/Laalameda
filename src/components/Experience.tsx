import { Reveal } from '@/components/Reveal';
import { Placeholder } from '@/components/Placeholder';
import { experiencePillars } from '@/data/site';

export function Experience() {
  return (
    <section id="experiencia" className="py-20 lg:py-32">
      <div className="mx-auto max-w-container px-6">
        <Reveal className="mb-12 text-center">
          <h2 className="font-display text-[2rem] font-semibold text-vino sm:text-[2.5rem]">
            Cuatro formas de vivir La Alameda
          </h2>
          <div className="divider-gold mt-4" />
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {experiencePillars.map((pillar, i) => (
            <Reveal key={pillar.title} delay={((i % 4) + 1) as 1 | 2 | 3 | 4}>
              <article className="group h-full overflow-hidden rounded-r-md bg-white shadow-sm transition-transform duration-300 hover:-translate-y-1.5 hover:shadow-lg">
                {pillar.image ? (
                  <img
                    src={pillar.image}
                    alt={pillar.placeholder}
                    className="aspect-[4/3] w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <Placeholder label={pillar.placeholder} className="h-32 sm:h-36 lg:h-40" rounded="md" />
                )}
                <div className="relative z-[1] bg-white p-4">
                  <h3 className="mb-1 font-display text-lg font-semibold text-carbon sm:text-xl">
                    {pillar.title}
                  </h3>
                  <p className="text-sm leading-relaxed opacity-70">{pillar.desc}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
