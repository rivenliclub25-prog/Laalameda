import type { ReactNode } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

/** Estructura común de las páginas del club: header y footer actuales de la web. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="relative z-[1] min-h-[80vh] px-4 pb-sp-xl pt-[calc(env(safe-area-inset-top,0px)+96px)] sm:px-6">
        {children}
      </main>
      <Footer />
    </>
  );
}
