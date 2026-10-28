import { useEffect, useState, type FormEvent } from 'react';
import { CalendarHeart, Cake, Gift, MailCheck } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { Checkbox, ClubCard, Notice, SubmitButton, TextField, focusRing } from '@/components/club/FormControls';
import { useAuth, useAuthNotice } from '@/auth/AuthContext';
import { googleEnabled, signIn, signInWithGoogle, signUp } from '@/lib/auth';
import { getHashParams, navigate, routeHref } from '@/lib/router';
import { findPromotion, useCatalog } from '@/lib/catalog';
import { parseScannedCode } from '@/lib/tickets';
import { MIN_PASSWORD_LENGTH, validateEmail, validateNewPassword, validatePasswordConfirm } from '@/lib/validation';

type Mode = 'registro' | 'login';

const perks = [
  { icon: Gift, text: 'Ofertas y promos exclusivas para socios' },
  { icon: CalendarHeart, text: 'Te avisamos antes que a nadie de eventos y tardeos' },
  { icon: Cake, text: 'Una sorpresa por tu cumpleaños' },
];

export function ClubPage() {
  const { session, configured } = useAuth();
  const [notice, dismissNotice] = useAuthNotice();
  // "#/club?modo=login&promo=<id>": viene del botón "Obtener ticket" de una promo.
  // "#/club?modo=login&volver=canjear&c=<código>": un camarero que escaneó un QR sin haber iniciado sesión.
  const [{ initialMode, promoId, volverCanjear, codigo }] = useState(() => {
    const params = getHashParams();
    return {
      initialMode: (params.get('modo') === 'login' ? 'login' : 'registro') as Mode,
      // Solo ids válidos (letras, números y guiones), para usarlos en la URL de vuelta.
      promoId: /^[a-z0-9-]+$/.test(params.get('promo') ?? '') ? params.get('promo') : null,
      volverCanjear: params.get('volver') === 'canjear',
      codigo: parseScannedCode(params.get('c') ?? ''),
    };
  });
  const { catalog } = useCatalog();
  const promo = findPromotion(catalog, promoId);
  const [mode, setMode] = useState<Mode>(initialMode);

  // Con sesión iniciada no tiene sentido esta página: vuelve a donde estaba o va al perfil.
  useEffect(() => {
    if (!session) return;
    if (volverCanjear) navigate('/canjear', { replace: true, params: codigo ? { c: codigo } : undefined });
    else if (promoId) window.location.replace(`#promo-${promoId}`);
    else navigate('/perfil', { replace: true });
  }, [session, promoId, volverCanjear, codigo]);

  const changeMode = (next: Mode) => {
    setMode(next);
    dismissNotice();
  };

  return (
    <PageShell>
      <div className="mx-auto grid max-w-container gap-sp-lg lg:grid-cols-[1fr_440px] lg:items-center lg:gap-sp-xl">
        <section className="animate-fade-up text-center lg:text-left" style={{ opacity: 0 }}>
          <div className="eyebrow text-vino">Club La Alameda</div>
          <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[1.05] text-vino sm:text-[3rem]">
            Pertenecer al club
          </h1>
          <div className="divider-gold my-5 lg:ml-0" />
          <p className="mx-auto max-w-[480px] leading-relaxed text-carbon/80 lg:mx-0">
            Únete al club de La Alameda y sé el primero en enterarte de nuestras mejores ofertas, tardeos y
            novedades. Es gratis, se tarda un minuto y nos encantará verte más a menudo por aquí.
          </p>
          <ul className="mx-auto mt-6 hidden max-w-[420px] space-y-3 text-left sm:block lg:mx-0">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-carbon/85">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vino text-marfil">
                  <Icon size={17} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>

        <ClubCard className="w-full">
          <div role="tablist" aria-label="Acceso al club" className="mb-6 grid grid-cols-2 rounded-r-sm bg-piedra-suave p-1">
            {(['registro', 'login'] as const).map((tab) => (
              <button
                key={tab}
                id={`tab-${tab}`}
                role="tab"
                type="button"
                aria-selected={mode === tab}
                aria-controls={`panel-${tab}`}
                onClick={() => changeMode(tab)}
                className={`rounded-r-sm px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${focusRing} ${
                  mode === tab ? 'bg-vino text-white shadow-sm' : 'text-carbon/70 hover:text-vino'
                }`}
              >
                {tab === 'registro' ? 'Crear cuenta' : 'Iniciar sesión'}
              </button>
            ))}
          </div>

          {!configured && (
            <div className="mb-5">
              <Notice kind="info">El club estará disponible muy pronto. ¡Vuelve en unos días!</Notice>
            </div>
          )}

          {notice && (
            <div className="mb-5">
              <Notice kind={notice.kind}>{notice.text}</Notice>
            </div>
          )}

          {volverCanjear && !notice && (
            <div className="mb-5">
              <Notice kind="info">
                Inicia sesión con tu cuenta del personal del bar para canjear
                {codigo ? (
                  <>
                    {' '}el ticket <strong>{codigo}</strong>
                  </>
                ) : (
                  ' tickets'
                )}
                .
              </Notice>
            </div>
          )}

          {promoId && !notice && (
            <div className="mb-5">
              <Notice kind="info">
                Para activar {promo ? <strong>{promo.title}</strong> : 'esta promo'}, inicia sesión con tu cuenta del club.{' '}
                {mode === 'login' ? (
                  <>
                    ¿Aún no eres socio?{' '}
                    <button
                      type="button"
                      onClick={() => changeMode('registro')}
                      className={`rounded-r-sm font-semibold text-vino underline ${focusRing}`}
                    >
                      Únete gratis
                    </button>
                    .
                  </>
                ) : (
                  'Si aún no eres socio, crea tu cuenta gratis aquí abajo.'
                )}
              </Notice>
            </div>
          )}

          <div id={`panel-${mode}`} role="tabpanel" aria-labelledby={`tab-${mode}`}>
            {mode === 'registro' ? (
              <RegisterForm disabled={!configured} onGoToLogin={() => changeMode('login')} />
            ) : (
              <LoginForm disabled={!configured} />
            )}
          </div>

          <GoogleButton disabled={!configured} />
        </ClubCard>
      </div>
    </PageShell>
  );
}

interface RegisterErrors {
  nombre?: string;
  email?: string;
  password?: string;
  confirm?: string;
  privacidad?: string;
}

function RegisterForm({ disabled, onGoToLogin }: { disabled: boolean; onGoToLogin: () => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [aceptaEmail, setAceptaEmail] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: RegisterErrors = {
      nombre: nombre.trim().length < 2 ? 'Dinos cómo te llamas.' : undefined,
      email: validateEmail(email),
      password: validateNewPassword(password),
      confirm: validatePasswordConfirm(password, confirm),
      privacidad: aceptaPrivacidad ? undefined : 'Para unirte necesitamos que aceptes la política de privacidad.',
    };
    setErrors(nextErrors);
    setFormError(null);
    if (Object.values(nextErrors).some(Boolean)) return;

    setLoading(true);
    const result = await signUp({ nombre, email, password, aceptaEmail });
    setLoading(false);

    if (result.error) {
      setFormError(result.error);
    } else if (result.needsConfirmation) {
      setSentTo(email.trim());
    }
    // Si no hace falta confirmar, se inicia sesión y ClubPage redirige al perfil.
  };

  if (sentTo) {
    return (
      <div className="animate-fade-in py-2 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-vino text-marfil">
          <MailCheck size={26} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-semibold text-vino">Revisa tu correo</h2>
        <p className="mt-2 text-sm leading-relaxed text-carbon/80" role="status">
          Te hemos enviado un enlace a <strong className="break-all">{sentTo}</strong> para confirmar la cuenta. Si no
          lo ves en unos minutos, mira en la carpeta de spam.
        </p>
        <button type="button" onClick={onGoToLogin} className={`btn-outline-vino mt-6 ${focusRing}`}>
          Ya lo he confirmado: iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <TextField
        label="Nombre"
        autoComplete="given-name"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errors.nombre}
        disabled={disabled}
        required
      />
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        disabled={disabled}
        required
      />
      <TextField
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
        disabled={disabled}
        required
      />
      <TextField
        label="Repite la contraseña"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        disabled={disabled}
        required
      />

      <div className="space-y-3 pt-1">
        <Checkbox
          checked={aceptaPrivacidad}
          onChange={setAceptaPrivacidad}
          error={errors.privacidad}
          disabled={disabled}
          required
        >
          He leído y acepto la{' '}
          <a href={routeHref('/privacidad')} target="_blank" rel="noopener" className="font-semibold text-vino underline">
            política de privacidad
          </a>
          . <span className="text-carbon/55">(obligatorio)</span>
        </Checkbox>
        <Checkbox checked={aceptaEmail} onChange={setAceptaEmail} disabled={disabled}>
          Quiero recibir por email ofertas, eventos y novedades de La Alameda.{' '}
          <span className="text-carbon/55">(opcional, puedes darte de baja cuando quieras)</span>
        </Checkbox>
      </div>

      {formError && <Notice kind="error">{formError}</Notice>}

      <SubmitButton loading={loading} loadingText="Creando cuenta…" disabled={disabled}>
        Unirme al club
      </SubmitButton>
    </form>
  );
}

function LoginForm({ disabled }: { disabled: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = {
      email: validateEmail(email),
      password: password ? undefined : 'Escribe tu contraseña.',
    };
    setErrors(nextErrors);
    setFormError(null);
    if (nextErrors.email || nextErrors.password) return;

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    // Si va bien, ClubPage detecta la sesión y redirige al perfil.
    if (error) setFormError(error);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        disabled={disabled}
        required
      />
      <div>
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          disabled={disabled}
          required
        />
        <div className="mt-2 text-right">
          <a href={routeHref('/recuperar')} className={`rounded-r-sm text-xs font-semibold text-vino hover:underline ${focusRing}`}>
            ¿Has olvidado tu contraseña?
          </a>
        </div>
      </div>

      {formError && <Notice kind="error">{formError}</Notice>}

      <SubmitButton loading={loading} loadingText="Entrando…" disabled={disabled}>
        Iniciar sesión
      </SubmitButton>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function GoogleButton({ disabled }: { disabled: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = googleEnabled && !disabled;

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const result = await signInWithGoogle();
    // Si va bien, el navegador se va a Google; solo volvemos aquí si hay error.
    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs text-carbon/50" aria-hidden="true">
        <span className="h-px flex-1 bg-carbon/15" /> o <span className="h-px flex-1 bg-carbon/15" />
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={!available || loading}
        aria-disabled={!available}
        className={`btn w-full border border-carbon/20 bg-white py-3 text-carbon hover:bg-carbon/5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white ${focusRing}`}
      >
        <GoogleIcon /> Continuar con Google
        {!googleEnabled && <span className="recommend-badge ml-1">Próximamente</span>}
      </button>
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}
