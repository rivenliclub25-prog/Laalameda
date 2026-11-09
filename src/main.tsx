import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/auth/AuthProvider';
import { BloqueoEntorno, FranjaEntorno } from '@/components/Entorno';
import { bloqueoEntorno } from '@/lib/supabase';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {bloqueoEntorno ? (
      // Entorno y base de datos no casan (p. ej. en local con la de PRODUCCIÓN): no se arranca nada.
      <BloqueoEntorno mensaje={bloqueoEntorno} />
    ) : (
      <>
        <FranjaEntorno />
        <AuthProvider>
          <App />
        </AuthProvider>
      </>
    )}
  </StrictMode>
);
