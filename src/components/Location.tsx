import { MapPin, Phone, Clock, Navigation, MessageCircle, CalendarPlus, ExternalLink } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { siteConfig } from '@/data/site';

interface LocationProps {
  onReserve: () => void;
}

export function Location({ onReserve }: LocationProps) {
  return (
    <section id="ubicacion" className="py-20 lg:py-32">
      <div className="mx-auto max-w-container px-6">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="location-card relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-r-lg border border-carbon/10 p-8 shadow-md sm:min-h-[340px]">
              <div className="location-grid absolute inset-0" aria-hidden="true" />
              <div className="relative z-[1] flex items-start justify-between gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vino text-marfil shadow-lg">
                  <MapPin size={28} />
                </div>
                <span className="rounded-full bg-white/90 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-vino shadow-sm">
                  Salamanca
                </span>
              </div>
              <div className="relative z-[1] max-w-[320px]">
                <p className="eyebrow text-vino">Estamos aquí</p>
                <h3 className="mt-2 font-display text-3xl font-semibold text-carbon">Paseo de Carmelitas</h3>
                <p className="mt-1 text-sm text-carbon/70">57 · 37002 Salamanca</p>
                <a href={siteConfig.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn-vino mt-5">
                  <Navigation size={16} /> Abrir en Google Maps <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={1}>
            <div>
              <h2 className="mb-4 font-display text-[2rem] font-semibold text-vino sm:text-[2.4rem]">
                Ubicación y contacto
              </h2>
              <div className="divider-gold ml-0 mb-6" />

              <div className="space-y-3">
                <div className="flex items-center gap-2.5 text-sm opacity-90 sm:text-base">
                  <MapPin size={18} className="shrink-0 text-vino" />
                  <span>{siteConfig.address}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm opacity-90 sm:text-base">
                  <Phone size={18} className="shrink-0 text-vino" />
                  <a href={`tel:${siteConfig.phoneDisplay}`} className="hover:text-vino">
                    {siteConfig.phoneDisplay}
                  </a>
                </div>
                <div className="flex items-center gap-2.5 text-sm opacity-90 sm:text-base">
                  <Clock size={18} className="shrink-0 text-vino" />
                  <span>{siteConfig.hours}</span>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-2.5">
                <a href={siteConfig.mapsUrl} target="_blank" rel="noopener" className="btn-vino">
                  <Navigation size={16} /> Cómo llegar
                </a>
                <a href={`https://wa.me/${siteConfig.whatsapp}`} target="_blank" rel="noopener" className="btn-outline-vino">
                  <MessageCircle size={16} /> WhatsApp
                </a>
                <button onClick={onReserve} className="btn-vino">
                  <CalendarPlus size={16} /> Reservar mesa
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <a href={siteConfig.instagram} target="_blank" rel="noopener" className="btn border border-carbon bg-transparent text-carbon hover:bg-carbon/5">
                  Instagram
                </a>
                <a href="#" target="_blank" rel="noopener" className="btn border border-carbon bg-transparent text-carbon hover:bg-carbon/5">
                  TikTok <span className="pend-badge">PENDIENTE</span>
                </a>
                <a href="#" target="_blank" rel="noopener" className="btn border border-carbon bg-transparent text-carbon hover:bg-carbon/5">
                  Facebook <span className="pend-badge">PENDIENTE</span>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
