import { useEffect, useState } from 'react';
import { Skyline } from '@/components/Skyline';
import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { Evolution } from '@/components/Evolution';
import { Experience } from '@/components/Experience';
import { MenuSection } from '@/components/MenuSection';
import { PromotionsSection } from '@/components/PromotionsSection';
import { Terraza } from '@/components/Terraza';
import { Gallery } from '@/components/Gallery';
import { Reviews } from '@/components/Reviews';
import { Location } from '@/components/Location';
import { Footer } from '@/components/Footer';
import { ReserveModal } from '@/components/ReserveModal';
import { Watermark } from '@/components/Watermark';
import { QRPage } from '@/components/QRPage';
import { PageShell } from '@/components/club/PageShell';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { useAuth } from '@/auth/AuthContext';
import { useRoute, type RoutePath } from '@/lib/router';

function HomePage({ anchor }: { anchor: string | null }) {
  const [reserveOpen, setReserveOpen] = useState(false);

  // Al volver a la home desde otra página con un enlace tipo "#carta", baja hasta esa sección.
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
    // Solo al montar: dentro de la home las anclas funcionan solas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <svg className="hidden" aria-hidden="true">
        <defs>
          <symbol id="salamanca-skyline" viewBox="0 0 600 320">
            <Skyline />
          </symbol>
        </defs>
      </svg>

      <Watermark />

      <Navbar />

      <main className="relative z-[1]">
        <Hero />

        <PromotionsSection />

        <Evolution />

        <Experience />

        <MenuSection />

        <Terraza />

        <Gallery />

        <Reviews />

        <Location onReserve={() => setReserveOpen(true)} />
      </main>

      <Footer />

      <ReserveModal open={reserveOpen} onClose={() => setReserveOpen(false)} />
    </>
  );
}

// Provisional (fase 1): se sustituye por las páginas reales en la fase 2.
function StubPage({ title }: { title: string }) {
  const { user, loading, configured } = useAuth();
  return (
    <PageShell>
      <div className="mx-auto max-w-[480px] text-center">
        <h1 className="font-display text-[2.4rem] font-semibold text-vino">{title}</h1>
        <div className="divider-gold my-4" />
        <p className="text-sm text-carbon/70">
          {!configured
            ? 'Supabase no está configurado (falta el archivo .env).'
            : loading
              ? 'Comprobando sesión…'
              : user
                ? `Sesión iniciada como ${user.email}`
                : 'Sin sesión iniciada.'}
        </p>
      </div>
    </PageShell>
  );
}

const pageTitles: Record<Exclude<RoutePath, '/' | '/qr'>, string> = {
  '/club': 'Club La Alameda',
  '/recuperar': 'Recuperar contraseña',
  '/nueva-contrasena': 'Nueva contraseña',
  '/privacidad': 'Política de privacidad',
  '/perfil': 'Mi perfil',
};

function App() {
  const { path, anchor } = useRoute();

  useEffect(() => {
    if (path !== '/') {
      window.scrollTo(0, 0);
    }
  }, [path]);

  if (path === '/') {
    return <HomePage anchor={anchor} />;
  }

  if (path === '/qr') {
    return <QRPage />;
  }

  if (path === '/perfil') {
    return (
      <ProtectedRoute>
        <StubPage title={pageTitles[path]} />
      </ProtectedRoute>
    );
  }

  return <StubPage title={pageTitles[path]} />;
}

export default App;
