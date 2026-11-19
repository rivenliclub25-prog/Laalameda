import { useState } from 'react';
import { BarChart3, ChefHat, FileUp, Gift, Settings2, Wheat } from 'lucide-react';
import { focusRing } from '@/components/club/FormControls';
import { ResumenView } from '@/components/admin/rentabilidad/ResumenView';
import { ProductosView } from '@/components/admin/rentabilidad/ProductosView';
import { PromosView } from '@/components/admin/rentabilidad/PromosView';
import { IngredientesView } from '@/components/admin/rentabilidad/IngredientesView';
import { ImportarView } from '@/components/admin/rentabilidad/ImportarView';
import { AjustesView } from '@/components/admin/rentabilidad/AjustesView';

type Vista = 'resumen' | 'productos' | 'promos' | 'ingredientes' | 'importar' | 'ajustes';

const VISTAS: { id: Vista; label: string; icon: typeof Wheat }[] = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3 },
  { id: 'productos', label: 'Productos', icon: ChefHat },
  { id: 'promos', label: 'Promos', icon: Gift },
  { id: 'ingredientes', label: 'Ingredientes', icon: Wheat },
  { id: 'importar', label: 'Importar Excel', icon: FileUp },
  { id: 'ajustes', label: 'Ajustes', icon: Settings2 },
];

/**
 * Pestaña "Rentabilidad" del panel (RENTABILIDAD.md): productos con su margen y etiqueta, recetas,
 * ingredientes con su coste, importación del Excel y ajustes. Solo admins.
 */
export function RentabilidadSection() {
  const [vista, setVista] = useState<Vista>('resumen');
  // Al terminar una importación se va a la lista correspondiente, que se recarga.
  const [recarga, setRecarga] = useState(0);
  const ir = (v: Vista) => {
    setRecarga((n) => n + 1);
    setVista(v);
  };

  return (
    <>
      <div>
        <h2 className="font-display text-2xl font-semibold text-vino">Rentabilidad</h2>
        <p className="mt-1 text-sm text-carbon/70">
          Coste, precio de venta y <strong>% de ganancia</strong> de cada producto, con los precios tal como vienen en el Excel. Solo lo ven los administradores.
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
        {vista === 'resumen' && <ResumenView key={recarga} />}
        {vista === 'productos' && <ProductosView key={recarga} />}
        {vista === 'promos' && <PromosView key={recarga} />}
        {vista === 'ingredientes' && <IngredientesView key={recarga} />}
        {vista === 'importar' && <ImportarView onIngredientes={() => ir('ingredientes')} onRecetas={() => ir('productos')} />}
        {vista === 'ajustes' && <AjustesView />}
      </div>
    </>
  );
}
