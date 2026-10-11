import { Reveal } from '@/components/Reveal';

export function Evolution() {
  return (
    <section className="bg-carbon py-20 text-center text-marfil sm:py-24 lg:py-32">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Reveal className="mx-auto max-w-[1160px]">
          <div className="eyebrow opacity-60">Nuestra historia</div>
          <h2 className="mt-5 font-display text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-tight">
            De un café con historia a un nuevo punto de encuentro
          </h2>
          <div className="divider-gold my-7 sm:my-9" />
        </Reveal>

        <div className="mx-auto flex max-w-[760px] flex-col items-center justify-center gap-2 sm:flex-row sm:gap-6">
          <Reveal delay={1}>
            <span className="block font-display text-2xl text-marfil/55 line-through decoration-piedra/70 sm:text-[1.75rem]">
              Gran Café El Pino
            </span>
          </Reveal>

          <Reveal delay={2} className="text-piedra">
            <span className="inline-block rotate-90 font-display text-3xl sm:rotate-0 sm:text-4xl" aria-hidden="true">→</span>
          </Reveal>

          <Reveal delay={3}>
            <span className="block font-display text-2xl text-piedra sm:text-[1.75rem]">
              La Alameda
            </span>
          </Reveal>
        </div>

        <Reveal delay={4}>
          <p className="mx-auto mt-7 max-w-[720px] text-sm leading-relaxed opacity-70 sm:mt-9 sm:text-base">
            Heredamos el alma de un clásico salmantino y la vestimos de nuevo: misma esquina, misma
            calidez, una identidad renovada para seguir siendo el lugar donde la gente se reúne.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
