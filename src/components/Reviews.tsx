import { Star } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { reviewLinks, reviews } from '@/data/site';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" className="shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.3 35.7 26.8 36.5 24 36.5c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.2 5.2C40.5 36.2 44 30.8 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function TripAdvisorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="7" cy="13" r="5" fill="none" stroke="#00AF87" strokeWidth="1.6" />
      <circle cx="17" cy="13" r="5" fill="none" stroke="#00AF87" strokeWidth="1.6" />
      <circle cx="7" cy="13" r="1.8" fill="#00AF87" />
      <circle cx="17" cy="13" r="1.8" fill="#00AF87" />
      <path d="M9 6h6M4 7c1-1.5 2.8-2 3.5-2M20 7c-1-1.5-2.8-2-3.5-2" fill="none" stroke="#00AF87" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Reviews() {
  return (
    <section id="resenas" className="bg-piedra-suave py-20 lg:py-32">
      <div className="mx-auto max-w-container px-6">
        <Reveal className="mb-12 text-center">
          <h2 className="font-display text-[2rem] font-semibold text-vino sm:text-[2.5rem]">
            Lo que dicen de nosotros
          </h2>
          <p className="mt-2 opacity-75">Experiencias recientes de quienes ya nos han visitado.</p>
          <div className="divider-gold mt-4" />
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {reviews.map((review, i) => (
            <Reveal key={review.name} delay={((i % 3) + 1) as 1 | 2 | 3}>
              <article className="flex h-full flex-col rounded-r-md bg-white p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex text-vino" aria-label="5 estrellas">
                    {[0, 1, 2, 3, 4].map((star) => (
                      <Star key={star} size={16} fill="currentColor" stroke="none" />
                    ))}
                  </div>
                  <span className="text-xs opacity-50">{review.time}</span>
                </div>
                <p className="flex-1 italic leading-relaxed opacity-80">“{review.quote}”</p>
                <strong className="mt-5 block text-sm text-vino">{review.name}</strong>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={2}>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {reviewLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith('http') ? '_blank' : undefined}
                rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className={
                  link.color === 'tripadvisor'
                    ? 'btn-gold-vino border-[#00AF87] text-[#00AF87] hover:bg-[#00AF87]/5'
                    : 'btn-gold-vino'
                }
              >
                {link.icon === 'google' && <GoogleIcon />}
                {link.icon === 'tripadvisor' && <TripAdvisorIcon />}
                {link.label} {link.pending && <span className="pend-badge">PENDIENTE</span>}
              </a>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
