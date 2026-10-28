import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, RefreshCw, Star } from 'lucide-react';
import { Checkbox, Notice, SubmitButton, Switch, TextField, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { parseEurosToCents } from '@/lib/tickets';
import { formatMenuPrice } from '@/lib/catalog';
import {
  centsToInput,
  createCategory,
  createProduct,
  createSection,
  fetchCarta,
  makeId,
  reorder,
  saveOrder,
  updateCategory,
  updateProduct,
  updateSection,
  type CategoryRow,
  type ProductRow,
  type SectionRow,
} from '@/lib/adminCatalog';

const byOrder = <T extends { orden: number; id: string | number }>(a: T, b: T) =>
  a.orden - b.orden || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

const iconButton = `flex h-9 w-9 items-center justify-center rounded-r-sm border border-carbon/15 bg-white text-carbon/70 transition-colors hover:border-vino hover:text-vino disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`;

type Result = { kind: 'success' | 'error'; text: string } | null;

type ProductEditorState = { mode: 'create'; categoria_id: string; seccion_id: string | null } | { mode: 'edit'; row: ProductRow };
type SectionEditorState = { mode: 'create'; categoria_id: string } | { mode: 'edit'; row: SectionRow };
type CategoryEditorState = { mode: 'create' } | { mode: 'edit'; row: CategoryRow };

/** Pestaña "Carta" del panel: categorías, separadores y productos (precio, visibilidad, agotado, orden). */
export function CartaSection() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [productEditor, setProductEditor] = useState<ProductEditorState | null>(null);
  const [sectionEditor, setSectionEditor] = useState<SectionEditorState | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await fetchCarta();
    setCategories(data.categories);
    setSections(data.sections);
    setProducts(data.products);
    setError(data.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- Cambios rápidos (el cambio se ve al momento y se deshace si la base de datos lo rechaza) ---

  const patchProduct = async (row: ProductRow, changes: Partial<ProductRow>, label: string) => {
    setResult(null);
    setBusyKey(`p-${row.id}`);
    setProducts((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...changes } : p)));
    const res = await updateProduct(row.id, changes);
    setBusyKey(null);
    if (res.row) {
      setProducts((prev) => prev.map((p) => (p.id === row.id ? res.row! : p)));
      setResult({ kind: 'success', text: `${row.nombre}: ${label}.` });
    } else {
      setProducts((prev) => prev.map((p) => (p.id === row.id ? row : p)));
      setResult({ kind: 'error', text: `${row.nombre}: ${res.error}` });
    }
  };

  const patchCategory = async (row: CategoryRow, changes: Partial<CategoryRow>) => {
    setResult(null);
    setCategories((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...changes } : c)));
    const res = await updateCategory(row.id, changes);
    if (!res.row) {
      setCategories((prev) => prev.map((c) => (c.id === row.id ? row : c)));
      setResult({ kind: 'error', text: `${row.nombre}: ${res.error}` });
    }
  };

  const patchSection = async (row: SectionRow, changes: Partial<SectionRow>) => {
    setResult(null);
    setSections((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...changes } : s)));
    const res = await updateSection(row.id, changes);
    if (!res.row) {
      setSections((prev) => prev.map((s) => (s.id === row.id ? row : s)));
      setResult({ kind: 'error', text: `${row.nombre}: ${res.error}` });
    }
  };

  /** Sube o baja un elemento dentro de su grupo. */
  const move = async (
    table: 'menu_categories' | 'menu_sections' | 'products',
    group: { id: string | number; orden: number }[],
    index: number,
    direction: -1 | 1
  ) => {
    const changes = reorder(group, index, direction, (x) => x.id);
    if (changes.length === 0) return;
    const apply = <T extends { id: string | number; orden: number }>(list: T[]) =>
      list.map((item) => {
        const change = changes.find((c) => c.key === item.id);
        return change ? { ...item, orden: change.orden } : item;
      });
    if (table === 'menu_categories') setCategories(apply);
    if (table === 'menu_sections') setSections(apply);
    if (table === 'products') setProducts(apply);
    const err = await saveOrder(table, changes);
    if (err) {
      setResult({ kind: 'error', text: err });
      load();
    }
  };

  const sortedCategories = [...categories].sort(byOrder);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-vino">Carta</h2>
          <p className="mt-1 text-sm text-carbon/70">
            Los cambios se ven en la web al recargarla. Para quitar algo, apágalo: así no se pierde el historial de ventas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCategoryEditor({ mode: 'create' })} className={`btn-outline-vino ${focusRing}`}>
            <Plus size={16} aria-hidden="true" /> Categoría
          </button>
          <button
            type="button"
            onClick={() =>
              sortedCategories[0] &&
              setProductEditor({ mode: 'create', categoria_id: sortedCategories[0].id, seccion_id: null })
            }
            disabled={sortedCategories.length === 0}
            className={`btn-vino disabled:opacity-60 ${focusRing}`}
          >
            <Plus size={16} aria-hidden="true" /> Producto
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Actualizar"
            className={`btn-outline-vino disabled:opacity-60 ${focusRing}`}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-4" aria-live="polite">
          <Notice kind={result.kind}>{result.text}</Notice>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Cargando la carta…
        </div>
      ) : error ? (
        <div className="mt-4 space-y-4">
          <Notice kind="error">{error}</Notice>
          <button type="button" onClick={load} className={`btn-outline-vino ${focusRing}`}>
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {sortedCategories.map((cat, ci) => {
            const catSections = sections.filter((s) => s.categoria_id === cat.id).sort(byOrder);
            const catProducts = products.filter((p) => p.categoria_id === cat.id);
            const sectionIds = new Set(catSections.map((s) => s.id));
            const loose = catProducts.filter((p) => !p.seccion_id || !sectionIds.has(p.seccion_id)).sort(byOrder);
            return (
              <section
                key={cat.id}
                aria-labelledby={`cat-${cat.id}`}
                className={`rounded-r-lg border border-piedra/50 bg-white/80 shadow-sm ${cat.visible ? '' : 'opacity-70'}`}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon/10 bg-piedra-suave/50 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <h3 id={`cat-${cat.id}`} className="font-display text-xl font-semibold text-vino">
                      {cat.nombre}
                      {!cat.visible && <span className="pend-badge ml-2 align-middle">OCULTA</span>}
                    </h3>
                    <p className="text-xs text-carbon/50">
                      {catProducts.length} productos · id {cat.id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-carbon/70">
                      <Switch
                        checked={cat.visible}
                        onChange={(v) => patchCategory(cat, { visible: v })}
                        label={`Categoría ${cat.nombre} visible en la web`}
                      />
                      Visible
                    </label>
                    <button type="button" className={iconButton} disabled={ci === 0} onClick={() => move('menu_categories', sortedCategories, ci, -1)} aria-label={`Subir ${cat.nombre}`}>
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" className={iconButton} disabled={ci === sortedCategories.length - 1} onClick={() => move('menu_categories', sortedCategories, ci, 1)} aria-label={`Bajar ${cat.nombre}`}>
                      <ArrowDown size={16} />
                    </button>
                    <button type="button" className={iconButton} onClick={() => setCategoryEditor({ mode: 'edit', row: cat })} aria-label={`Renombrar ${cat.nombre}`}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => setSectionEditor({ mode: 'create', categoria_id: cat.id })} className={`rounded-r-sm px-2 py-1.5 text-xs font-semibold text-vino hover:underline ${focusRing}`}>
                      + Separador
                    </button>
                    <button type="button" onClick={() => setProductEditor({ mode: 'create', categoria_id: cat.id, seccion_id: null })} className={`rounded-r-sm px-2 py-1.5 text-xs font-semibold text-vino hover:underline ${focusRing}`}>
                      + Producto
                    </button>
                  </div>
                </header>

                <ProductList
                  rows={loose}
                  busyKey={busyKey}
                  onPatch={patchProduct}
                  onMove={(i, d) => move('products', loose, i, d)}
                  onEdit={(row) => setProductEditor({ mode: 'edit', row })}
                />

                {catSections.map((sec, si) => {
                  const secProducts = catProducts.filter((p) => p.seccion_id === sec.id).sort(byOrder);
                  return (
                    <div key={sec.id} className={`border-t border-carbon/10 ${sec.visible ? '' : 'opacity-70'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-marfil/60 px-4 py-2 sm:px-5">
                        <div className="min-w-0 font-display text-lg text-vino">
                          {sec.nombre}
                          {sec.subtitulo && <span className="ml-2 font-primary text-xs text-carbon/60">— {sec.subtitulo}</span>}
                          {!sec.visible && <span className="pend-badge ml-2 align-middle">OCULTO</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={sec.visible}
                            onChange={(v) => patchSection(sec, { visible: v })}
                            label={`Separador ${sec.nombre} visible en la web`}
                          />
                          <button type="button" className={iconButton} disabled={si === 0} onClick={() => move('menu_sections', catSections, si, -1)} aria-label={`Subir ${sec.nombre}`}>
                            <ArrowUp size={16} />
                          </button>
                          <button type="button" className={iconButton} disabled={si === catSections.length - 1} onClick={() => move('menu_sections', catSections, si, 1)} aria-label={`Bajar ${sec.nombre}`}>
                            <ArrowDown size={16} />
                          </button>
                          <button type="button" className={iconButton} onClick={() => setSectionEditor({ mode: 'edit', row: sec })} aria-label={`Editar ${sec.nombre}`}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" onClick={() => setProductEditor({ mode: 'create', categoria_id: cat.id, seccion_id: sec.id })} className={`rounded-r-sm px-2 py-1.5 text-xs font-semibold text-vino hover:underline ${focusRing}`}>
                            + Producto
                          </button>
                        </div>
                      </div>
                      <ProductList
                        rows={secProducts}
                        busyKey={busyKey}
                        onPatch={patchProduct}
                        onMove={(i, d) => move('products', secProducts, i, d)}
                        onEdit={(row) => setProductEditor({ mode: 'edit', row })}
                      />
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      <ProductEditor
        state={productEditor}
        categories={sortedCategories}
        sections={sections}
        products={products}
        onClose={() => setProductEditor(null)}
        onSaved={(row, created) => {
          setProducts((prev) => (created ? [...prev, row] : prev.map((p) => (p.id === row.id ? row : p))));
          setProductEditor(null);
          setResult({ kind: 'success', text: created ? `Producto creado con el código ${row.id}.` : `${row.nombre}: guardado.` });
        }}
      />
      <SectionEditor
        state={sectionEditor}
        sections={sections}
        onClose={() => setSectionEditor(null)}
        onSaved={(row, created) => {
          setSections((prev) => (created ? [...prev, row] : prev.map((s) => (s.id === row.id ? row : s))));
          setSectionEditor(null);
        }}
      />
      <CategoryEditor
        state={categoryEditor}
        categories={categories}
        onClose={() => setCategoryEditor(null)}
        onSaved={(row, created) => {
          setCategories((prev) => (created ? [...prev, row] : prev.map((c) => (c.id === row.id ? row : c))));
          setCategoryEditor(null);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------
// Lista de productos de un grupo (categoría o separador)
// ---------------------------------------------------------------------

function ProductList({
  rows,
  busyKey,
  onPatch,
  onMove,
  onEdit,
}: {
  rows: ProductRow[];
  busyKey: string | null;
  onPatch: (row: ProductRow, changes: Partial<ProductRow>, label: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onEdit: (row: ProductRow) => void;
}) {
  if (rows.length === 0) return <p className="px-4 py-3 text-xs text-carbon/45 sm:px-5">Sin productos.</p>;
  return (
    <ul className="divide-y divide-carbon/10">
      {rows.map((row, i) => (
        <li key={row.id} className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5 ${row.activo ? '' : 'bg-carbon/[0.03]'}`}>
          <div className="min-w-[180px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-[0.68rem] font-bold tabular-nums text-carbon/70" title="Código del producto">
                #{row.id}
              </span>
              <span className={`font-semibold ${row.activo ? 'text-carbon' : 'text-carbon/50 line-through'}`}>{row.nombre}</span>
              {!row.activo && <span className="pend-badge">NO SALE</span>}
              {!row.disponible && <span className="pend-badge">AGOTADO</span>}
            </div>
            {row.descripcion && <p className="mt-0.5 text-xs text-carbon/60">{row.descripcion}</p>}
          </div>

          <PriceInput row={row} disabled={busyKey === `p-${row.id}`} onSave={(cents) => onPatch(row, { precio_centimos: cents }, 'precio guardado')} />

          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-carbon/70">
            <label className="flex items-center gap-1.5">
              <Switch checked={row.activo} onChange={(v) => onPatch(row, { activo: v }, v ? 'sale en la carta' : 'ya no sale en la carta')} label={`${row.nombre}: sale en la carta`} />
              <span className="hidden sm:inline">En carta</span>
            </label>
            <label className="flex items-center gap-1.5">
              <Switch checked={row.disponible} onChange={(v) => onPatch(row, { disponible: v }, v ? 'disponible' : 'marcado como agotado')} label={`${row.nombre}: disponible hoy`} />
              <span className="hidden sm:inline">Disponible</span>
            </label>
            <button
              type="button"
              onClick={() => onPatch(row, { recomendado: !row.recomendado }, row.recomendado ? 'ya no es recomendado' : 'recomendado')}
              aria-pressed={row.recomendado}
              aria-label={`${row.nombre}: recomendado`}
              className={`${iconButton} ${row.recomendado ? 'border-piedra bg-piedra/15 text-piedra' : ''}`}
            >
              <Star size={16} fill={row.recomendado ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className={iconButton} disabled={i === 0} onClick={() => onMove(i, -1)} aria-label={`Subir ${row.nombre}`}>
              <ArrowUp size={16} />
            </button>
            <button type="button" className={iconButton} disabled={i === rows.length - 1} onClick={() => onMove(i, 1)} aria-label={`Bajar ${row.nombre}`}>
              <ArrowDown size={16} />
            </button>
            <button type="button" className={iconButton} onClick={() => onEdit(row)} aria-label={`Editar ${row.nombre}`}>
              <Pencil size={15} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Precio editable en la propia fila: se guarda al salir del campo o con Intro. */
function PriceInput({ row, disabled, onSave }: { row: ProductRow; disabled: boolean; onSave: (cents: number | null) => void }) {
  const [value, setValue] = useState(centsToInput(row.precio_centimos));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setValue(centsToInput(row.precio_centimos));
    setInvalid(false);
  }, [row.precio_centimos]);

  const commit = () => {
    const cents = parseEurosToCents(value);
    if (cents === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (cents !== row.precio_centimos) onSave(cents);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      setValue(centsToInput(row.precio_centimos));
      setInvalid(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor={`precio-${row.id}`}>
        Precio de {row.nombre} en euros
      </label>
      <input
        id={`precio-${row.id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        inputMode="decimal"
        placeholder="—"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        title={invalid ? 'Escribe un precio como 2,50' : row.precio_centimos !== null ? formatMenuPrice(row.precio_centimos) : 'Sin precio'}
        className={`w-20 rounded-r-sm border bg-white px-2 py-1.5 text-right text-base font-semibold tabular-nums outline-none focus:border-vino focus:ring-1 focus:ring-vino/30 sm:text-sm ${
          invalid ? 'border-vino' : 'border-carbon/25'
        }`}
      />
      <span className="text-sm text-carbon/60" aria-hidden="true">
        €
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Editores (ventanas)
// ---------------------------------------------------------------------

const selectClass =
  'w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 font-primary text-base text-carbon outline-none focus:border-vino focus:ring-1 focus:ring-vino/30 sm:text-sm';

function ProductEditor({
  state,
  categories,
  sections,
  products,
  onClose,
  onSaved,
}: {
  state: ProductEditorState | null;
  categories: CategoryRow[];
  sections: SectionRow[];
  products: ProductRow[];
  onClose: () => void;
  onSaved: (row: ProductRow, created: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [categoria, setCategoria] = useState('');
  const [seccion, setSeccion] = useState('');
  const [recomendado, setRecomendado] = useState(false);
  const [activo, setActivo] = useState(true);
  const [disponible, setDisponible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    const row = state.mode === 'edit' ? state.row : null;
    setNombre(row?.nombre ?? '');
    setDescripcion(row?.descripcion ?? '');
    setPrecio(centsToInput(row?.precio_centimos ?? null));
    setCategoria(row?.categoria_id ?? (state.mode === 'create' ? state.categoria_id : ''));
    setSeccion((row ? row.seccion_id : state.mode === 'create' ? state.seccion_id : null) ?? '');
    setRecomendado(row?.recomendado ?? false);
    setActivo(row?.activo ?? true);
    setDisponible(row?.disponible ?? true);
    setError(null);
  }, [state]);

  if (!state) return null;
  const catSections = sections.filter((s) => s.categoria_id === categoria).sort(byOrder);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseEurosToCents(precio);
    if (!nombre.trim()) return setError('Escribe el nombre del producto.');
    if (cents === undefined) return setError('Escribe el precio como 2,50, o déjalo vacío si no tiene precio.');
    const seccionId = catSections.some((s) => s.id === seccion) ? seccion : null;
    const data = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      precio_centimos: cents,
      categoria_id: categoria,
      seccion_id: seccionId,
      recomendado,
      activo,
      disponible,
    };
    setSaving(true);
    setError(null);
    if (state.mode === 'create') {
      const group = products.filter((p) => p.categoria_id === categoria && (p.seccion_id ?? null) === seccionId);
      const orden = Math.max(0, ...group.map((p) => p.orden)) + 10;
      const res = await createProduct({ ...data, orden });
      setSaving(false);
      if (res.row) onSaved(res.row, true);
      else setError(res.error);
    } else {
      const res = await updateProduct(state.row.id, data);
      setSaving(false);
      if (res.row) onSaved(res.row, false);
      else setError(res.error);
    }
  };

  return (
    <Modal
      open
      title={state.mode === 'create' ? 'Nuevo producto' : `Editar #${state.row.id} · ${state.row.nombre}`}
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <TextField label="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} hint="Por ejemplo: «Estrella, 25cl»." />
        <TextField label="Precio (€)" value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="2,50" hint="Vacío = sin precio en la carta." />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="prod-categoria" className="mb-1 block text-xs font-semibold text-carbon/80">Categoría</label>
            <select id="prod-categoria" value={categoria} onChange={(e) => { setCategoria(e.target.value); setSeccion(''); }} className={selectClass}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="prod-seccion" className="mb-1 block text-xs font-semibold text-carbon/80">Separador</label>
            <select id="prod-seccion" value={seccion} onChange={(e) => setSeccion(e.target.value)} className={selectClass} disabled={catSections.length === 0}>
              <option value="">Sin separador</option>
              {catSections.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Checkbox checked={activo} onChange={setActivo}>Sale en la carta</Checkbox>
          <Checkbox checked={disponible} onChange={setDisponible}>Disponible hoy (si no, aparece como «Agotado»)</Checkbox>
          <Checkbox checked={recomendado} onChange={setRecomendado}>Recomendado (★ en la carta)</Checkbox>
        </div>
        {state.mode === 'create' && (
          <p className="text-xs text-carbon/60">El código del producto se asigna solo: el siguiente número libre.</p>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={onClose} disabled={saving} className={`btn-outline-vino flex-1 py-3 ${focusRing}`}>Cancelar</button>
          <div className="flex-1">
            <SubmitButton loading={saving} loadingText="Guardando…">{state.mode === 'create' ? 'Crear producto' : 'Guardar'}</SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function SectionEditor({
  state,
  sections,
  onClose,
  onSaved,
}: {
  state: SectionEditorState | null;
  sections: SectionRow[];
  onClose: () => void;
  onSaved: (row: SectionRow, created: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setNombre(state.mode === 'edit' ? state.row.nombre : '');
    setSubtitulo(state.mode === 'edit' ? (state.row.subtitulo ?? '') : '');
    setError(null);
  }, [state]);

  if (!state) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribe el nombre del separador.');
    setSaving(true);
    setError(null);
    if (state.mode === 'create') {
      const siblings = sections.filter((s) => s.categoria_id === state.categoria_id);
      const res = await createSection({
        id: makeId(nombre, sections.map((s) => s.id), `${state.categoria_id}-`),
        categoria_id: state.categoria_id,
        nombre: nombre.trim(),
        subtitulo: subtitulo.trim() || null,
        orden: Math.max(0, ...siblings.map((s) => s.orden)) + 10,
        visible: true,
      });
      setSaving(false);
      if (res.row) onSaved(res.row, true);
      else setError(res.error);
    } else {
      const res = await updateSection(state.row.id, { nombre: nombre.trim(), subtitulo: subtitulo.trim() || null });
      setSaving(false);
      if (res.row) onSaved(res.row, false);
      else setError(res.error);
    }
  };

  return (
    <Modal open title={state.mode === 'create' ? 'Nuevo separador' : `Editar separador`} onClose={onClose} busy={saving} maxWidth="460px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-carbon/70">Un separador agrupa productos dentro de una categoría (por ejemplo, «Ginebras» en Copas).</p>
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <TextField label="Subtítulo (opcional)" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} placeholder="solas o con tónica/refresco" />
        {error && <Notice kind="error">{error}</Notice>}
        <SubmitButton loading={saving} loadingText="Guardando…">{state.mode === 'create' ? 'Crear separador' : 'Guardar'}</SubmitButton>
      </form>
    </Modal>
  );
}

function CategoryEditor({
  state,
  categories,
  onClose,
  onSaved,
}: {
  state: CategoryEditorState | null;
  categories: CategoryRow[];
  onClose: () => void;
  onSaved: (row: CategoryRow, created: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setNombre(state.mode === 'edit' ? state.row.nombre : '');
    setError(null);
  }, [state]);

  if (!state) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribe el nombre de la categoría.');
    setSaving(true);
    setError(null);
    const res =
      state.mode === 'create'
        ? await createCategory({
            id: makeId(nombre, categories.map((c) => c.id)),
            nombre: nombre.trim(),
            orden: Math.max(0, ...categories.map((c) => c.orden)) + 10,
            visible: true,
          })
        : await updateCategory(state.row.id, { nombre: nombre.trim() });
    setSaving(false);
    if (res.row) onSaved(res.row, state.mode === 'create');
    else setError(res.error);
  };

  return (
    <Modal open title={state.mode === 'create' ? 'Nueva categoría' : 'Renombrar categoría'} onClose={onClose} busy={saving} maxWidth="460px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-carbon/70">Las categorías son las pestañas de la carta (Cafetería, Cervezas…).</p>
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        {error && <Notice kind="error">{error}</Notice>}
        <SubmitButton loading={saving} loadingText="Guardando…">{state.mode === 'create' ? 'Crear categoría' : 'Guardar'}</SubmitButton>
      </form>
    </Modal>
  );
}
