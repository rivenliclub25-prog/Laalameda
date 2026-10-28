import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogIn, QrCode } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { ClubCard, Notice, focusRing } from '@/components/club/FormControls';
import { useAuth } from '@/auth/AuthContext';
import { navigate, routeHref } from '@/lib/router';
import { loadMesaElegida, mesasParaPedir, saveMesaElegida } from '@/lib/mesaPedido';

/**
 * "#/pedir": el socio que está en el bar elige su mesa (sin escanear el QR) y pasa a pedir. Las
 * rondas pedidas así llegan al TPV marcadas como «mesa elegida a mano» para que el camarero lo compruebe.
 */
export function PedirPage() {
  const { session, loading: authLoading } = useAuth();
  const [mesas, setMesas] = useState<{ id: string; nombre: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ultima] = useState(loadMesaElegida);

  const load = useCallback(async () => {
    setError(null);
    setMesas(null);
    const { mesas: rows, error: err } = await mesasParaPedir();
    if (err) setError(err);
    else setMesas(rows);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const elegir = (id: string) => {
    saveMesaElegida(id);
    navigate('/mesa', { params: { n: id } });
  };

  const seguir = mesas?.find((m) => m.id === ultima) ?? null;

  return (
    <PageShell>
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="eyebrow text-vino">Pedir desde tu mesa</div>
          <h1 className="mt-2 font-display text-[2.2rem] font-semibold leading-tight text-vino">¿En qué mesa estás?</h1>
          <p className="mt-2 text-carbon/75">Pide desde el móvil y el camarero te lo trae. Se paga al camarero al final.</p>
        </div>

        <div className="mt-6">
          <ClubCard>
            {authLoading ? (
              <p className="flex items-center justify-center gap-2 py-6 text-carbon/70" role="status">
                <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Cargando…
              </p>
            ) : !session ? (
              <div className="py-2 text-center">
                <p className="text-carbon/85">Para pedir desde el móvil tienes que ser socio del club.</p>
                <a
                  href={routeHref('/club', { modo: 'login', volver: 'pedir' })}
                  className={`btn-vino mt-4 inline-flex items-center gap-2 ${focusRing}`}
                >
                  <LogIn size={18} aria-hidden="true" /> Iniciar sesión o hacerme socio
                </a>
              </div>
            ) : error ? (
              <div className="space-y-4">
                <Notice kind="error">{error}</Notice>
                <button type="button" onClick={load} className={`btn-outline-vino w-full ${focusRing}`}>
                  Reintentar
                </button>
              </div>
            ) : !mesas ? (
              <p className="flex items-center justify-center gap-2 py-6 text-carbon/70" role="status">
                <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Buscando las mesas…
              </p>
            ) : mesas.length === 0 ? (
              <p className="py-4 text-center text-carbon/75">Ahora mismo no se puede pedir desde el móvil. Pide en la barra.</p>
            ) : (
              <>
                {seguir && (
                  <button
                    type="button"
                    onClick={() => elegir(seguir.id)}
                    className={`btn-vino mb-4 min-h-14 w-full text-base ${focusRing}`}
                  >
                    Seguir en {seguir.nombre}
                  </button>
                )}
                <p className="mb-3 text-sm text-carbon/70">Elige el número que tiene tu mesa:</p>
                <ul className="grid grid-cols-2 gap-3">
                  {mesas.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => elegir(m.id)}
                        className={`flex min-h-20 w-full items-center justify-center rounded-r-md border-2 px-3 text-center font-display text-2xl font-semibold transition-all active:scale-[0.98] ${focusRing} ${
                          m.id === ultima ? 'border-vino bg-vino/5 text-vino' : 'border-piedra/60 bg-white text-carbon hover:border-vino'
                        }`}
                      >
                        {m.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-carbon/60">
                  El camarero confirmará cada ronda antes de prepararla. Elige bien tu mesa para que te la traiga.
                </p>
              </>
            )}
          </ClubCard>
        </div>

        <p className="mt-5 flex items-start justify-center gap-2 text-center text-sm text-carbon/65">
          <QrCode size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          ¿Tu mesa tiene QR? Escanéalo con la cámara del móvil y entrarás directamente.
        </p>
      </div>
    </PageShell>
  );
}
