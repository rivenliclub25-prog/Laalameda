import { useEffect, useMemo, useState } from 'react';
import { UNIDADES, fetchInsumos, parseNumero, type Insumo } from '@/lib/costes';
import { costeReceta, fetchReceta, type LineaReceta } from '@/lib/rentabilidad';

/** Estado de la receta que se está editando (ver RecetaEditor). */

export interface LineaEditable {
  key: number;
  insumo_id: number | null;
  cantidad: string;
  /** Unidad en la que se escribe (ml, cl, l, g, kg, ud): se guarda en la base del ingrediente. */
  unidad: string;
  merma: string;
}

const aTexto = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3, useGrouping: false });
let siguienteClave = 1;
/** Clave única para cada línea nueva de la lista. */
export const nuevaClave = () => siguienteClave++;

/** Lo que importa de las líneas para saber si la receta ha cambiado. */
const firma = (ls: LineaEditable[]) => JSON.stringify(ls.map((l) => [l.insumo_id, l.cantidad, l.unidad, l.merma]));

/** Carga los ingredientes y, si hay producto, su receta; calcula el coste y prepara lo que se guarda. */
export function useReceta(productId: number | null) {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [inicial, setInicial] = useState('[]');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchInsumos(), productId === null ? Promise.resolve({ lineas: [], error: null }) : fetchReceta(productId)]).then(([i, r]) => {
      if (!vivo) return;
      setInsumos(i.insumos);
      setError(i.error ?? r.error);
      const ls = r.lineas.map((l) => ({
        key: nuevaClave(),
        insumo_id: l.insumo_id,
        cantidad: aTexto(l.cantidad),
        unidad: l.insumos?.unidad_base ?? 'ud',
        merma: l.merma_pct ? aTexto(l.merma_pct) : '',
      }));
      setLineas(ls);
      setInicial(firma(ls));
    });
    return () => {
      vivo = false;
    };
  }, [productId]);

  const porId = useMemo(() => new Map((insumos ?? []).map((i) => [i.id, i])), [insumos]);

  /** Cantidad en la unidad base del ingrediente (null si no es válida). */
  const base = (l: LineaEditable) => {
    const i = l.insumo_id ? porId.get(l.insumo_id) : undefined;
    const u = UNIDADES[l.unidad];
    const c = parseNumero(l.cantidad);
    if (!i || !u || u.base !== i.unidad_base || c === null || c <= 0) return null;
    return Math.round(c * u.factor * 1000) / 1000;
  };
  const merma = (l: LineaEditable) => (l.merma.trim() ? parseNumero(l.merma) : 0);
  const validas = lineas.every((l) => base(l) !== null && merma(l) !== null && merma(l)! >= 0 && merma(l)! < 100);
  const coste = validas
    ? costeReceta(lineas.map((l) => ({ cantidad: base(l)!, merma_pct: merma(l)!, coste_unitario: porId.get(l.insumo_id!)!.coste_unitario })))
    : null;
  const cambiada = firma(lineas) !== inicial;

  /** Lo que se envía a admin_guardar_receta, o el motivo por el que no se puede guardar. */
  const paraGuardar = (): { lineas: LineaReceta[] } | { error: string } => {
    if (!validas) return { error: 'Revisa la receta: elige cada ingrediente y una cantidad mayor que 0 (merma de 0 a 99 %).' };
    const ids = lineas.map((l) => l.insumo_id);
    if (new Set(ids).size !== ids.length) return { error: 'Hay un ingrediente repetido en la receta: júntalo en una sola línea.' };
    return { lineas: lineas.map((l) => ({ insumo_id: l.insumo_id!, cantidad: base(l)!, merma_pct: merma(l)!, nota: null })) };
  };

  return { insumos, lineas, setLineas, error, porId, base, merma, coste, cambiada, paraGuardar };
}

export type Receta = ReturnType<typeof useReceta>;
