import { useEffect, useRef, useState } from 'react';
import { Loader2, TriangleAlert, X } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { deleteAccount } from '@/lib/auth';

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

/** Confirmación para borrar la cuenta. Mismo estilo y comportamiento que ReserveModal. */
export function DeleteAccountModal({ open, onClose, onDeleted }: DeleteAccountModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = setTimeout(() => cancelRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || loading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    const result = await deleteAccount();
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      onDeleted();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-carbon/70 p-4 animate-fade-in sm:items-center"
      onClick={loading ? undefined : onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-desc"
        className="animate-scale-in relative w-full max-w-[420px] rounded-r-lg bg-marfil p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Cerrar"
          className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-lg text-carbon/60 transition-colors hover:bg-carbon/10 hover:text-carbon ${focusRing}`}
        >
          <X size={20} />
        </button>

        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-vino/10 text-vino">
          <TriangleAlert size={24} aria-hidden="true" />
        </span>
        <h2 id="delete-account-title" className="mt-4 font-display text-[1.7rem] font-semibold leading-tight text-vino">
          ¿Borrar tu cuenta?
        </h2>
        <div className="divider-gold mb-4 ml-0 mt-3" />
        <p id="delete-account-desc" className="text-sm leading-relaxed text-carbon/80">
          Se eliminarán tu cuenta y todos tus datos del club (nombre, teléfono, cumpleaños y preferencias), y dejarás de
          recibir nuestras ofertas. <strong>No se puede deshacer.</strong> Si algún día quieres volver, tendrás que
          registrarte de nuevo.
        </p>

        {error && (
          <div className="mt-4">
            <Notice kind="error">{error}</Notice>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`btn-outline-vino flex-1 py-3 ${focusRing}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            aria-busy={loading}
            className={`btn-vino flex-1 py-3 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 ${focusRing}`}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Borrando…
              </>
            ) : (
              'Sí, borrar mi cuenta'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
