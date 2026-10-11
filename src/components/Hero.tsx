import { ArrowRight, MessageCircle, Instagram } from 'lucide-react';
import { Skyline } from '@/components/Skyline';
import { siteConfig } from '@/data/site';

export function Hero() {
  return (
    <header
      id="top"
      className="relative flex min-h-[96vh] flex-col items-center justify-center overflow-hidden px-6 py-20 text-center text-marfil"
    >
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'linear-gradient(180deg, #2E2013 0%, #5C4325 45%, #8a6b3f 75%, #C2A06C 100%)',
        }}
      />

      <div className="absolute bottom-0 left-1/2 z-[1] w-full max-w-[760px] -translate-x-1/2">
        <Skyline className="h-auto w-full opacity-90 drop-shadow-[0_-2px_14px_rgba(196,154,74,0.4)]" />
      </div>

      <div className="relative z-[2] flex flex-col items-center gap-3">
        <div className="eyebrow animate-fade-in opacity-80" style={{ animationDelay: '0.1s', opacity: 0 }}>
          Salamanca · Un lugar para todos
        </div>

        <h1
          className="animate-fade-up font-display text-[2.8rem] font-semibold leading-[1.05] sm:text-[4rem] lg:text-[5.5rem]"
          style={{ animationDelay: '0.2s', opacity: 0 }}
        >
          La Alameda
        </h1>

        <p
          className="animate-fade-up mt-2 max-w-[520px] text-base opacity-90 sm:text-xl"
          style={{ animationDelay: '0.35s', opacity: 0 }}
        >
          Café de mañana, tapas al mediodía y copas al caer la tarde — un rincón salmantino para quedarse.
        </p>

        <div
          className="animate-fade-up mt-4 flex flex-wrap justify-center gap-2.5"
          style={{ animationDelay: '0.5s', opacity: 0 }}
        >
          {['Producto de cercanía', 'Terraza salmantina', 'Ambiente cuidado'].map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-marfil/50 px-3.5 py-1.5 text-[0.7rem] uppercase tracking-wider opacity-90"
            >
              {badge}
            </span>
          ))}
        </div>

        <div
          className="animate-fade-up mt-6 flex flex-wrap justify-center gap-4"
          style={{ animationDelay: '0.65s', opacity: 0 }}
        >
          <a href="#carta" className="btn-vino">
            Ver la carta <ArrowRight size={16} />
          </a>
          <a href="#promos" className="btn-outline">
            Ver promos <ArrowRight size={16} />
          </a>
          <a
            href="https://wa.me/34682469060?text=Hola%2C%20quiero%20reservar%20mesa%20en%20La%20Alameda"
            target="_blank"
            rel="noopener"
            className="btn-outline"
          >
            <MessageCircle size={16} /> Reservar por WhatsApp
          </a>
          <a
            href={siteConfig.instagram}
            target="_blank"
            rel="noopener"
            aria-label="Instagram"
            className="btn-outline px-3.5 py-2.5"
          >
            <Instagram size={17} />
          </a>
        </div>
      </div>
    </header>
  );
}
