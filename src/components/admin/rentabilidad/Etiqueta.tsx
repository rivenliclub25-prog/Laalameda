import { ETIQUETAS, formatPct, type Etiqueta } from '@/lib/rentabilidad';

/** Etiqueta de margen: «Bueno», «Bajo»… con su color (RENTABILIDAD.md, sección 5). */
export function EtiquetaBadge({ etiqueta, margen }: { etiqueta: Etiqueta; margen?: number | null }) {
  const e = ETIQUETAS[etiqueta];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${e.clase}`}>
      {margen !== undefined && margen !== null && <span className="tabular-nums">{formatPct(margen)}</span>}
      {margen !== undefined && margen !== null && <span aria-hidden="true">·</span>}
      {e.texto}
    </span>
  );
}

/** Punto de color con la etiqueta en el texto alternativo (para listas compactas como la Carta). */
export function EtiquetaPunto({ etiqueta, titulo }: { etiqueta: Etiqueta; titulo: string }) {
  return (
    <span className="inline-flex items-center" title={titulo}>
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${ETIQUETAS[etiqueta].punto}`} />
      <span className="sr-only">{titulo}</span>
    </span>
  );
}
