import { useState, type FormEvent } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { ClubCard, Notice, SubmitButton, TextField, focusRing } from '@/components/club/FormControls';
import { useAuth } from '@/auth/AuthContext';
import { sendPasswordReset } from '@/lib/auth';
import { routeHref } from '@/lib/router';
import { validateEmail } from '@/lib/validation';

export function RecuperarPage() {
  const { configured } = useAuth();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const error = validateEmail(email);
    setEmailError(error);
    setFormError(null);
    if (error) return;

    setLoading(true);
    const result = await sendPasswordReset(email);
    setLoading(false);
    if (result.error) setFormError(result.error);
    else setSent(true);
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-[440px]">
        <a
          href={routeHref('/club')}
          className={`mb-6 inline-flex items-center gap-2 rounded-r-sm text-sm font-medium text-carbon/70 transition-colors hover:text-vino ${focusRing}`}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Volver a iniciar sesión
        </a>

        <ClubCard>
          {sent ? (
            <div className="animate-fade-in text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-vino text-marfil">
                <MailCheck size={26} aria-hidden="true" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-semibold text-vino">Revisa tu correo</h1>
              <p className="mt-2 text-sm leading-relaxed text-carbon/80" role="status">
                Si hay una cuenta con <strong className="break-all">{email.trim()}</strong>, te llegará un enlace para
                elegir una contraseña nueva. Mira también en la carpeta de spam.
              </p>
            </div>
          ) : (
            <>
              <h1 className="font-display text-[1.9rem] font-semibold leading-tight text-vino">
                ¿Has olvidado tu contraseña?
              </h1>
              <div className="divider-gold mb-4 ml-0 mt-3" />
              <p className="mb-6 text-sm leading-relaxed text-carbon/80">
                No pasa nada. Escribe el email con el que te registraste y te enviaremos un enlace para crear una nueva.
              </p>

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {!configured && <Notice kind="info">El club estará disponible muy pronto.</Notice>}
                <TextField
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={emailError}
                  disabled={!configured}
                  required
                />
                {formError && <Notice kind="error">{formError}</Notice>}
                <SubmitButton loading={loading} loadingText="Enviando…" disabled={!configured}>
                  Enviar enlace
                </SubmitButton>
              </form>
            </>
          )}
        </ClubCard>
      </div>
    </PageShell>
  );
}
