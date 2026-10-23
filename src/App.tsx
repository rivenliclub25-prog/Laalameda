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
import { ClubSection } from '@/components/ClubSection';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AdminRoute } from '@/auth/AdminRoute';
import { AdminPage } from '@/pages/AdminPage';
import { MisTicketsPage } from '@/pages/MisTicketsPage';
import { ClubPage } from '@/pages/ClubPage';
import { RecuperarPage } from '@/pages/RecuperarPage';
import { NuevaContrasenaPage } from '@/pages/NuevaContrasenaPage';
import { PrivacidadPage } from '@/pages/PrivacidadPage';
import { PerfilPage } from '@/pages/PerfilPage';
import { useRoute } from '@/lib/router';

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

        <ClubSection />

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

  switch (path) {
    case '/club':
      return <ClubPage />;
    case '/recuperar':
      return <RecuperarPage />;
    case '/nueva-contrasena':
      return <NuevaContrasenaPage />;
    case '/privacidad':
      return <PrivacidadPage />;
    case '/perfil':
      return (
        <ProtectedRoute>
          <PerfilPage />
        </ProtectedRoute>
      );
    case '/mis-tickets':
      return (
        <ProtectedRoute>
          <MisTicketsPage />
        </ProtectedRoute>
      );
    case '/admin':
      return (
        <AdminRoute>
          <AdminPage />
        </AdminRoute>
      );
  }
}

export default App;
