import { ArrowRight, CalendarHeart, Cake, Gift, UserRound } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { useAuth } from '@/auth/AuthContext';
import { routeHref } from '@/lib/router';

const perks = [
  { icon: Gift, title: 'Ofertas de socio', desc: 'Promos que solo verás si eres del club.' },
  { icon: CalendarHeart, title: 'Primero en enterarte', desc: 'Tardeos, música en vivo y eventos antes que nadie.' },
  { icon: Cake, title: 'Tu cumpleaños', desc: 'Una sorpresa para celebrarlo con nosotros.' },
];

export function ClubSection() {
  const { session } = useAuth();

  return (
    <section id="club" className="bg-piedra-suave py-20 text-center lg:py-28">
      <div className="mx-auto max-w-container px-6">
        <Reveal>
          <div className="eyebrow text-vino">Club La Alameda</div>
          <h2 className="mt-3 font-display text-[2rem] font-semibold text-vino sm:text-[2.6rem]">
            {session ? 'Ya eres de la casa' : 'Hazte del club'}
          </h2>
          <div className="divider-gold my-6" />
          <p className="mx-auto max-w-[560px] leading-relaxed text-carbon/80">
            {session
              ? 'Gracias por formar parte del club. Mantén tus datos al día para no perderte ninguna oferta.'
              : 'Únete gratis y recibe antes que nadie nuestras mejores ofertas, eventos y novedades.'}
          </p>
        </Reveal>

        <ul className="mx-auto mt-10 grid max-w-[880px] gap-4 sm:grid-cols-3">
          {perks.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} as="li" delay={(i + 1) as 1 | 2 | 3}>
              <div className="flex h-full flex-col items-center rounded-r-md bg-white p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-vino text-marfil">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold text-vino">{title}</h3>
                <p className="mt-1 text-sm text-carbon/75">{desc}</p>
              </div>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={4}>
          <a
            href={routeHref(session ? '/perfil' : '/club')}
            className="btn-vino mt-10 px-7 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vino focus-visible:ring-offset-2 focus-visible:ring-offset-piedra-suave"
          >
            {session ? (
              <>
                <UserRound size={18} aria-hidden="true" /> Mi perfil
              </>
            ) : (
              <>
                Pertenecer al club <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </a>
        </Reveal>
      </div>
    </section>
  );
}
