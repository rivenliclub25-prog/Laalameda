import { useState, type FormEvent } from 'react';
import { PageShell } from '@/components/club/PageShell';
import { Checkbox, ClubCard, Notice, SubmitButton, focusRing } from '@/components/club/FormControls';
import { useAuth } from '@/auth/AuthContext';
import { aceptarPrivacidad, deleteAccount } from '@/lib/auth';
import { navigate, routeHref } from '@/lib/router';

/**
 * «Un último paso» para quien se registra con Google: no ha pasado por el formulario, así que acepta
 * aquí la política de privacidad (obligatorio) y elige si quiere recibir ofertas por email. Si no la
 * acepta, puede borrar la cuenta que se acaba de crear.
 */
export function UltimoPaso() {
  const { user, refreshPerfil, notify } = useAuth();
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [aceptaEmail, setAceptaEmail] = useState(false);
  const [privacidadError, setPrivacidadError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const meta = user?.user_metadata ?? {};
  const nombre = String(meta.full_name ?? meta.name ?? '').trim().split(' ')[0];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!aceptaPrivacidad) {
      setPrivacidadError('Para ser socio tienes que aceptar la política de privacidad.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await aceptarPrivacidad(aceptaEmail);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    notify({ kind: 'success', text: '¡Bienvenido al club de La Alameda!' });
    refreshPerfil();
  };

  const rechazar = async () => {
    if (!window.confirm('¿Seguro? Se borrará la cuenta que acabas de crear con Google.')) return;
    setBorrando(true);
    const result = await deleteAccount();
    setBorrando(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-md">
        <ClubCard>
          <div className="eyebrow text-vino">Club La Alameda</div>
          <h1 className="mt-2 font-display text-[2rem] font-semibold leading-tight text-vino">Un último paso</h1>
          <p className="mt-2 text-carbon/75">
            {nombre ? `Hola, ${nombre}. ` : ''}Has entrado con Google ({user?.email}). Para terminar tu alta en el club:
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
            <Checkbox
              checked={aceptaPrivacidad}
              onChange={(v) => {
                setAceptaPrivacidad(v);
                setPrivacidadError(undefined);
              }}
              error={privacidadError}
              disabled={saving}
              required
            >
              He leído y acepto la{' '}
              <a href={routeHref('/privacidad')} target="_blank" rel="noopener" className="font-semibold text-vino underline">
                política de privacidad
              </a>
              . <span className="text-carbon/55">(obligatorio)</span>
            </Checkbox>
            <Checkbox checked={aceptaEmail} onChange={setAceptaEmail} disabled={saving}>
              Quiero recibir por email ofertas, eventos y novedades de La Alameda.{' '}
              <span className="text-carbon/55">(opcional, puedes darte de baja cuando quieras)</span>
            </Checkbox>

            {error && <Notice kind="error">{error}</Notice>}

            <SubmitButton loading={saving} loadingText="Guardando…" disabled={borrando}>
              Entrar al club
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={rechazar}
            disabled={saving || borrando}
            className={`mt-4 w-full rounded-r-sm text-center text-sm text-carbon/60 underline-offset-4 hover:text-vino hover:underline disabled:opacity-50 ${focusRing}`}
          >
            {borrando ? 'Borrando la cuenta…' : 'No acepto: borrar esta cuenta'}
          </button>
        </ClubCard>
      </div>
    </PageShell>
  );
}
