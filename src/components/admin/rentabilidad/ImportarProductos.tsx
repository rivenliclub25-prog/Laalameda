import { useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileUp, Loader2, Plus, RefreshCw, Wine, X } from 'lucide-react';
import { Checkbox, Notice, focusRing } from '@/components/club/FormControls';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { fetchCarta, type CategoryRow } from '@/lib/adminCatalog';
import { parseNumero } from '@/lib/costes';
import { proponerEmparejamientos, type Confianza } from '@/lib/emparejar';
import {
  categoriaSugerida,
  codigosDelExcel,
  esCopaA60,
  fetchEmparejamientos,
  fetchRentabilidad,
  formatEur,
  importarProductos,
  leerCosteUnitario,
  leerPrecioVenta,
  type Emparejamiento,
  type FilaPrecio,
  type FilaReceta,
  type InformeProductos,
  type ProductoRentabilidad,
} from '@/lib/rentabilidad';
import { ErrorExcel, leerExcel } from '@/lib/xlsx';

type Destino =
  | { tipo: 'pendiente' }
  | { tipo: 'ninguno' }
  | { tipo: 'carta'; ids: number[] }
  | { tipo: 'nuevo'; nombre: string; categoria_id: string };

interface Decision {
  destino: Destino;
  confianza: Confianza;
  nota?: string;
  /** Corregir el precio de la carta con el del Excel (por defecto, sí). */
  corregir: boolean;
}

const RECETA = { nueva: 'Receta nueva', cambia: 'Receta cambia', igual: 'Receta igual', no_viene: 'Sin receta en el Excel' } as const;
const selectClass = `h-10 w-full rounded-r-sm border border-carbon/20 bg-white px-2 text-sm ${focusRing}`;
const euros = (c: number | null) => (c === null ? '—' : formatEur(c / 100));

/**
 * Importar productos del Excel: recetas («Coste_Unitario») y precios («Precio_venta») a la vez.
 * Cada producto del Excel se empareja con la carta o se crea nuevo (sin salir en la carta). Los precios
 * del Excel corrigen los de la carta (se puede desmarcar alguno). Antes tienen que estar los ingredientes.
 */
export function ImportarProductos({ onTerminado }: { onTerminado: () => void }) {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [precios, setPrecios] = useState<FilaPrecio[]>([]);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [carta, setCarta] = useState<ProductoRentabilidad[]>([]);
  const [categorias, setCategorias] = useState<CategoryRow[]>([]);
  const [decisiones, setDecisiones] = useState<Map<string, Decision>>(new Map());
  const [informe, setInforme] = useState<InformeProductos | null>(null);
  const [desfasado, setDesfasado] = useState(false);
  const [busy, setBusy] = useState<'leyendo' | 'calculando' | 'aplicando' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<InformeProductos | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idArchivo = useId();

  const reset = () => {
    setArchivo(null);
    setFilas([]);
    setPrecios([]);
    setCantidades({});
    setDecisiones(new Map());
    setInforme(null);
    setDesfasado(false);
    setError(null);
    setHecho(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const productosExcel = useMemo(() => [...new Set([...filas.map((f) => f.producto), ...precios.map((f) => f.producto)].filter(Boolean))], [filas, precios]);
  const familia = useMemo(() => new Map([...filas, ...precios].map((f) => [f.producto, f.familia])), [filas, precios]);
  const nombreCarta = useMemo(() => new Map(carta.map((p) => [p.product_id, p.nombre])), [carta]);
  const gruposCarta = useMemo(() => {
    const m = new Map<string, ProductoRentabilidad[]>();
    for (const p of carta) m.set(p.categoria ?? p.categoria_id, [...(m.get(p.categoria ?? p.categoria_id) ?? []), p]);
    return [...m.entries()];
  }, [carta]);

  const filasParaEnviar = (fs = filas, cs = cantidades) => fs.map((f) => ({ ...f, cantidad: parseNumero(cs[f.fila] ?? '') }));
  const emparejamientos = (ds = decisiones): Emparejamiento[] =>
    [...ds.entries()].flatMap(([producto, d]): Emparejamiento[] => {
      if (d.destino.tipo === 'pendiente') return [];
      if (d.destino.tipo === 'ninguno') return [{ producto, product_ids: [], precio: d.corregir }];
      if (d.destino.tipo === 'carta') return [{ producto, product_ids: d.destino.ids, precio: d.corregir }];
      return [{ producto, nuevo: { nombre: d.destino.nombre.trim(), categoria_id: d.destino.categoria_id }, precio: true }];
    });

  const previsualizar = async (fs = filas, pr = precios, cs = cantidades, ds = decisiones, nombre = archivo) => {
    if (!nombre) return;
    setBusy('calculando');
    setError(null);
    const r = await importarProductos(nombre, filasParaEnviar(fs, cs), pr, emparejamientos(ds), false);
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
      const r1 = leerCosteUnitario(libro);
      const r2 = leerPrecioVenta(libro);
      if (r1.error && r2.error) {
        setError(`${r1.error} ${r2.error}`);
        setBusy(null);
        return;
      }
      const [r, g, c] = await Promise.all([fetchRentabilidad(), fetchEmparejamientos(), fetchCarta()]);
      if (r.error || g.error || c.error) {
        setError(r.error ?? g.error ?? c.error);
        setBusy(null);
        return;
      }
      const fs = r1.filas;
      const pr = r2.filas;
      const cs = Object.fromEntries(fs.map((f) => [f.fila, f.cantidad === null ? '' : String(f.cantidad).replace('.', ',')]));
      const nombres = [...new Set([...fs.map((f) => f.producto), ...pr.map((f) => f.producto)].filter(Boolean))];
      const fam = new Map([...fs, ...pr].map((f) => [f.producto, f.familia]));
      const propuestas = proponerEmparejamientos(
        nombres,
        r.productos.map((p) => ({ id: p.product_id, nombre: p.nombre, activo: p.activo })),
        g.guardados,
        codigosDelExcel([...fs, ...pr])
      );
      const ds = new Map<string, Decision>(
        propuestas.map((p) => {
          let destino: Destino;
          if (p.productIds.length > 0) destino = { tipo: 'carta', ids: p.productIds };
          else if (p.confianza === 'sin_pareja') {
            // Sin pareja: se propone crearlo (el equipo importa productos nuevos desde el Excel).
            const cat = categoriaSugerida(fam.get(p.excel) ?? null, c.categories);
            destino = cat ? { tipo: 'nuevo', nombre: p.excel.replace(/_/g, ' ').trim(), categoria_id: cat } : { tipo: 'pendiente' };
          } else destino = { tipo: 'ninguno' };
          return [p.excel, { destino, confianza: p.confianza, nota: p.nota, corregir: true }];
        })
      );
      setFilas(fs);
      setPrecios(pr);
      setCantidades(cs);
      setCarta(r.productos);
      setCategorias(c.categories);
      setDecisiones(ds);
      if (r1.error || r2.error) setError(`Aviso: ${r1.error ?? r2.error} Se importa lo demás.`);
      setBusy(null);
      await previsualizar(fs, pr, cs, ds, file.name);
    } catch (e) {
      setError(e instanceof ErrorExcel ? e.message : 'No se ha podido leer el archivo. ¿Es un Excel (.xlsx)?');
      console.error('[rentabilidad] Error leyendo el Excel:', e);
      setBusy(null);
    }
  };

  const cambiar = (excel: string, cambios: Partial<Decision>) => {
    setDecisiones((ds) => new Map(ds).set(excel, { ...ds.get(excel)!, ...cambios }));
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
    const r = await importarProductos(archivo, filasParaEnviar(), precios, emparejamientos(), true);
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
        <p className="mt-3 font-display text-2xl font-semibold text-[#1f4a2b]">Productos importados</p>
        <p className="mt-1 text-sm text-carbon/75">
          {hecho.productos_creados ?? 0} productos nuevos (sin salir en la carta: enciéndelos en Carta cuando los revises) · {hecho.precios_corregidos ?? 0} precios
          corregidos · {hecho.recetas_cambiadas ?? 0} recetas nuevas o cambiadas
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onTerminado} className={`btn-vino ${focusRing}`}>
            Ver productos y ganancia <ArrowRight size={16} aria-hidden="true" />
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
    return d && (d.confianza === 'dudoso' || d.confianza === 'sin_pareja' || d.destino.tipo === 'pendiente' || d.destino.tipo === 'nuevo');
  });
  const automaticos = productosExcel.filter((p) => !revisar.includes(p));
  const pendientes = productosExcel.filter((p) => decisiones.get(p)?.destino.tipo === 'pendiente').length;
  const prods = informe?.productos ?? [];
  const contar = (f: (p: InformeProductos['productos'][number]) => boolean) => prods.filter(f).length;
  const porExcel = (excel: string) => [...decisiones.entries()].find(([k]) => k === excel)?.[1];

  const fila = (excel: string) => (
    <EmparejarFila
      key={excel}
      excel={excel}
      familia={familia.get(excel) ?? null}
      decision={decisiones.get(excel)!}
      grupos={gruposCarta}
      categorias={categorias}
      nombreCarta={nombreCarta}
      onChange={(destino) => cambiar(excel, { destino })}
      disabled={busy !== null}
    />
  );

  return (
    <section aria-label="Importar productos">
      <div className="rounded-r-lg border border-piedra/50 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-sm text-carbon/75">
          Se leen las hojas <strong>«Coste_Unitario»</strong> (recetas) y <strong>«Precio_venta»</strong> (precio de cada producto). Antes tienen que
          estar importados los <strong>ingredientes</strong>. Los productos que no estén en la carta se pueden <strong>crear</strong> (quedan sin salir en
          la carta hasta que los enciendas). <strong>Los precios del Excel corrigen los de la carta</strong>: lo verás producto a producto antes de
          confirmar.
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
            <h3 className="font-display text-xl font-semibold text-vino">1. Emparejar con la carta o crear</h3>
            <p className="text-sm text-carbon/70">Qué producto de la carta es cada producto del Excel, o si se crea nuevo. Se recuerda para la próxima vez.</p>
            {revisar.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#7a4e00]">Revisa estos ({revisar.length})</p>
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

          {/* 2. Cantidades */}
          {filas.length > 0 && (
            <div>
              <h3 className="font-display text-xl font-semibold text-vino">2. Cantidades (opcional)</h3>
              <p className="text-sm text-carbon/70">Se importan tal cual vienen en el Excel. Si quieres, corrige alguna antes de confirmar.</p>
              {copas.length > 0 && (
                <button
                  type="button"
                  onClick={alternarCopas}
                  aria-pressed={copasAplicadas}
                  disabled={busy !== null}
                  className={`mt-2 inline-flex min-h-12 items-center gap-2 rounded-r-md border px-4 text-sm font-semibold ${focusRing} ${
                    copasAplicadas ? 'border-[#2f6b3f] bg-[#2f6b3f]/10 text-[#1f4a2b]' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino'
                  }`}
                >
                  <Wine size={18} aria-hidden="true" />
                  {copasAplicadas ? `Copas a 75 ml aplicado (${copas.length})` : `Copas: pasar el destilado de 60 a 75 ml (${copas.length})`}
                </button>
              )}
              <details className="mt-3 rounded-r-md border border-piedra/50 bg-white">
                <summary className={`cursor-pointer px-4 py-3 text-sm font-semibold text-carbon/80 ${focusRing}`}>Ver y corregir cantidades ({filas.length} líneas)</summary>
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
          )}

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
                  <Contador valor={contar((p) => p.nuevo)} texto="Productos nuevos" />
                  <Contador valor={contar((p) => p.cambia_precio && !p.nuevo)} texto="Precios que se corrigen" />
                  <Contador valor={contar((p) => p.estado_receta === 'nueva' || p.estado_receta === 'cambia')} texto="Recetas nuevas o que cambian" />
                  <Contador valor={informe.sin_carta.length} texto="No están en la carta" />
                  <Contador valor={informe.errores.length} texto="Con errores" alerta={informe.errores.length > 0} />
                </div>
                {informe.errores.length > 0 && (
                  <div className="mt-3 rounded-r-lg border border-vino/40 bg-vino/5 p-4">
                    <h4 className="font-semibold text-vino">Corrige esto (con errores no se importa nada)</h4>
                    <ul className="mt-2 space-y-1 text-sm">
                      {informe.errores.map((e, i) => (
                        <li key={i}>
                          {e.fila !== null && (
                            <strong>
                              {e.hoja ? `${e.hoja} · ` : ''}fila {e.fila} ·{' '}
                            </strong>
                          )}
                          {e.producto && <span>{e.producto}: </span>}
                          {e.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="mt-3 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
                  {prods.map((p) => {
                    const d = porExcel(p.producto_excel);
                    return (
                      <li key={`${p.product_id ?? 'n'}-${p.producto_excel}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm">
                        <span className="min-w-[180px] flex-1">
                          <strong>{p.nombre}</strong>
                          {p.nuevo && <span className="ml-2 rounded-full bg-[#2f6b3f] px-1.5 py-0.5 text-[0.65rem] font-bold text-white">NUEVO</span>}
                          {p.producto_excel !== p.nombre && <span className="text-carbon/50"> ← {p.producto_excel}</span>}
                          <span className="block text-xs text-carbon/55">
                            {RECETA[p.estado_receta]}
                            {p.lineas.length > 0 && ` · ${p.lineas.map((l) => `${l.cantidad.toLocaleString('es-ES')} ${l.unidad} ${l.insumo}`).join(' · ')}`}
                          </span>
                        </span>
                        <span className="w-48 text-right text-xs text-carbon/65">
                          {p.nuevo || p.precio_carta === p.precio_excel || p.precio_excel === null ? (
                            <span className="block text-sm font-semibold tabular-nums text-carbon">{euros(p.precio_centimos)}</span>
                          ) : (
                            <span className="block">
                              <span className="tabular-nums">
                                {euros(p.precio_carta)} → <strong className="text-vino">{euros(p.precio_excel)}</strong>
                              </span>
                              {d && d.destino.tipo !== 'nuevo' && (
                                <span className="mt-0.5 flex justify-end">
                                  <Checkbox checked={d.corregir} onChange={(v) => cambiar(p.producto_excel, { corregir: v })} disabled={busy !== null}>
                                    Corregir precio
                                  </Checkbox>
                                </span>
                              )}
                            </span>
                          )}
                          coste <strong className="tabular-nums text-carbon">{p.coste !== null ? formatEur(p.coste) : '—'}</strong>
                          {p.aviso_coste && p.coste_excel !== null && (
                            <span className="block text-[#7a4e00]" title="El coste del Excel no coincide con el calculado con la receta">
                              <AlertTriangle size={12} className="mr-1 inline" aria-hidden="true" />
                              en el Excel {formatEur(p.coste_excel)}
                            </span>
                          )}
                        </span>
                        <span className="w-36 text-right">
                          <EtiquetaBadge etiqueta={p.etiqueta} margen={p.margen_pct} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmar}
                    disabled={busy !== null || desfasado || informe.errores.length > 0 || pendientes > 0}
                    className={`btn-vino min-h-12 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                  >
                    {busy === 'aplicando' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                    Confirmar importación
                  </button>
                  <button type="button" onClick={reset} disabled={busy !== null} className={`btn-outline-vino min-h-12 ${focusRing}`}>
                    Cancelar
                  </button>
                </div>
                {pendientes > 0 && <p className="mt-2 text-sm text-[#7a4e00]">Falta decidir {pendientes} producto(s): elige uno de la carta, «Crear producto nuevo» o «No está en la carta».</p>}
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
  categorias,
  nombreCarta,
  onChange,
  disabled,
}: {
  excel: string;
  familia: string | null;
  decision: Decision;
  grupos: [string, ProductoRentabilidad[]][];
  categorias: CategoryRow[];
  nombreCarta: Map<number, string>;
  onChange: (destino: Destino) => void;
  disabled: boolean;
}) {
  const d = decision.destino;
  const dudoso = decision.confianza === 'dudoso' || decision.confianza === 'sin_pareja' || d.tipo === 'pendiente';
  const valor = d.tipo === 'pendiente' ? '' : d.tipo === 'ninguno' ? 'none' : d.tipo === 'nuevo' ? 'nuevo' : String(d.ids[0] ?? '');
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
  const etiqueta = d.tipo === 'nuevo' ? 'Se crea' : decision.confianza === 'codigo' ? 'Por código' : decision.confianza === 'guardado' ? 'De la vez anterior' : decision.confianza === 'seguro' ? 'Automático' : 'Revisar';

  return (
    <li className={`rounded-r-md border p-3 ${dudoso ? 'border-[#a86b00]/50 bg-[#a86b00]/5' : d.tipo === 'nuevo' ? 'border-[#2f6b3f]/40 bg-[#2f6b3f]/5' : 'border-carbon/10 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-[160px] flex-1 text-sm">
          <strong>{excel}</strong>
          {familia && <span className="text-carbon/50"> · {familia}</span>}
          <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${dudoso ? 'bg-[#a86b00]/15 text-[#7a4e00]' : 'bg-carbon/5 text-carbon/55'}`}>{etiqueta}</span>
          {decision.nota && <span className="block text-xs text-[#7a4e00]">{decision.nota}</span>}
        </span>
        <ArrowRight size={16} className="text-carbon/35" aria-hidden="true" />
        <label className="min-w-[200px] flex-1">
          <span className="sr-only">Producto de la carta para {excel}</span>
          <select
            value={valor}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') onChange({ tipo: 'pendiente' });
              else if (v === 'none') onChange({ tipo: 'ninguno' });
              else if (v === 'nuevo') onChange({ tipo: 'nuevo', nombre: excel.replace(/_/g, ' ').trim(), categoria_id: categoriaSugerida(familia, categorias) ?? categorias[0]?.id ?? '' });
              else onChange({ tipo: 'carta', ids: [Number(v), ...(d.tipo === 'carta' ? d.ids.slice(1) : [])] });
            }}
            className={selectClass}
          >
            <option value="">— Elegir —</option>
            <option value="nuevo">➕ Crear producto nuevo</option>
            <option value="none">No está en la carta</option>
            {opciones}
          </select>
        </label>
      </div>
      {d.tipo === 'nuevo' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:pl-[calc(160px+2rem)]">
          <label className="text-xs font-semibold text-carbon/80">
            Nombre en la carta
            <input
              value={d.nombre}
              disabled={disabled}
              maxLength={120}
              onChange={(e) => onChange({ ...d, nombre: e.target.value })}
              className={`mt-1 block h-10 w-full rounded-r-sm border border-carbon/20 bg-white px-2 text-sm ${focusRing}`}
            />
          </label>
          <label className="text-xs font-semibold text-carbon/80">
            Categoría
            <select value={d.categoria_id} disabled={disabled} onChange={(e) => onChange({ ...d, categoria_id: e.target.value })} className={`${selectClass} mt-1`}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {d.tipo === 'carta' && d.ids.length > 0 && (
        <div className="mt-2 space-y-2 sm:pl-[calc(160px+2rem)]">
          {d.ids.slice(1).map((id, i) => (
            <div key={`${id}-${i}`} className="flex items-center gap-2">
              <label className="flex-1">
                <span className="sr-only">Otro producto de la carta para {excel}</span>
                <select
                  value={String(id)}
                  disabled={disabled}
                  onChange={(e) => onChange({ tipo: 'carta', ids: d.ids.map((x, j) => (j === i + 1 ? Number(e.target.value) : x)) })}
                  className={selectClass}
                >
                  {opciones}
                </select>
              </label>
              <button
                type="button"
                onClick={() => onChange({ tipo: 'carta', ids: d.ids.filter((_, j) => j !== i + 1) })}
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
              const libre = grupos.flatMap(([, l]) => l).find((p) => !d.ids.includes(p.product_id));
              if (libre) onChange({ tipo: 'carta', ids: [...d.ids, libre.product_id] });
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
