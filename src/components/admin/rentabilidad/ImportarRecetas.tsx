import { useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, FileUp, Loader2, Plus, RefreshCw, Wine, X } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { parseNumero } from '@/lib/costes';
import { proponerEmparejamientos, type Confianza } from '@/lib/emparejar';
import {
  esCopaA60,
  fetchEmparejamientos,
  fetchRentabilidad,
  formatEur,
  importarRecetas,
  leerCosteUnitario,
  type FilaReceta,
  type InformeRecetas,
  type ProductoRentabilidad,
} from '@/lib/rentabilidad';
import { ErrorExcel, leerExcel } from '@/lib/xlsx';

interface Decision {
  /** null = sin decidir; [] = no está en la carta. */
  ids: number[] | null;
  confianza: Confianza;
  nota?: string;
}

const ESTADO = { nueva: 'Nueva', cambia: 'Cambia', igual: 'Igual' } as const;
const selectClass = `h-10 w-full rounded-r-sm border border-carbon/20 bg-white px-2 text-sm ${focusRing}`;

/**
 * Importar las recetas (hoja «Coste_Unitario»): emparejar cada producto del Excel con la carta,
 * corregir dosis, previsualizar márgenes y confirmar. Los ingredientes tienen que estar importados.
 */
export function ImportarRecetas({ onTerminado }: { onTerminado: () => void }) {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [carta, setCarta] = useState<ProductoRentabilidad[]>([]);
  const [decisiones, setDecisiones] = useState<Map<string, Decision>>(new Map());
  const [informe, setInforme] = useState<InformeRecetas | null>(null);
  const [desfasado, setDesfasado] = useState(false);
  const [busy, setBusy] = useState<'leyendo' | 'calculando' | 'aplicando' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<InformeRecetas | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idArchivo = useId();

  const reset = () => {
    setArchivo(null);
    setFilas([]);
    setCantidades({});
    setDecisiones(new Map());
    setInforme(null);
    setDesfasado(false);
    setError(null);
    setHecho(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const productosExcel = useMemo(() => [...new Set(filas.map((f) => f.producto).filter(Boolean))], [filas]);
  const familia = useMemo(() => new Map(filas.map((f) => [f.producto, f.familia])), [filas]);
  const nombreCarta = useMemo(() => new Map(carta.map((p) => [p.product_id, p.nombre])), [carta]);
  const gruposCarta = useMemo(() => {
    const m = new Map<string, ProductoRentabilidad[]>();
    for (const p of carta) m.set(p.categoria ?? p.categoria_id, [...(m.get(p.categoria ?? p.categoria_id) ?? []), p]);
    return [...m.entries()];
  }, [carta]);

  const filasParaEnviar = (fs = filas, cs = cantidades) => fs.map((f) => ({ ...f, cantidad: parseNumero(cs[f.fila] ?? '') }));
  const emparejamientos = (ds = decisiones) =>
    [...ds.entries()].filter(([, d]) => d.ids !== null).map(([producto, d]) => ({ producto, product_ids: d.ids! }));

  const previsualizar = async (fs = filas, cs = cantidades, ds = decisiones, nombre = archivo) => {
    if (!nombre) return;
    setBusy('calculando');
    setError(null);
    const r = await importarRecetas(nombre, filasParaEnviar(fs, cs), emparejamientos(ds), false);
    setBusy(null);
    setInforme(r.informe);
    setDesfasado(false);
    if (r.error) setError(r.error);
  };

  const elegir = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setArchivo(file.name);
    setBusy('leyendo');
    try {
      const libro = await leerExcel(file);
      const leido = leerCosteUnitario(libro);
      if (leido.error) {
        setError(leido.error);
        setBusy(null);
        return;
      }
      const [r, g] = await Promise.all([fetchRentabilidad(), fetchEmparejamientos()]);
      if (r.error || g.error) {
        setError(r.error ?? g.error);
        setBusy(null);
        return;
      }
      const cs = Object.fromEntries(leido.filas.map((f) => [f.fila, f.cantidad === null ? '' : String(f.cantidad).replace('.', ',')]));
      const nombres = [...new Set(leido.filas.map((f) => f.producto).filter(Boolean))];
      const propuestas = proponerEmparejamientos(
        nombres,
        r.productos.map((p) => ({ id: p.product_id, nombre: p.nombre, activo: p.activo })),
        g.guardados
      );
      const ds = new Map<string, Decision>(
        propuestas.map((p) => [
          p.excel,
          { ids: p.confianza === 'sin_pareja' ? null : p.productIds, confianza: p.confianza, nota: p.nota },
        ])
      );
      setFilas(leido.filas);
      setCantidades(cs);
      setCarta(r.productos);
      setDecisiones(ds);
      setBusy(null);
      await previsualizar(leido.filas, cs, ds, file.name);
    } catch (e) {
      setError(e instanceof ErrorExcel ? e.message : 'No se ha podido leer el archivo. ¿Es un Excel (.xlsx)?');
      console.error('[rentabilidad] Error leyendo el Excel:', e);
      setBusy(null);
    }
  };

  const decidir = (excel: string, ids: number[] | null) => {
    setDecisiones((ds) => new Map(ds).set(excel, { ...ds.get(excel)!, ids }));
    setDesfasado(true);
  };

  const copas = filas.filter(esCopaA60);
  const copasAplicadas = copas.length > 0 && copas.every((f) => parseNumero(cantidades[f.fila] ?? '') === 75);
  const alternarCopas = () => {
    setCantidades((cs) => ({ ...cs, ...Object.fromEntries(copas.map((f) => [f.fila, copasAplicadas ? '60' : '75'])) }));
    setDesfasado(true);
  };

  const confirmar = async () => {
    if (!archivo) return;
    setBusy('aplicando');
    setError(null);
    const r = await importarRecetas(archivo, filasParaEnviar(), emparejamientos(), true);
    setBusy(null);
    if (r.error || !r.informe) return setError(r.error ?? 'No se ha podido importar.');
    if (!r.informe.aplicada) {
      setInforme(r.informe);
      return setError('Hay errores: revísalos y vuelve a confirmar.');
    }
    setHecho(r.informe);
  };

  if (hecho) {
    return (
      <div className="rounded-r-lg border border-[#2f6b3f]/40 bg-[#2f6b3f]/5 p-6 text-center">
        <CheckCircle2 size={48} className="mx-auto text-[#2f6b3f]" aria-hidden="true" />
        <p className="mt-3 font-display text-2xl font-semibold text-[#1f4a2b]">Recetas importadas</p>
        <p className="mt-1 text-sm text-carbon/75">
          {hecho.recetas_cambiadas ?? 0} recetas nuevas o cambiadas · {hecho.productos.length} productos con receta
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onTerminado} className={`btn-vino ${focusRing}`}>
            Ver productos y márgenes <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={reset} className={`btn-outline-vino ${focusRing}`}>
            Importar otro archivo
          </button>
        </div>
      </div>
    );
  }

  const revisar = productosExcel.filter((p) => {
    const d = decisiones.get(p);
    return d && (d.confianza === 'dudoso' || d.confianza === 'sin_pareja' || d.ids === null);
  });
  const automaticos = productosExcel.filter((p) => !revisar.includes(p));
  const sinDecidir = productosExcel.filter((p) => decisiones.get(p)?.ids === null).length;
  const cuenta = (e: 'nueva' | 'cambia' | 'igual') => informe?.productos.filter((p) => p.estado === e).length ?? 0;

  const fila = (excel: string) => (
    <EmparejarFila
      key={excel}
      excel={excel}
      familia={familia.get(excel) ?? null}
      decision={decisiones.get(excel)!}
      grupos={gruposCarta}
      nombreCarta={nombreCarta}
      onChange={(ids) => decidir(excel, ids)}
      disabled={busy !== null}
    />
  );

  return (
    <section aria-label="Importar recetas">
      <div className="rounded-r-lg border border-piedra/50 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-sm text-carbon/75">
          Se lee la hoja <strong>«Coste_Unitario»</strong> (producto, materia prima, cantidad y medida). Antes tienen que estar importados los{' '}
          <strong>ingredientes</strong>. La receta del archivo sustituye a la del producto; los que no vienen en el archivo no se tocan.
        </p>
        <label
          htmlFor={idArchivo}
          className={`mt-4 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-r-md border-2 border-dashed border-vino/40 px-4 text-sm font-semibold text-vino hover:border-vino hover:bg-vino/5 ${focusRing}`}
        >
          {busy === 'leyendo' ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <FileUp size={18} aria-hidden="true" />}
          {busy === 'leyendo' ? 'Leyendo…' : archivo ? `${archivo} · elegir otro` : 'Elegir Excel'}
        </label>
        <input
          ref={inputRef}
          id={idArchivo}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={busy !== null}
          onChange={(e) => elegir(e.target.files?.[0])}
        />
      </div>

      {error && (
        <div className="mt-4" aria-live="polite">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {productosExcel.length > 0 && (
        <div className="mt-5 space-y-6">
          {/* 1. Emparejamiento */}
          <div>
            <h3 className="font-display text-xl font-semibold text-vino">1. Emparejar con la carta</h3>
            <p className="text-sm text-carbon/70">
              Qué producto de la carta es cada producto del Excel. Se recuerda para la próxima vez.
            </p>
            {revisar.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#7a4e00]">Necesitan tu revisión ({revisar.length})</p>
                <ul className="mt-1.5 space-y-2">{revisar.map(fila)}</ul>
              </>
            )}
            {automaticos.length > 0 && (
              <details className="mt-3 rounded-r-md border border-piedra/50 bg-white">
                <summary className={`cursor-pointer px-4 py-3 text-sm font-semibold text-carbon/80 ${focusRing}`}>
                  Emparejados automáticamente ({automaticos.length}) · tocar para revisar
                </summary>
                <ul className="space-y-2 px-3 pb-3">{automaticos.map(fila)}</ul>
              </details>
            )}
          </div>

          {/* 2. Dosis */}
          <div>
            <h3 className="font-display text-xl font-semibold text-vino">2. Dosis</h3>
            {copas.length > 0 && (
              <button
                type="button"
                onClick={alternarCopas}
                aria-pressed={copasAplicadas}
                disabled={busy !== null}
                className={`mt-2 inline-flex min-h-12 items-center gap-2 rounded-r-md border px-4 text-sm font-semibold ${focusRing} ${
                  copasAplicadas ? 'border-[#2f6b3f] bg-[#2f6b3f]/10 text-[#1f4a2b]' : 'border-vino/40 bg-white text-vino hover:border-vino'
                }`}
              >
                <Wine size={18} aria-hidden="true" />
                {copasAplicadas ? `Copas a 75 ml aplicado (${copas.length})` : `Copas: pasar el destilado de 60 a 75 ml (${copas.length})`}
              </button>
            )}
            <details className="mt-3 rounded-r-md border border-piedra/50 bg-white">
              <summary className={`cursor-pointer px-4 py-3 text-sm font-semibold text-carbon/80 ${focusRing}`}>
                Ver y corregir cantidades ({filas.length} líneas)
              </summary>
              <ul className="divide-y divide-carbon/10 px-4 pb-2">
                {filas.map((f) => (
                  <li key={f.fila} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                    <span className="w-12 text-xs text-carbon/45">fila {f.fila}</span>
                    <span className="min-w-[200px] flex-1">
                      <strong>{f.producto}</strong> · {f.insumo}
                    </span>
                    <label className="flex items-center gap-1.5">
                      <span className="sr-only">
                        Cantidad de {f.insumo} en {f.producto}
                      </span>
                      <input
                        value={cantidades[f.fila] ?? ''}
                        onChange={(e) => {
                          setCantidades((cs) => ({ ...cs, [f.fila]: e.target.value }));
                          setDesfasado(true);
                        }}
                        inputMode="decimal"
                        className={`h-9 w-20 rounded-r-sm border border-carbon/20 bg-white px-2 text-right text-sm ${focusRing}`}
                      />
                      <span className="w-8 text-xs text-carbon/60">{f.medida}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {/* 3. Resultado */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl font-semibold text-vino">3. Resultado</h3>
              <button type="button" onClick={() => previsualizar()} disabled={busy !== null} className={`btn-outline-vino ${focusRing}`}>
                {busy === 'calculando' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
                Actualizar previsualización
              </button>
            </div>
            {desfasado && (
              <div className="mt-2">
                <Notice kind="info">Has cambiado algo: pulsa «Actualizar previsualización» para ver el resultado antes de confirmar.</Notice>
              </div>
            )}
            {informe && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Contador valor={cuenta('nueva')} texto="Recetas nuevas" />
                  <Contador valor={cuenta('cambia')} texto="Cambian" />
                  <Contador valor={cuenta('igual')} texto="Iguales" />
                  <Contador valor={informe.sin_carta.length} texto="No están en la carta" />
                  <Contador valor={informe.errores.length} texto="Con errores" alerta={informe.errores.length > 0} />
                </div>
                {informe.errores.length > 0 && (
                  <div className="mt-3 rounded-r-lg border border-vino/40 bg-vino/5 p-4">
                    <h4 className="font-semibold text-vino">Corrige esto (con errores no se importa nada)</h4>
                    <ul className="mt-2 space-y-1 text-sm">
                      {informe.errores.map((e, i) => (
                        <li key={i}>
                          {e.fila !== null && <strong>Fila {e.fila} · </strong>}
                          {e.producto && <span>{e.producto}: </span>}
                          {e.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="mt-3 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
                  {informe.productos.map((p) => (
                    <li key={p.product_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
                      <span className="min-w-[180px] flex-1">
                        <strong>{p.nombre}</strong>
                        {p.producto_excel !== p.nombre && <span className="text-carbon/50"> ← {p.producto_excel}</span>}
                        <span className="block text-xs text-carbon/55">{p.lineas.map((l) => `${l.cantidad.toLocaleString('es-ES')} ${l.unidad} ${l.insumo}`).join(' · ')}</span>
                      </span>
                      <span className={`text-xs font-semibold ${p.estado === 'igual' ? 'text-carbon/45' : 'text-vino'}`}>{ESTADO[p.estado]}</span>
                      <span className="w-28 text-right text-xs text-carbon/60">
                        coste <strong className="tabular-nums text-carbon">{p.coste !== null ? formatEur(p.coste) : '—'}</strong>
                        <span className="block">precio {p.precio_centimos !== null ? formatEur(p.precio_centimos / 100) : '—'}</span>
                      </span>
                      <span className="w-36 text-right">
                        <EtiquetaBadge etiqueta={p.etiqueta} margen={p.margen_pct} />
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmar}
                    disabled={busy !== null || desfasado || informe.errores.length > 0 || sinDecidir > 0}
                    className={`btn-vino min-h-12 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                  >
                    {busy === 'aplicando' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                    Confirmar importación
                  </button>
                  <button type="button" onClick={reset} disabled={busy !== null} className={`btn-outline-vino min-h-12 ${focusRing}`}>
                    Cancelar
                  </button>
                </div>
                {sinDecidir > 0 && <p className="mt-2 text-sm text-[#7a4e00]">Falta emparejar {sinDecidir} producto(s): elige uno o «No está en la carta».</p>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function EmparejarFila({
  excel,
  familia,
  decision,
  grupos,
  nombreCarta,
  onChange,
  disabled,
}: {
  excel: string;
  familia: string | null;
  decision: Decision;
  grupos: [string, ProductoRentabilidad[]][];
  nombreCarta: Map<number, string>;
  onChange: (ids: number[] | null) => void;
  disabled: boolean;
}) {
  const dudoso = decision.confianza === 'dudoso' || decision.confianza === 'sin_pareja';
  const ids = decision.ids;
  const valor = (i: number) => (ids === null ? '' : ids.length === 0 ? 'none' : String(ids[i] ?? ''));
  const opciones = (
    <>
      {grupos.map(([cat, lista]) => (
        <optgroup key={cat} label={cat}>
          {lista.map((p) => (
            <option key={p.product_id} value={p.product_id}>
              {p.nombre}
              {p.activo ? '' : ' (no sale en la carta)'}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
  const etiqueta = decision.confianza === 'guardado' ? 'De la vez anterior' : decision.confianza === 'seguro' ? 'Automático' : 'Revisar';

  return (
    <li className={`rounded-r-md border p-3 ${dudoso ? 'border-[#a86b00]/50 bg-[#a86b00]/5' : 'border-carbon/10 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-[160px] flex-1 text-sm">
          <strong>{excel}</strong>
          {familia && <span className="text-carbon/50"> · {familia}</span>}
          <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${dudoso ? 'bg-[#a86b00]/15 text-[#7a4e00]' : 'bg-carbon/5 text-carbon/55'}`}>
            {etiqueta}
          </span>
          {decision.nota && <span className="block text-xs text-[#7a4e00]">{decision.nota}</span>}
        </span>
        <ArrowRight size={16} className="text-carbon/35" aria-hidden="true" />
        <label className="min-w-[200px] flex-1">
          <span className="sr-only">Producto de la carta para {excel}</span>
          <select
            value={valor(0)}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') onChange(null);
              else if (v === 'none') onChange([]);
              else onChange([Number(v), ...(ids ?? []).slice(1)]);
            }}
            className={selectClass}
          >
            <option value="">— Elegir —</option>
            <option value="none">No está en la carta</option>
            {opciones}
          </select>
        </label>
      </div>
      {ids && ids.length > 0 && (
        <div className="mt-2 space-y-2 pl-0 sm:pl-[calc(160px+2rem)]">
          {ids.slice(1).map((id, i) => (
            <div key={`${id}-${i}`} className="flex items-center gap-2">
              <label className="flex-1">
                <span className="sr-only">Otro producto de la carta para {excel}</span>
                <select
                  value={String(id)}
                  disabled={disabled}
                  onChange={(e) => onChange(ids.map((x, j) => (j === i + 1 ? Number(e.target.value) : x)))}
                  className={selectClass}
                >
                  {opciones}
                </select>
              </label>
              <button
                type="button"
                onClick={() => onChange(ids.filter((_, j) => j !== i + 1))}
                aria-label={`Quitar ${nombreCarta.get(id) ?? 'producto'}`}
                className={`flex h-10 w-10 items-center justify-center rounded-full border border-carbon/15 text-carbon/60 hover:text-vino ${focusRing}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const libre = grupos.flatMap(([, l]) => l).find((p) => !ids.includes(p.product_id));
              if (libre) onChange([...ids, libre.product_id]);
            }}
            className={`inline-flex items-center gap-1 text-xs font-semibold text-vino hover:underline ${focusRing}`}
          >
            <Plus size={14} aria-hidden="true" /> Usar esta receta también en otro producto
          </button>
        </div>
      )}
    </li>
  );
}

function Contador({ valor, texto, alerta = false }: { valor: number; texto: string; alerta?: boolean }) {
  return (
    <div className={`rounded-r-md border px-3 py-2 ${alerta ? 'border-vino bg-vino/10 text-vino' : 'border-piedra/50 bg-white'}`}>
      <p className="font-display text-2xl font-bold tabular-nums">{valor}</p>
      <p className="text-xs text-carbon/65">{texto}</p>
    </div>
  );
}
