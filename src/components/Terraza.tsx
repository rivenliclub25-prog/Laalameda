import { CalendarDays } from 'lucide-react';
import { Reveal } from '@/components/Reveal';

const liveMusicImage = `${import.meta.env.BASE_URL}images/WhatsApp_Image_2026-10-04_at_3.02.08_AM.jpeg`;

export function Terraza() {
  return (
    <section id="terraza" className="bg-vino py-20 text-center text-marfil lg:py-32">
      <div className="mx-auto max-w-container px-6">
        <Reveal>
          <div className="eyebrow opacity-70">Terraza & Eventos</div>
          <h2 className="mt-4 font-display text-[2rem] font-semibold sm:text-[2.8rem]">
            Tardeos con música en vivo
          </h2>
          <div className="divider-gold my-6" />
        </Reveal>

        <Reveal delay={1}>
          <p className="mx-auto max-w-[560px] leading-relaxed opacity-90">
            Nuestra terraza es el punto de encuentro cuando cae la tarde: sesiones en directo y
            promociones especiales algunos días de la semana.
          </p>
        </Reveal>

        <Reveal delay={2}>
          <div className="relative mx-auto mt-8 h-56 w-full max-w-[560px] overflow-hidden rounded-r-lg sm:h-72">
            <img
              src={liveMusicImage}
              alt="Ambiente de terraza para disfrutar de música en vivo"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-carbon/65 via-transparent to-transparent" />
            <span className="absolute bottom-4 left-4 text-left font-display text-xl text-marfil sm:text-2xl">
              La tarde empieza aquí
            </span>
          </div>
        </Reveal>

        <Reveal delay={3}>
          <div className="mt-8 flex justify-center">
            <a href="#ubicacion" className="btn-gold">
              <CalendarDays size={16} /> Ver horarios{' '}
              <span className="pend-badge-light">PENDIENTE</span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
