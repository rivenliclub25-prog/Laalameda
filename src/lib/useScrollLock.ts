import { useEffect } from 'react';

/**
 * Bloquea el desplazamiento del fondo mientras hay un menú o una ventana abierta.
 *
 * Se fija el <body> en su posición (la única técnica que funciona también en iPhone) y al cerrar se
 * vuelve exactamente al mismo sitio. Si mientras estaba abierto se pulsó un enlace a una sección
 * (p. ej. "#carta" en el menú móvil), al cerrar se va a esa sección en lugar de volver atrás.
 * Admite ventanas una encima de otra: el fondo se libera cuando se cierra la última.
 */
let locks = 0;
let savedScrollY = 0;
let savedHash = '';
let savedStyles: Partial<Record<'position' | 'top' | 'left' | 'right' | 'width' | 'overflow' | 'paddingRight', string>> = {};

function lock() {
  locks += 1;
  if (locks > 1) return;
  const body = document.body.style;
  savedScrollY = window.scrollY;
  savedHash = window.location.hash;
  savedStyles = {
    position: body.position,
    top: body.top,
    left: body.left,
    right: body.right,
    width: body.width,
    overflow: body.overflow,
    paddingRight: body.paddingRight,
  };
  // En escritorio, compensa la barra de desplazamiento para que la página no "salte" al ocultarse.
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  body.position = 'fixed';
  body.top = `-${savedScrollY}px`;
  body.left = '0';
  body.right = '0';
  body.width = '100%';
  body.overflow = 'hidden';
  if (scrollbar > 0) body.paddingRight = `${scrollbar}px`;
}

function unlock() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  Object.assign(document.body.style, savedStyles);

  const hash = window.location.hash;
  if (hash === savedHash) {
    // Sin cambios de página: vuelve al mismo punto, sin animación.
    window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    return;
  }
  // Se pulsó un enlace a una sección de esta página: se va a ella.
  const anchor = hash.startsWith('#') && !hash.startsWith('#/') ? document.getElementById(hash.slice(1)) : null;
  anchor?.scrollIntoView();
  // Si fue un cambio de página (#/…), la propia web ya la abre desde arriba.
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
