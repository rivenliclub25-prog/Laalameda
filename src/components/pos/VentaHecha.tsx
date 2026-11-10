import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Receipt } from 'lucide-react';
import { JustificanteModal } from '@/components/pos/Justificante';
import { useScrollLock } from '@/lib/useScrollLock';
import { justificanteDeResultado } from '@/lib/justificante';
import { METODOS, formatEuros, type VentaResultado } from '@/lib/pos';

/**
 * Confirmación de cobro a pantalla completa (todas las pestañas del TPV). Vuelve sola a los 3 s,
 * salvo que se abra el justificante: entonces espera a que se cierre.
 */
export function VentaHecha({
  venta,
  clientTotal,
  titulo,
  onClose,
}: {
  venta: VentaResultado;
  /** Total que mostraba la pantalla antes de cobrar (para avisar si cambió algún precio). */
  clientTotal: number;
  /** Dónde se vendió: nombre de la mesa o del puesto de barra, o «Venta rápida». */
  titulo: string;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [justificante, setJustificante] = useState(false);
  useScrollLock(true);
  const aviso = venta.repetida || venta.total_centimos !== clientTotal;

  useEffect(() => {
    if (justificante) return;
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
  }, [onClose, aviso, justificante]);

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Venta registrada" className="fixed inset-0 z-[200] flex flex-col bg-[#2f6b3f] px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+32px)] text-white animate-fade-in">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center text-center">
        <CheckCircle2 size={88} aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.28em] opacity-85">
          {titulo} · Venta nº {venta.numero}
        </p>
        <p className="mt-3 font-display text-[3.2rem] font-semibold leading-none" aria-live="assertive">
          {formatEuros(venta.total_centimos)}
        </p>
        <p className="mt-2 text-lg opacity-90">{METODOS[venta.metodo]}</p>
        {venta.cuenta_cerrada === false && (
          <p className="mt-4 rounded-r-sm bg-white/15 px-3 py-2 text-sm">Pago por separado: la cuenta sigue abierta con lo que falta.</p>
        )}
        {venta.repetida && (
          <p className="mt-4 rounded-r-sm bg-white/15 px-3 py-2 text-sm">Esta venta ya estaba registrada: no se ha cobrado dos veces.</p>
        )}
        {!venta.repetida && venta.total_centimos !== clientTotal && (
          <p className="mt-4 rounded-r-sm bg-white/15 px-3 py-2 text-sm">
            El total cambió respecto a la pantalla: se ha cobrado {formatEuros(venta.total_centimos)}.
          </p>
        )}
      </div>
      <div className="mx-auto mt-6 flex w-full max-w-[460px] flex-col gap-3">
        <button
          type="button"
          onClick={() => setJustificante(true)}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-r-md border-2 border-white/80 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
        >
          <Receipt size={20} aria-hidden="true" /> Justificante
        </button>
        <button ref={buttonRef} type="button" onClick={onClose} className="flex min-h-16 w-full items-center justify-center rounded-r-md bg-white text-lg font-bold text-[#1f4a2b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
          Continuar
        </button>
      </div>

      {justificante && (
        <JustificanteModal datos={justificanteDeResultado(venta, titulo)} onClose={() => setJustificante(false)} />
      )}
    </div>
  );
}
