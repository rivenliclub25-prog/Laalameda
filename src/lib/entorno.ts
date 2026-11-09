import { leerEntorno, type Entorno } from '@/lib/entornoReglas';

/** Entorno de esta web: local (npm run dev), pruebas (web de pruebas) o produccion (la web real). */
export const entorno: Entorno = leerEntorno(import.meta.env.VITE_APP_ENV);

export const esProduccion = entorno === 'produccion';

/**
 * Nombre de una clave de localStorage/sessionStorage para este entorno. La web real y la de pruebas
 * están en el mismo dominio y compartirían lo guardado: fuera de producción, la clave lleva el entorno
 * delante ("alameda-pruebas-catalogo-v1"). En producción se mantiene el nombre de siempre, para no
 * perder lo que ya guardaron los navegadores de los clientes.
 */
export function storageKey(nombre: string): string {
  return esProduccion ? nombre : nombre.replace(/^alameda-/, `alameda-${entorno}-`);
}
