import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { ClubCard, Notice, SubmitButton, TextField, focusRing } from '@/components/club/FormControls';
import { useAuth } from '@/auth/AuthContext';
import { updatePassword } from '@/lib/auth';
import { routeHref } from '@/lib/router';
import { MIN_PASSWORD_LENGTH, validateNewPassword, validatePasswordConfirm } from '@/lib/validation';

/** Página a la que llega el enlace de recuperación del correo (ya con una sesión temporal). */
export function NuevaContrasenaPage() {
  const { session, loading: sessionLoading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = {
      password: validateNewPassword(password),
      confirm: validatePasswordConfirm(password, confirm),
    };
    setErrors(nextErrors);
    setFormError(null);
    if (nextErrors.password || nextErrors.confirm) return;

    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (result.error) setFormError(result.error);
    else setDone(true);
  };

  let content;
  if (sessionLoading) {
    content = (
      <div className="flex justify-center py-6" role="status">
        <Loader2 size={28} className="animate-spin text-vino" aria-hidden="true" />
        <span className="sr-only">Comprobando el enlace…</span>
      </div>
    );
  } else if (done) {
    content = (
      <div className="animate-fade-in text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-vino text-marfil">
          <CheckCircle2 size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold text-vino">Contraseña cambiada</h1>
        <p className="mt-2 text-sm text-carbon/80" role="status">
          Listo. A partir de ahora entra con tu nueva contraseña.
        </p>
        <a href={routeHref('/perfil')} className={`btn-vino mt-6 ${focusRing}`}>
          Ir a mi perfil
        </a>
      </div>
    );
  } else if (!session) {
    content = (
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold text-vino">Enlace no válido</h1>
        <p className="mt-2 text-sm leading-relaxed text-carbon/80">
          El enlace ha caducado o ya se ha usado. Pide uno nuevo y ábrelo en cuanto te llegue.
        </p>
        <a href={routeHref('/recuperar')} className={`btn-vino mt-6 ${focusRing}`}>
          Pedir un enlace nuevo
        </a>
      </div>
    );
  } else {
    content = (
      <>
        <h1 className="font-display text-[1.9rem] font-semibold leading-tight text-vino">Elige una contraseña nueva</h1>
        <div className="divider-gold mb-6 ml-0 mt-3" />
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
            required
          />
          <TextField
            label="Repite la contraseña"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
            required
          />
          {formError && <Notice kind="error">{formError}</Notice>}
          <SubmitButton loading={loading} loadingText="Guardando…">
            Guardar contraseña
          </SubmitButton>
        </form>
      </>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[440px]">
        <ClubCard>{content}</ClubCard>
      </div>
    </PageShell>
  );
}
