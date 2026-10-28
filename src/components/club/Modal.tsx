import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import { useScrollLock } from '@/lib/useScrollLock';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Mientras se guarda, no se puede cerrar con Esc ni tocando fuera. */
  busy?: boolean;
  /** Ancho máximo del cuadro (por defecto 520px). */
  maxWidth?: string;
}

/**
 * Ventana modal con el estilo de ReserveModal y DeleteAccountModal: se cierra con Esc o tocando
 * fuera, lleva el foco dentro al abrirse y lo devuelve al cerrarse. En móvil sale desde abajo.
 */
export function Modal({ open, title, onClose, children, busy = false, maxWidth = '520px' }: ModalProps) {
  const titleId = useId();
  useScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
      (first ?? panelRef.current)?.focus();
    }, 60);
    return () => {
      window.clearTimeout(t);
      previous?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-carbon/70 p-0 animate-fade-in sm:items-center sm:p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ maxWidth }}
        className="animate-scale-in relative max-h-[92dvh] w-full overflow-y-auto rounded-t-r-lg bg-marfil p-6 outline-none sm:rounded-r-lg sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          data-close
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar"
          className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-carbon/60 transition-colors hover:bg-carbon/10 hover:text-carbon ${focusRing}`}
        >
          <X size={20} />
        </button>
        <h2 id={titleId} className="pr-10 font-display text-[1.7rem] font-semibold leading-tight text-vino">
          {title}
        </h2>
        <div className="divider-gold mb-5 ml-0 mt-3" />
        {children}
      </div>
    </div>
  );
}
