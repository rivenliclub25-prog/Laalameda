/**
 * Reglas de los entornos (ENTORNOS.md, sección 5). Sin dependencias, para usarlas igual en la web
 * (src/lib/entorno.ts) y al arrancar o construir (vite.config.ts).
 */

export type Entorno = 'local' | 'pruebas' | 'produccion';

export const ENTORNOS: Entorno[] = ['local', 'pruebas', 'produccion'];

/** Identificador del Supabase de PRODUCCIÓN (es público: va en la URL de la web publicada). */
export const PROYECTO_PRODUCCION = 'hinebaxynlpjisteuaus';

/** Sin VITE_APP_ENV, la web se comporta como local: un despiste nunca acaba en producción (E2). */
export function leerEntorno(valor: string | undefined): Entorno {
  const v = valor?.trim().toLowerCase();
  return ENTORNOS.includes(v as Entorno) ? (v as Entorno) : 'local';
}

/**
 * Explica por qué la combinación de entorno y base de datos no se permite, o null si es correcta.
 * - Fuera de producción, nunca la base de datos de producción.
 * - En producción, solo la de producción.
 */
export function problemaDeEntorno(valorEntorno: string | undefined, supabaseUrl: string | undefined): string | null {
  const valor = valorEntorno?.trim();
  if (valor && !ENTORNOS.includes(valor.toLowerCase() as Entorno)) {
    return `VITE_APP_ENV="${valor}" no es válido. Usa local, pruebas o produccion.`;
  }
  const entorno = leerEntorno(valor);
  const esLaDeProduccion = (supabaseUrl ?? '').includes(PROYECTO_PRODUCCION);
  if (entorno !== 'produccion' && esLaDeProduccion) {
    return (
      `La web está en el entorno "${entorno}" pero VITE_SUPABASE_URL es la base de datos de PRODUCCIÓN ` +
      `(${PROYECTO_PRODUCCION}). Fuera de producción solo se usa PRUEBAS: cambia el .env (ver .env.example).`
    );
  }
  if (entorno === 'produccion' && !esLaDeProduccion) {
    return `VITE_APP_ENV=produccion necesita la base de datos de PRODUCCIÓN (${PROYECTO_PRODUCCION}) en VITE_SUPABASE_URL.`;
  }
  return null;
}
