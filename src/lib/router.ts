import { useEffect, useState } from 'react';

/**
 * Router mínimo basado en el hash, compatible con GitHub Pages (recargar nunca da 404).
 * - "#/club", "#/perfil"…  → páginas (empiezan por "#/").
 * - "#carta", "#promos"…   → anclas de la home, como hasta ahora.
 * - "#qr"                  → página de códigos QR (se mantiene la URL antigua).
 */
export type RoutePath = '/' | '/qr' | '/club' | '/recuperar' | '/nueva-contrasena' | '/privacidad' | '/perfil';

const routes: RoutePath[] = ['/qr', '/club', '/recuperar', '/nueva-contrasena', '/privacidad', '/perfil'];

export interface Route {
  path: RoutePath;
  /** id de la sección de la home a la que apunta el hash (p. ej. "carta"), si no es una página. */
  anchor: string | null;
}

export function parseHash(hash: string): Route {
  const value = hash.replace(/^#/, '');

  if (value === 'qr' || value === 'qr/') return { path: '/qr', anchor: null };

  if (value.startsWith('/')) {
    const path = value.split(/[?#]/)[0].replace(/\/+$/, '') as RoutePath;
    return { path: routes.includes(path) ? path : '/', anchor: null };
  }

  // Los callbacks de Supabase (#access_token=…, #error=…) no son anclas.
  const isAnchor = value !== '' && !value.includes('=');
  return { path: '/', anchor: isAnchor ? value : null };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

export function routeHref(path: RoutePath): string {
  return path === '/' ? '#top' : `#${path}`;
}

export function navigate(path: RoutePath, { replace = false } = {}) {
  const href = routeHref(path);
  if (replace) {
    window.location.replace(href);
  } else {
    window.location.hash = href;
  }
}
