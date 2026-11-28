import { storageKey } from '@/lib/entorno';

/**
 * Cartel «Café gratis» (QR impreso en la calle → "#/cafe-gratis").
 * La promo es una promo normal del club (`promotions`, id 'canjea'); aquí solo están el id y la vuelta
 * a la página después de registrarse, para no repetir lógica del club ni de los tickets.
 */
export const CAFE_GRATIS_PROMO_ID = 'canjea';

/** A dónde vuelve quien se registra o entra desde el cartel: obtiene el ticket solo al llegar. */
export const CAFE_GRATIS_VOLVER = '#/cafe-gratis?auto=1';

/**
 * Marca en el navegador para volver al café después de confirmar el email (el enlace del correo
 * llega sin saber de dónde venía). Caduca a las 24 h. Si el correo se abre en otro navegador,
 * la marca no está y se va al perfil, como siempre.
 */
const MARCA = storageKey('alameda-cafe-gratis');
const VALIDEZ_MS = 24 * 60 * 60 * 1000;

export function marcarVueltaCafeGratis(): void {
  try {
    window.localStorage.setItem(MARCA, String(Date.now()));
  } catch {
    // Sin almacenamiento (modo privado): el flujo sigue funcionando, solo que vuelve al perfil.
  }
}

/** true si el alta empezó en el cartel (y borra la marca). */
export function consumirVueltaCafeGratis(): boolean {
  try {
    const valor = Number(window.localStorage.getItem(MARCA));
    window.localStorage.removeItem(MARCA);
    return Number.isFinite(valor) && valor > 0 && Date.now() - valor < VALIDEZ_MS;
  } catch {
    return false;
  }
}
