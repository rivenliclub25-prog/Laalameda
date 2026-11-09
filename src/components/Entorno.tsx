import { useEffect } from 'react';
import { entorno, esProduccion } from '@/lib/entorno';

const ETIQUETA = { local: 'LOCAL', pruebas: 'PRUEBAS', produccion: '' } as const;

/**
 * Aviso fijo arriba fuera de producción (ENTORNOS.md, E2): se ve en todas las pantallas, también en
 * el TPV a pantalla completa, y no tapa clics. Además, «[PRUEBAS]» o «[LOCAL]» en el título de la pestaña.
 */
export function FranjaEntorno() {
  useEffect(() => {
    if (esProduccion) return;
    const prefijo = `[${ETIQUETA[entorno]}] `;
    const poner = () => {
      if (!document.title.startsWith(prefijo)) document.title = prefijo + document.title;
    };
    poner();
    // Algunas páginas cambian el título (p. ej. #qr): se vuelve a poner el prefijo.
    const titulo = document.querySelector('title');
    if (!titulo) return;
    const observer = new MutationObserver(poner);
    observer.observe(titulo, { childList: true });
    return () => observer.disconnect();
  }, []);

  if (esProduccion) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[10000] flex justify-center"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <span className="rounded-b-md bg-[#a86b00] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md">
        {entorno === 'pruebas' ? 'Entorno de pruebas · los datos no son reales' : 'Local · base de datos de PRUEBAS'}
      </span>
    </div>
  );
}

/** Pantalla que sustituye a toda la web si el entorno y la base de datos no casan. */
export function BloqueoEntorno({ mensaje }: { mensaje: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-marfil px-4 py-10">
      <div className="w-full max-w-lg rounded-r-lg border-2 border-vino bg-white p-6 shadow-md">
        <p className="text-xs font-bold uppercase tracking-wider text-vino">Configuración bloqueada</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-vino">La web no arranca para proteger los datos del bar</h1>
        <p className="mt-3 text-sm leading-relaxed text-carbon/85">{mensaje}</p>
        <p className="mt-3 text-sm text-carbon/70">
          Revisa el archivo <code>.env</code> (en <code>.env.example</code> están los tres entornos explicados) y vuelve a
          arrancar con <code>npm run dev</code>. Más detalles en <code>ENTORNOS.md</code>.
        </p>
      </div>
    </main>
  );
}
