import { ArrowRight, Heart, Users } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { publicAssetUrl } from '@/data/site';

export function Gallery() {
  return (
    <section id="quienes-somos" className="py-20 lg:py-32">
      <div className="mx-auto max-w-container px-6">
        <Reveal className="mb-12 text-center">
          <h2 className="font-display text-[2rem] font-semibold text-vino sm:text-[2.5rem]">
            Quiénes somos
          </h2>
        </Reveal>

        <Reveal delay={1}>
          <div className="mx-auto max-w-[920px] overflow-hidden rounded-r-lg bg-marfil shadow-sm">
            <div className="grid gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[minmax(280px,0.85fr)_1fr] lg:items-stretch lg:gap-14 lg:px-12 lg:py-14">
              <div className="relative min-h-[360px] overflow-hidden rounded-r-md bg-piedra shadow-inner lg:min-h-0">
                <img
                  src={publicAssetUrl('images/IMG_1661.jpg')}
                  alt="Joan Steven Zuñiga Pacheco"
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
                <div className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-vino text-marfil">
                  <Heart size={18} fill="currentColor" />
                </div>
              </div>

              <div className="mt-2 lg:mt-0">
                <div className="eyebrow text-vino">Una mirada al futuro</div>
                <strong className="mt-2 block max-w-[440px] text-balance font-display text-[1.8rem] font-semibold leading-tight text-vino sm:text-[2rem]">
                  Joan Steven Zuñiga Pacheco
                </strong>
                <div className="mt-3 space-y-4 leading-relaxed opacity-80">
                  <p>
                    En Bar La Alameda creemos que salir a tomar algo es mucho más que consumir: es
                    compartir, encontrarse y disfrutar de esos pequeños momentos que forman parte de
                    nuestra cultura.
                  </p>
                  <p>
                    Nacemos en Salamanca con una idea clara: recuperar el espíritu del bar tradicional
                    español, ofreciendo pinchos, tapas, montaditos y productos reconocibles, con precios
                    razonables, cercanía y una atención que invite a volver.
                  </p>
                  <blockquote className="border-l-2 border-piedra pl-4 italic text-vino opacity-90">
                    "Queremos que la gente pueda volver a salir a tomar algo sin que parezca que tiene
                    que pensárselo dos veces por el precio. Sabemos que estamos empezando, sabemos que
                    tenemos mucho que mejorar y que todavía estamos aprendiendo, pero precisamente por
                    eso queremos escuchar a nuestros clientes y construir el proyecto con ellos".
                  </blockquote>
                  <p>
                    Somos un proyecto en construcción, con ganas de aprender, mejorar y crecer junto a
                    quienes nos visitan. Queremos que La Alameda sea un espacio de encuentro para todos,
                    donde la gastronomía popular y el trato cercano mantengan viva una tradición que
                    merece seguir formando parte de nuestro presente.
                  </p>
                  <p className="font-display text-lg font-medium text-vino opacity-100">
                    Porque España también se encuentra en sus bares.
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-vino">
                  <span className="inline-flex items-center gap-2"><Users size={16} /> Para todos</span>
                  <span className="inline-flex items-center gap-2"><ArrowRight size={16} /> Con ganas de crecer</span>
                </div>
              </div>

            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}