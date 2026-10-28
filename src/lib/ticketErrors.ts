import type { PostgrestError } from '@supabase/supabase-js';

/** Códigos que devuelven las funciones de supabase/tickets.sql, traducidos para el socio y el camarero. */
const messages: Record<string, string> = {
  NO_AUTENTICADO: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  NO_ES_ADMIN: 'Esta acción es solo para administradores.',
  NO_ES_CAMARERO: 'Solo el personal del bar puede canjear tickets.',
  PROMO_NO_EXISTE: 'Esta promo ya no existe.',
  PROMO_NO_CLUB: 'Esta promo no necesita ticket: pídela directamente en la barra.',
  PROMO_INACTIVA: 'Esta promo no está activa ahora mismo.',
  PROMO_FUERA_DE_HORARIO: 'Esta promo no está disponible a esta hora. Mira su horario en la tarjeta.',
  LIMITE_USOS: 'Ya has disfrutado esta promo todas las veces permitidas. ¡Te esperamos la próxima!',
  TICKET_YA_DISPONIBLE: 'Ya tienes un ticket de esta promo listo para usar.',
  TICKET_NO_EXISTE: 'No encontramos ningún ticket con ese código.',
  TICKET_YA_CANJEADO: 'Este ticket ya se ha canjeado.',
  TICKET_CADUCADO: 'Este ticket ha caducado.',
  TICKET_ANULADO: 'Este ticket está anulado.',
  TICKET_PROPIO: 'No puedes canjear un ticket tuyo.',
  TICKET_NO_VALIDO: 'Este ticket no es válido.',
  TICKET_NO_DISPONIBLE: 'Este ticket ya no está disponible.',
  TICKET_NO_CANJEADO: 'Este ticket no está canjeado.',
  MOTIVO_OBLIGATORIO: 'Indica un motivo.',
  IMPORTE_INVALIDO: 'El importe no es válido.',
  USUARIO_NO_EXISTE: 'Ese usuario no existe.',
  // POS (pos.sql)
  SOLICITUD_INVALIDA: 'No se ha podido enviar la venta. Inténtalo de nuevo.',
  METODO_INVALIDO: 'Elige cómo ha pagado: efectivo, tarjeta u otro.',
  VENTA_VACIA: 'Añade al menos un producto.',
  CANTIDAD_INVALIDA: 'Hay una cantidad no válida (de 1 a 99 por producto).',
  PRODUCTO_NO_EXISTE: 'Un producto ya no está en la carta. Recarga la página',
  PRODUCTO_AGOTADO: 'Hay un producto agotado',
  PRODUCTO_SIN_PRECIO: 'Un producto no tiene precio en la carta',
  VENTA_INMUTABLE: 'Las ventas cobradas no se pueden modificar.',
};

const fallback = 'Algo ha salido mal. Inténtalo de nuevo en unos minutos.';

/** Extrae el código estable (p. ej. "LIMITE_USOS") de un error de Supabase. */
export function ticketErrorCode(error: PostgrestError | null): string | null {
  const code = error?.message?.trim();
  return code && code in messages ? code : null;
}

export function translateTicketCode(code: string | null | undefined): string {
  return (code && messages[code]) || fallback;
}

export function translateTicketError(error: PostgrestError): string {
  console.error('[club] Error de tickets:', error);
  const code = ticketErrorCode(error);
  let text = code ? messages[code] : fallback;
  // Algunos errores traen el nombre del producto (p. ej. PRODUCTO_AGOTADO → "Patatas").
  if (code && error.details) text = `${text.replace(/.$/, '')}: ${error.details}.`;
  else if (code && !text.endsWith('.')) text += '.';
  if (!code && /fetch|network/i.test(error.message)) {
    text = 'No hemos podido conectar. Revisa tu conexión a internet.';
  }
  if (import.meta.env.DEV && !code) {
    text += ` [${error.code ?? '-'} · ${error.message}]`;
  }
  return text;
}
