import { useState } from 'react';
import { FileUp, Wheat } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import { IngredientesView } from '@/components/admin/rentabilidad/IngredientesView';
import { ImportarView } from '@/components/admin/rentabilidad/ImportarView';

type Vista = 'ingredientes' | 'importar';

const VISTAS: { id: Vista; label: string; icon: typeof Wheat }[] = [
  { id: 'ingredientes', label: 'Ingredientes', icon: Wheat },
  { id: 'importar', label: 'Importar Excel', icon: FileUp },
];

/**
 * Pestaña "Rentabilidad" del panel (RENTABILIDAD.md). R1: ingredientes con su coste e importación
 * del Excel. Productos, márgenes y resumen llegan en R2 y R3. Solo admins.
 */
export function RentabilidadSection() {
  const [vista, setVista] = useState<Vista>('ingredientes');
  // Al terminar una importación se vuelve a la lista, que se recarga.
  const [recarga, setRecarga] = useState(0);

  return (
    <>
      <div>
        <h2 className="font-display text-2xl font-semibold text-vino">Rentabilidad</h2>
        <p className="mt-1 text-sm text-carbon/70">
          Lo que cuesta cada ingrediente (precios de compra <strong>sin IVA</strong>). Solo lo ven los administradores.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Apartados de rentabilidad">
        {VISTAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={vista === id}
            onClick={() => setVista(id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-r-sm border px-3 text-sm font-semibold transition-colors ${focusRing} ${
              vista === id ? 'border-vino bg-vino text-white' : 'border-carbon/20 bg-white text-carbon/75 hover:border-vino'
            }`}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {vista === 'ingredientes' && <IngredientesView key={recarga} />}
        {vista === 'importar' && (
          <ImportarView
            onTerminado={() => {
              setRecarga((n) => n + 1);
              setVista('ingredientes');
            }}
          />
        )}
      </div>
    </>
  );
}
