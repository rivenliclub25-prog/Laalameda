import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { leerEntorno, problemaDeEntorno } from './src/lib/entornoReglas';

/**
 * Entornos (ENTORNOS.md, E2): no se arranca ni se construye la web si el entorno y la base de datos
 * no casan (p. ej. en local con la de PRODUCCIÓN). Fuera de producción, además, la página lleva
 * «noindex» (Google no la muestra) y el entorno delante del título.
 */
function entornos(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  const entorno = leerEntorno(env.VITE_APP_ENV);
  return {
    name: 'la-alameda-entornos',
    config() {
      const problema = problemaDeEntorno(env.VITE_APP_ENV, env.VITE_SUPABASE_URL);
      if (problema) throw new Error(`\n\n  🔒 ${problema}\n`);
    },
    transformIndexHtml(html) {
      if (entorno === 'produccion') return html;
      const etiqueta = entorno === 'pruebas' ? 'PRUEBAS' : 'LOCAL';
      return html
        .replace('<title>', `<title>[${etiqueta}] `)
        .replace('</head>', '    <meta name="robots" content="noindex, nofollow" />\n  </head>');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [entornos(mode), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}));
