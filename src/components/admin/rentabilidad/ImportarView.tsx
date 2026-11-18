import { useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import {
  formatCantidad,
  formatCosteUnitario,
  formatPrecioCompra,
  importarInsumos,
  leerMateriasPrimas,
  type FilaImportacion,
  type InformeImportacion,
} from '@/lib/costes';
import { ErrorExcel, leerExcel } from '@/lib/xlsx';

/**
 * Importar la hoja «Materias Primas» del Excel de costes: se lee en el navegador, el servidor
 * devuelve qué pasaría con cada fila (nuevo, cambia de precio, sin cambios, error) y, si no hay
 * errores, se confirma todo de una vez. Las recetas («Coste_Unitario») se importan en R2.
 */
export function ImportarView({ onTerminado }: { onTerminado: () => void }) {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaImportacion[] | null>(null);
  const [informe, setInforme] = useState<InformeImportacion | null>(null);
  const [busy, setBusy] = useState<'leyendo' | 'aplicando' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<InformeImportacion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idArchivo = useId();

  const reset = () => {
    setArchivo(null);
    setFilas(null);
    setInforme(null);
    setError(null);
    setHecho(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const elegir = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setArchivo(file.name);
    setBusy('leyendo');
    try {
      const libro = await leerExcel(file);
      const leido = leerMateriasPrimas(libro);
      if (leido.error) {
        setError(leido.error);
        return;
      }
      setFilas(leido.filas);
      const r = await importarInsumos(file.name, leido.filas, false);
      setInforme(r.informe);
      setError(r.error);
    } catch (e) {
      setError(e instanceof ErrorExcel ? e.message : 'No se ha podido leer el archivo. ¿Es un Excel (.xlsx)?');
      console.error('[rentabilidad] Error leyendo el Excel:', e);
    } finally {
      setBusy(null);
    }
  };

  const confirmar = async () => {
    if (!archivo || !filas) return;
    setBusy('aplicando');
    setError(null);
    const r = await importarInsumos(archivo, filas, true);
    setBusy(null);
    if (r.error || !r.informe) return setError(r.error ?? 'No se ha podido importar.');
    if (!r.informe.aplicada) {
      // Algo cambió entre la previsualización y la confirmación: se enseña el informe nuevo.
      setInforme(r.informe);
      return setError('Ha cambiado algo desde la previsualización. Revisa el resultado y vuelve a confirmar.');
    }
    setHecho(r.informe);
  };

  if (hecho) {
    return (
      <div className="rounded-r-lg border border-[#2f6b3f]/40 bg-[#2f6b3f]/5 p-6 text-center">
        <CheckCircle2 size={48} className="mx-auto text-[#2f6b3f]" aria-hidden="true" />
        <p className="mt-3 font-display text-2xl font-semibold text-[#1f4a2b]">Importación hecha</p>
        <p className="mt-1 text-sm text-carbon/75">
          {hecho.nuevos.length} ingredientes nuevos · {hecho.cambios.length} con precio nuevo · {hecho.iguales} sin cambios
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onTerminado} className={`btn-vino ${focusRing}`}>
            Ver ingredientes <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={reset} className={`btn-outline-vino ${focusRing}`}>
            Importar otro archivo
          </button>
        </div>
      </div>
    );
  }

  const sinCambios = informe && informe.nuevos.length === 0 && informe.cambios.length === 0 && informe.errores.length === 0;

  return (
    <section aria-label="Importar Excel">
      <div className="rounded-r-lg border border-piedra/50 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-sm text-carbon/75">
          Elige tu Excel de costes (<strong>.xlsx</strong>). Se lee la hoja <strong>«Materias Primas»</strong>: nombre, tamaño, unidad y precio de
          compra <strong>sin IVA</strong>. El archivo se lee en este navegador y no se sube: solo se envían esos datos. Las recetas se importan en la
          siguiente fase.
        </p>
        <p className="mt-2 text-sm text-carbon/75">
          Puedes volver a importarlo cuando cambien los precios: los ingredientes se reconocen por el nombre y los cambios quedan en su histórico.
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

      {informe && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Contador valor={informe.nuevos.length} texto="Nuevos" />
            <Contador valor={informe.cambios.length} texto="Cambian de precio" />
            <Contador valor={informe.iguales} texto="Sin cambios" />
            <Contador valor={informe.errores.length} texto="Con errores" alerta={informe.errores.length > 0} />
          </div>

          {informe.errores.length > 0 && (
            <div className="rounded-r-lg border border-vino/40 bg-vino/5 p-4">
              <h3 className="font-semibold text-vino">Corrige estas filas en el Excel y vuelve a elegirlo</h3>
              <p className="text-sm text-carbon/70">Con errores no se importa nada.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {informe.errores.map((e) => (
                  <li key={`${e.fila}-${e.motivo}`}>
                    <strong>Fila {e.fila}</strong>
                    {e.nombre ? ` · ${e.nombre}` : ''}: {e.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {informe.cambios.length > 0 && (
            <Tabla titulo="Cambian de precio">
              {informe.cambios.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-x-3 px-4 py-2 text-sm">
                  <span className="font-semibold">{c.nombre}</span>
                  <span className="tabular-nums text-carbon/75">
                    {formatPrecioCompra(c.precio_antes)} → <strong>{formatPrecioCompra(c.precio_despues)}</strong> ·{' '}
                    {formatCosteUnitario(c.coste_antes, c.unidad_base)} → <strong className="text-vino">{formatCosteUnitario(c.coste_despues, c.unidad_base)}</strong>
                  </span>
                </li>
              ))}
            </Tabla>
          )}

          {informe.nuevos.length > 0 && (
            <Tabla titulo="Ingredientes nuevos">
              {informe.nuevos.map((n) => (
                <li key={n.fila} className="flex flex-wrap justify-between gap-x-3 px-4 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{n.nombre}</span>
                    {n.categoria && <span className="text-carbon/55"> · {n.categoria}</span>}
                  </span>
                  <span className="tabular-nums text-carbon/75">
                    {formatPrecioCompra(n.precio_compra_sin_iva)} / {formatCantidad(n.cantidad_formato, n.unidad_base)} →{' '}
                    <strong className="text-vino">{formatCosteUnitario(n.coste_unitario, n.unidad_base)}</strong>
                  </span>
                </li>
              ))}
            </Tabla>
          )}

          {sinCambios ? (
            <Notice kind="info">Todo está igual que en el panel: no hay nada que importar.</Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirmar}
                disabled={busy !== null || informe.errores.length > 0}
                className={`btn-vino min-h-12 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
              >
                {busy === 'aplicando' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                Confirmar importación
              </button>
              <button type="button" onClick={reset} disabled={busy !== null} className={`btn-outline-vino min-h-12 ${focusRing}`}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </section>
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

function Tabla({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-carbon/60">{titulo}</h3>
      <ul className="divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">{children}</ul>
    </div>
  );
}
