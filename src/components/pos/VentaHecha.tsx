import { useEffect, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useScrollLock } from '@/lib/useScrollLock';
import { METODOS, formatEuros, type VentaResultado } from '@/lib/pos';

/** Confirmación de cobro a pantalla completa (barra y mesas). Vuelve sola a los 3 s. */
export function VentaHecha({
  venta,
  clientTotal,
  titulo,
  onClose,
}: {
  venta: VentaResultado;
  /** Total que mostraba la pantalla antes de cobrar (para avisar si cambió algún precio). */
  clientTotal: number;
  titulo?: string;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useScrollLock(true);
  const aviso = venta.repetida || venta.total_centimos !== clientTotal;

  useEffect(() => {
    buttonRef.current?.focus();
    const timer = window.setTimeout(onClose, aviso ? 6000 : 3000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, aviso]);

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Venta registrada" className="fixed inset-0 z-[200] flex flex-col bg-[#2f6b3f] px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+32px)] text-white animate-fade-in">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center text-center">
        <CheckCircle2 size={88} aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.28em] opacity-85">
          {titulo ? `${titulo} · ` : ''}Venta nº {venta.numero}
        </p>
        <p className="mt-3 font-display text-[3.2rem] font-semibold leading-none" aria-live="assertive">
          {formatEuros(venta.total_centimos)}
        </p>
        <p className="mt-2 text-lg opacity-90">{METODOS[venta.metodo]}</p>
        {venta.repetida && (
          <p className="mt-4 rounded-r-sm bg-white/15 px-3 py-2 text-sm">Esta venta ya estaba registrada: no se ha cobrado dos veces.</p>
        )}
        {!venta.repetida && venta.total_centimos !== clientTotal && (
          <p className="mt-4 rounded-r-sm bg-white/15 px-3 py-2 text-sm">
            El total cambió respecto a la pantalla: se ha cobrado {formatEuros(venta.total_centimos)}.
          </p>
        )}
      </div>
      <button ref={buttonRef} type="button" onClick={onClose} className="mx-auto mt-6 flex min-h-16 w-full max-w-[460px] items-center justify-center rounded-r-md bg-white text-lg font-bold text-[#1f4a2b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
        Continuar
      </button>
    </div>
  );
}
