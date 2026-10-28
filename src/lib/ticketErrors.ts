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
  // POS: mesas (pos-mesas.sql)
  MESA_NO_EXISTE: 'Esa mesa no existe.',
  MESA_INACTIVA: 'Esa mesa está desactivada.',
  MESA_OCUPADA: 'Esa mesa ya tiene una cuenta abierta.',
  CUENTA_NO_EXISTE: 'Esa cuenta no existe.',
  CUENTA_CERRADA: 'Esa cuenta ya está cerrada (cobrada o cancelada). Actualiza la pantalla.',
  CUENTA_VACIA: 'La cuenta no tiene nada que cobrar.',
  CUENTA_CON_SERVIDAS: 'Hay consumiciones servidas: anúlalas con su motivo o cobra la cuenta.',
  PEDIDOS_PENDIENTES: 'Hay pedidos pendientes de aceptar.',
  LINEA_NO_EXISTE: 'Esa línea ya no existe.',
  LINEA_YA_ANULADA: 'Esa línea ya estaba anulada.',
  NOTAS_DEMASIADO_LARGAS: 'La nota es demasiado larga (máximo 200 caracteres).',
  VENTA_NO_EXISTE: 'Esa venta no existe.',
  IMPORTE_SUPERA_VENTA: 'No se puede devolver más de lo que queda por devolver.',
  // Pedido desde la mesa (pos-pedidos.sql)
  RONDAS_PENDIENTES_MAX: 'Ya tienes 2 rondas esperando al camarero. Cuando las acepte, podrás pedir más.',
  RONDA_DEMASIADO_GRANDE: 'Una ronda puede tener como máximo 20 unidades. Divide el pedido en dos.',
  // Promos y tickets en las ventas (pos-promos.sql)
  PROMO_SIN_PRECIO: 'Esta promo no tiene precio: ponle uno en Panel → Promos antes de venderla.',
  PROMO_CLUB_DE_UNA_EN_UNA: 'Las promos del club van de una en una: cada una lleva su ticket.',
  TICKET_OBLIGATORIO: 'Esta promo es del club: escanea o escribe el ticket del socio.',
  TICKET_OTRA_PROMO: 'Este ticket es de otra promo',
  TICKET_EN_PEDIDO: 'Este ticket está en un pedido pendiente desde la mesa. Acepta o rechaza esa ronda.',
  // Cierre de jornada e informes (pos-informes.sql)
  MESAS_ABIERTAS: 'Hay mesas con la cuenta abierta (cóbralas o cancélalas antes de cerrar)',
  JORNADA_INVALIDA: 'Esa jornada no se puede cerrar todavía.',
  RANGO_INVALIDO: 'Revisa las fechas: «desde» debe ir antes que «hasta» (máximo 400 días).',
  CIERRE_INMUTABLE: 'Los cierres de jornada no se pueden modificar.',
  TICKET_EN_VENTA: 'Este ticket se usó en el TPV: anula su línea en la cuenta (vuelve solo a disponible) o, si ya se cobró, haz una devolución.',
};

/** Errores donde el detalle es la promo o el ticket: se pone delante («Pack Partido»: …). */
const detailFirst = new Set([
  'PROMO_INACTIVA',
  'PROMO_FUERA_DE_HORARIO',
  'PROMO_SIN_PRECIO',
  'PROMO_CLUB_DE_UNA_EN_UNA',
  'LIMITE_USOS',
  'TICKET_OBLIGATORIO',
  'TICKET_YA_DISPONIBLE',
  'TICKET_NO_EXISTE',
  'TICKET_YA_CANJEADO',
  'TICKET_CADUCADO',
  'TICKET_ANULADO',
  'TICKET_PROPIO',
  'TICKET_NO_VALIDO',
  'TICKET_EN_PEDIDO',
]);

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
  // Algunos errores traen el nombre del producto (p. ej. PRODUCTO_AGOTADO → "Patatas"), de la promo o el ticket.
  if (code && error.details && detailFirst.has(code)) text = `«${error.details}»: ${text}`;
  else if (code && error.details) text = `${text.replace(/\.$/, '')}: ${error.details}.`;
  else if (code && !text.endsWith('.')) text += '.';
  if (!code && /fetch|network/i.test(error.message)) {
    text = 'No hemos podido conectar. Revisa tu conexión a internet.';
  }
  if (import.meta.env.DEV && !code) {
    text += ` [${error.code ?? '-'} · ${error.message}]`;
  }
  return text;
}
