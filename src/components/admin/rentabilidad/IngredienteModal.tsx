import { useEffect, useId, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Notice, SubmitButton, Switch, TextField, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import {
  UNIDADES,
  UNIDADES_FORMULARIO,
  createInsumo,
  fetchHistorial,
  formatCantidad,
  formatCosteUnitario,
  formatPrecioCompra,
  parseNumero,
  updateInsumo,
  type Insumo,
  type InsumoCambios,
  type InsumoPrecio,
} from '@/lib/costes';

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const aTexto = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 4, useGrouping: false });

/** Crear o editar un ingrediente. Muestra el coste por unidad en directo y, al editar, su histórico de precios. */
export function IngredienteModal({
  insumo,
  categorias,
  onClose,
  onSaved,
}: {
  insumo: Insumo | null;
  categorias: string[];
  onClose: () => void;
  onSaved: (insumo: Insumo, nuevo: boolean) => void;
}) {
  const nuevo = insumo === null;
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [categoria, setCategoria] = useState(insumo?.categoria ?? '');
  const [proveedor, setProveedor] = useState(insumo?.proveedor ?? '');
  const [formato, setFormato] = useState(insumo?.formato ?? '');
  const [cantidad, setCantidad] = useState(insumo ? aTexto(insumo.cantidad_formato) : '');
  const [unidadTexto, setUnidadTexto] = useState<string>(insumo?.unidad_base ?? 'ml');
  const [rendimiento, setRendimiento] = useState(insumo ? aTexto(insumo.rendimiento_pct) : '100');
  const [precio, setPrecio] = useState(insumo ? aTexto(insumo.precio_compra_sin_iva) : '');
  const [activo, setActivo] = useState(insumo?.activo ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<InsumoPrecio[] | null>(null);
  const idUnidad = useId();
  const idCategorias = useId();

  useEffect(() => {
    if (!insumo) return;
    fetchHistorial(insumo.id).then((r) => setHistorial(r.precios));
  }, [insumo]);

  // Al editar no se cambia la magnitud (ml, g o ud): las recetas (R2) dependen de ella.
  const opciones = UNIDADES_FORMULARIO.filter((u) => !insumo || UNIDADES[u].base === insumo.unidad_base);
  const u = UNIDADES[unidadTexto];
  const cant = parseNumero(cantidad);
  const rend = parseNumero(rendimiento);
  const prec = parseNumero(precio);
  const cantidadBase = cant !== null && u ? Math.round(cant * u.factor * 1000) / 1000 : null;
  const valido = cantidadBase !== null && cantidadBase > 0 && rend !== null && rend > 0 && rend <= 100 && prec !== null && prec >= 0;
  const coste = valido ? prec! / (cantidadBase! * (rend! / 100)) : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Escribe el nombre del ingrediente.');
    if (cantidadBase === null || cantidadBase <= 0) return setError('La cantidad del formato tiene que ser mayor que 0.');
    if (rend === null || rend <= 0 || rend > 100) return setError('El rendimiento va de 1 a 100 %.');
    if (prec === null || prec < 0) return setError('Escribe el precio de compra (puede ser 0).');
    const datos: InsumoCambios = {
      nombre: nombre.replace(/\s+/g, ' ').trim(),
      categoria: categoria.trim() || null,
      proveedor: proveedor.trim() || null,
      formato: formato.trim() || null,
      cantidad_formato: cantidadBase,
      unidad_base: u.base,
      rendimiento_pct: Math.round(rend * 100) / 100,
      precio_compra_sin_iva: Math.round(prec * 10000) / 10000,
      activo,
    };
    setSaving(true);
    const r = insumo ? await updateInsumo(insumo.id, datos) : await createInsumo(datos);
    setSaving(false);
    if (r.error || !r.insumo) return setError(r.error ?? 'No se ha podido guardar.');
    onSaved(r.insumo, nuevo);
  };

  return (
    <Modal open title={nuevo ? 'Nuevo ingrediente' : `Editar: ${insumo.nombre}`} onClose={onClose} busy={saving} maxWidth="560px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Barril Estrella Galicia" required maxLength={120} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Categoría (opcional)" value={categoria} onChange={(e) => setCategoria(e.target.value)} list={idCategorias} maxLength={60} placeholder="Cervezas" />
          <datalist id={idCategorias}>
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <TextField label="Proveedor (opcional)" value={proveedor} onChange={(e) => setProveedor(e.target.value)} maxLength={120} />
        </div>

        <TextField label="Formato (opcional)" value={formato} onChange={(e) => setFormato(e.target.value)} maxLength={120} placeholder="Barril de 30 l, caja de 24…" />

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <TextField label="Cantidad que trae el formato" value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="30" required />
          <div>
            <label htmlFor={idUnidad} className="mb-1 block text-xs font-semibold text-carbon/80">
              Unidad
            </label>
            <select
              id={idUnidad}
              value={unidadTexto}
              onChange={(e) => setUnidadTexto(e.target.value)}
              className={`h-11 rounded-r-sm border border-carbon/20 bg-white px-3 text-sm ${focusRing}`}
            >
              {opciones.map((o) => (
                <option key={o} value={o}>
                  {UNIDADES[o].etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>
        {cantidadBase !== null && u && u.factor !== 1 && (
          <p className="-mt-2 text-xs text-carbon/60">Se guarda como {formatCantidad(cantidadBase, u.base)}.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Precio de compra (€)" value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="79,20" required />
          <TextField
            label="Rendimiento (%)"
            value={rendimiento}
            onChange={(e) => setRendimiento(e.target.value)}
            inputMode="decimal"
            hint="Lo aprovechable de lo comprado (p. ej. la espuma del barril). Si no lo sabes, 100."
          />
        </div>

        <div className="rounded-r-md border border-piedra/60 bg-piedra-suave/40 px-4 py-3" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wider text-carbon/60">Coste por unidad</p>
          <p className="font-display text-2xl font-bold text-vino tabular-nums">{coste !== null ? formatCosteUnitario(coste, u.base) : '—'}</p>
        </div>

        {!nuevo && (
          <div className="flex items-center gap-3">
            <Switch checked={activo} onChange={setActivo} label="Ingrediente en uso" />
            <span className="text-sm text-carbon/75">
              {activo ? 'En uso' : 'Dado de baja (no se borra: se conserva su histórico)'}
            </span>
          </div>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        <SubmitButton loading={saving} loadingText="Guardando…" disabled={!valido || !nombre.trim()}>
          {nuevo ? 'Crear ingrediente' : 'Guardar'}
        </SubmitButton>
      </form>

      {!nuevo && (
        <div className="mt-6 border-t border-carbon/10 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-carbon/60">Histórico de precios</h3>
          {historial === null ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-carbon/60">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando…
            </p>
          ) : historial.length === 0 ? (
            <p className="mt-2 text-sm text-carbon/60">Sin cambios registrados.</p>
          ) : (
            <ul className="mt-2 divide-y divide-carbon/10 text-sm">
              {historial.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                  <span className="text-carbon/65">
                    {fechaHora(h.vigente_desde)} · {h.origen === 'importacion' ? 'Importación' : 'A mano'}
                  </span>
                  <span className="tabular-nums">
                    {formatPrecioCompra(h.precio_compra_sin_iva)} / {formatCantidad(h.cantidad_formato, insumo.unidad_base)}
                    {h.rendimiento_pct < 100 ? ` (${h.rendimiento_pct.toLocaleString('es-ES')} %)` : ''} →{' '}
                    <strong className="text-vino">{formatCosteUnitario(h.coste_unitario, insumo.unidad_base)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
