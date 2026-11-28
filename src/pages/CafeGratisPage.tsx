import { useCallback, useEffect, useRef, useState } from 'react';
import { Instagram, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Skyline } from '@/components/Skyline';
import { focusRing } from '@/components/club/FormControls';
import { GoogleIcon } from '@/pages/ClubPage';
import { googleEnabled, signInWithGoogle } from '@/lib/auth';
import { CAFE_GRATIS_PROMO_ID, CAFE_GRATIS_VOLVER, marcarVueltaCafeGratis } from '@/lib/cafeGratis';
import { getHashParams, navigate } from '@/lib/router';
import { createTicket } from '@/lib/tickets';

const INSTAGRAM_URL = 'https://instagram.com/laalameda_bar';

type Aviso = { kind: 'info' | 'error'; text: string };

/** Mensajes del cartel para los códigos de error que ya devuelve create_ticket. */
function avisoDe(code: string | null, error: string | null): Aviso {
  if (code === 'LIMITE_USOS') return { kind: 'info', text: 'Ya disfrutaste tu café de bienvenida. ¡Gracias por volver!' };
  if (code === 'PROMO_FUERA_DE_HORARIO') {
    return { kind: 'info', text: 'El café es de 10 a 12 h. Ya tienes tu cuenta: vuelve mañana por la mañana.' };
  }
  if (code === 'PROMO_INACTIVA') return { kind: 'info', text: 'El café gratis no está disponible ahora mismo. Pregunta en la barra.' };
  return { kind: 'error', text: error ?? 'No hemos podido darte el ticket. Inténtalo de nuevo.' };
}

/**
 * "#/cafe-gratis": página del QR del cartel de la calle. Reutiliza el club (registro, Google) y los
 * tickets (create_ticket de la promo 'canjea' y Mis tickets): aquí no hay lógica propia.
 * - Sin sesión: «Obtener mi ticket» lleva a crear la cuenta y vuelve aquí con ?auto=1.
 * - Con sesión (o al volver con ?auto=1): obtiene el ticket y lleva a Mis tickets, con su QR.
 */
export function CafeGratisPage() {
  const { session, loading, configured } = useAuth();
  const [auto] = useState(() => getHashParams().get('auto') === '1');
  const [obteniendo, setObteniendo] = useState(false);
  const [conGoogle, setConGoogle] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const intentado = useRef(false);

  const obtener = useCallback(async () => {
    setObteniendo(true);
    setAviso(null);
    const result = await createTicket(CAFE_GRATIS_PROMO_ID);
    if (result.ticket) {
      navigate('/mis-tickets', { replace: true, params: { t: result.ticket.id } });
      return;
    }
    if (result.code === 'TICKET_YA_DISPONIBLE') {
      // Ya lo tiene: Mis tickets baja hasta el de esta promo.
      navigate('/mis-tickets', { replace: true, params: { promo: CAFE_GRATIS_PROMO_ID } });
      return;
    }
    setObteniendo(false);
    setAviso(avisoDe(result.code, result.error));
  }, []);

  // Vuelve de registrarse o de Google: el ticket se pide solo, una vez.
  useEffect(() => {
    if (!auto || loading || !session || intentado.current) return;
    intentado.current = true;
    // Sin ?auto=1 en la dirección, para que recargar no lo repita.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/cafe-gratis`);
    obtener();
  }, [auto, loading, session, obtener]);

  const handlePrincipal = () => {
    if (session) {
      obtener();
      return;
    }
    // Si confirma el email en este navegador, al volver le llevamos aquí a por el ticket.
    marcarVueltaCafeGratis();
    navigate('/club', { params: { volver: 'cafe-gratis' } });
  };

  const handleGoogle = async () => {
    setConGoogle(true);
    setAviso(null);
    const result = await signInWithGoogle(CAFE_GRATIS_VOLVER);
    // Si va bien, el navegador se va a Google; solo volvemos aquí si hay error.
    if (result.error) {
      setAviso({ kind: 'error', text: result.error });
      setConGoogle(false);
    }
  };

  const ocupado = loading || obteniendo || conGoogle;

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-carbon text-marfil">
      <main className="relative z-[1] mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-40 pt-12 text-center">
        <a
          href="#top"
          className={`rounded-r-sm font-display text-2xl font-semibold tracking-[0.18em] text-marfil ${focusRing}`}
          aria-label="La Alameda: ir a la web"
        >
          LA ALAMEDA
        </a>
        <div className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-piedra">Club · Salamanca</div>
        <div className="divider-gold my-6" />

        <h1 className="font-display text-[2.5rem] font-semibold leading-[1.05] text-marfil">
          <span aria-hidden="true">🎁 </span>Recibe tu café gratis
        </h1>
        <p className="mt-4 text-base leading-relaxed text-marfil/85">
          Regístrate en el club en 30 segundos y te damos tu ticket. Enséñaselo en barra.
        </p>

        {aviso && (
          <div
            role={aviso.kind === 'error' ? 'alert' : 'status'}
            className={`mt-6 w-full rounded-r-sm border px-4 py-3 text-sm leading-relaxed ${
              aviso.kind === 'error' ? 'border-red-300/60 bg-red-500/15 text-marfil' : 'border-piedra/60 bg-piedra/15 text-marfil'
            }`}
          >
            {aviso.text}
          </div>
        )}

        <div className="mt-8 w-full space-y-3">
          <button
            type="button"
            onClick={handlePrincipal}
            disabled={ocupado || !configured}
            className={`flex min-h-[3.75rem] w-full items-center justify-center gap-2 rounded-r-sm bg-piedra px-5 text-lg font-bold text-carbon shadow-[0_6px_24px_rgba(194,160,108,0.35)] transition-all duration-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${focusRing}`}
          >
            {obteniendo || (loading && auto) ? (
              <>
                <Loader2 size={20} className="animate-spin" aria-hidden="true" /> Preparando tu ticket…
              </>
            ) : (
              'Obtener mi ticket'
            )}
          </button>

          {!session && googleEnabled && (
            <button
              type="button"
              onClick={handleGoogle}
              disabled={ocupado || !configured}
              className={`btn min-h-12 w-full bg-white text-base text-carbon hover:bg-marfil disabled:cursor-wait disabled:opacity-70 ${focusRing}`}
            >
              {conGoogle ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <GoogleIcon />} Entrar con Google
            </button>
          )}

          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-outline min-h-12 w-full text-base ${focusRing}`}
          >
            <Instagram size={18} aria-hidden="true" /> Síguenos en Instagram
          </a>
        </div>

        <p className="mt-6 text-sm font-semibold tracking-wide text-piedra">De 10 a 12 h · 1 por persona</p>
        {session && (
          <p className="mt-2 text-xs text-marfil/55">Has entrado como {session.user.email}</p>
        )}
      </main>

      <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 h-auto w-full opacity-60 drop-shadow-[0_-2px_14px_rgba(196,154,74,0.4)]" />
    </div>
  );
}
