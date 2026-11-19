import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { RecetaEditor } from '@/components/admin/rentabilidad/RecetaEditor';
import { useReceta } from '@/components/admin/rentabilidad/useReceta';
import { guardarReceta, type Ajustes, type ProductoRentabilidad } from '@/lib/rentabilidad';

/** Receta de un producto desde Rentabilidad → Productos. El precio se cambia en la Carta. */
export function RecetaModal({
  producto,
  ajustes,
  onClose,
  onSaved,
}: {
  producto: ProductoRentabilidad;
  ajustes: Ajustes;
  onClose: () => void;
  onSaved: () => void;
}) {
  const receta = useReceta(producto.product_id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    setError(null);
    const r = receta.paraGuardar();
    if ('error' in r) return setError(r.error);
    setSaving(true);
    const res = await guardarReceta(producto.product_id, r.lineas);
    setSaving(false);
    if (res.error) return setError(res.error);
    onSaved();
  };

  return (
    <Modal open title={`Receta · ${producto.nombre}`} onClose={onClose} busy={saving} maxWidth="680px">
      <p className="mb-4 text-sm text-carbon/70">El precio de venta se cambia en la pestaña Carta (o importando el Excel).</p>
      <RecetaEditor receta={receta} precioCentimos={producto.precio_centimos} ajustes={ajustes} disabled={saving} />
      {(error ?? receta.error) && (
        <div className="mt-3">
          <Notice kind="error">{error ?? receta.error}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={guardar} disabled={saving || receta.insumos === null} className={`btn-vino min-h-12 disabled:opacity-60 ${focusRing}`}>
          {saving && <Loader2 size={18} className="animate-spin" aria-hidden="true" />} Guardar receta
        </button>
        <button type="button" onClick={onClose} disabled={saving} className={`btn-outline-vino min-h-12 ${focusRing}`}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
