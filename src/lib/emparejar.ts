/**
 * Propuesta de emparejamiento: qué producto de la carta es cada producto del Excel de costes
 * (RENTABILIDAD.md, sección 8). Solo propone: el admin lo revisa y confirma en la importación.
 *
 * Orden: 0) el código del producto, si el Excel lo trae (el que se descarga del panel lo lleva);
 * 1) lo que ya se confirmó en una importación anterior; 2) equivalencias conocidas del
 * Excel de La Alameda; 3) mismo nombre (sin mayúsculas, acentos ni signos); 4) el más parecido,
 * marcado como dudoso.
 */

export interface ProductoCarta {
  id: number;
  nombre: string;
  activo: boolean;
}

export type Confianza = 'codigo' | 'guardado' | 'seguro' | 'dudoso' | 'sin_pareja';

export interface Propuesta {
  /** Nombre del producto en el Excel, tal cual. */
  excel: string;
  /** Productos de la carta propuestos ([] = no está en la carta o sin pareja). */
  productIds: number[];
  confianza: Confianza;
  nota?: string;
}

/** Minúsculas, sin acentos, «_» como espacio, sin apóstrofos ni signos, espacios simples. */
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-/.]/g, ' ')
    .replace(/['’´`]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clave con la que la base de datos guarda el emparejamiento (minúsculas, espacios simples). */
export const claveExcel = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Equivalencias del Excel de costes de La Alameda (nombres, no datos sensibles). Cada una lista los
 * nombres de la carta que valen, en orden de preferencia; [] = no está en la carta.
 */
const EQUIVALENCIAS: Record<string, { carta: string[]; nota?: string }> = {
  'cana estrella': { carta: ['Caña'] },
  'cana 1906': { carta: ['Caña 1906'] },
  'canon estrella': { carta: ['Cañón'] },
  'canon 1906': { carta: ['Cañón 1906'] },
  'botellin estrella': { carta: ['Botellín'] },
  'botellin estrellasg': { carta: ['Botellín Estrella sin gluten', 'Botellín sin gluten'] },
  'tercio estrella': { carta: ['Tercio'] },
  tercio: { carta: [], nota: 'En el Excel es la Estrella 0,0 Tostada, que no está en la carta' },
  solo: { carta: ['Solo', 'Café solo'] },
  'con leche': { carta: ['Con leche', 'Café con leche'] },
  'irish coffe': { carta: ['Irish Coffee'] },
  hendricks: { carta: ["Hendrick's"] },
  barcelo: { carta: ['Barceló'] },
  bacardi: { carta: ['Bacardi Carta Blanca', 'Bacardi'] },
  'captain morgan': { carta: ['Capitán Morgan'] },
  ballantines: { carta: ["Ballantine's"] },
  baileys: { carta: ["Bailey's"] },
  'licor de cafe': { carta: ['Chupito licor de café'] },
  'licor de hierbas': { carta: ['Licor de hierbas'] },
  izaguirre: { carta: ['Vermut Izaguirre'] },
  refresco: { carta: ['Coca-Cola'] },
  patata: { carta: ['Patatas'] },
  'tortilla patatas': { carta: ['Tortilla de patatas'] },
  'lomo queso': { carta: ['Lomo y queso'] },
  'lomo pimiento': { carta: ['Lomo y pimiento'] },
  'bacon queso': { carta: ['Bacon y queso'] },
  zumos: { carta: ['Zumo'] },
};

/** Parecido de 0 a 1 por pares de letras (Dice). */
function parecido(a: string, b: string): number {
  if (a === b) return 1;
  const pares = (s: string) => {
    const t = s.replace(/ /g, '');
    const out = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const pa = pares(a);
  const pb = pares(b);
  let comun = 0;
  let total = 0;
  for (const [k, n] of pa) {
    comun += Math.min(n, pb.get(k) ?? 0);
    total += n;
  }
  for (const n of pb.values()) total += n;
  return total === 0 ? 0 : (2 * comun) / total;
}

export function proponerEmparejamientos(
  productosExcel: string[],
  carta: ProductoCarta[],
  guardados: Map<string, number[]>,
  /** Código del producto que trae el Excel para ese nombre (columna «Código»). */
  codigos: Map<string, number> = new Map()
): Propuesta[] {
  const existentes = new Set(carta.map((p) => p.id));
  const porNombre = new Map<string, ProductoCarta[]>();
  for (const p of carta) {
    const k = normalizarNombre(p.nombre);
    porNombre.set(k, [...(porNombre.get(k) ?? []), p]);
  }
  // Si hay dos con el mismo nombre, el que sale en la carta primero.
  const buscar = (nombre: string) => (porNombre.get(normalizarNombre(nombre)) ?? []).sort((a, b) => Number(b.activo) - Number(a.activo))[0];

  return productosExcel.map((excel) => {
    const codigo = codigos.get(excel);
    if (codigo !== undefined && existentes.has(codigo)) return { excel, productIds: [codigo], confianza: 'codigo' };
    const guardado = guardados.get(claveExcel(excel));
    if (guardado && guardado.every((id) => existentes.has(id))) return { excel, productIds: guardado, confianza: 'guardado' };

    const n = normalizarNombre(excel);
    const eq = EQUIVALENCIAS[n];
    if (eq) {
      if (eq.carta.length === 0) return { excel, productIds: [], confianza: 'dudoso', nota: eq.nota };
      const encontrado = eq.carta.map(buscar).find(Boolean);
      if (encontrado) return { excel, productIds: [encontrado.id], confianza: 'seguro' };
    }

    const exacto = buscar(excel);
    if (exacto) return { excel, productIds: [exacto.id], confianza: 'seguro' };

    let mejor: { p: ProductoCarta; s: number } | null = null;
    for (const p of carta) {
      const s = parecido(n, normalizarNombre(p.nombre));
      if (!mejor || s > mejor.s || (s === mejor.s && p.activo && !mejor.p.activo)) mejor = { p, s };
    }
    if (mejor && mejor.s >= 0.5) return { excel, productIds: [mejor.p.id], confianza: 'dudoso', nota: 'Parecido por el nombre: compruébalo' };
    return { excel, productIds: [], confianza: 'sin_pareja' };
  });
}
