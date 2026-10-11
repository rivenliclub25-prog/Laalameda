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

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return hash;
}

function App() {
  const [reserveOpen, setReserveOpen] = useState(false);
  const hash = useHashRoute();

  const isQRPage = hash === '#qr' || hash === '#qr/';

  useEffect(() => {
    if (isQRPage) {
      window.scrollTo(0, 0);
    }
  }, [isQRPage]);

  if (isQRPage) {
    return <QRPage />;
  }

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

export default App;
