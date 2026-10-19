import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LayoutDashboard, Loader2, LogOut, Mail, MessageCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { Checkbox, ClubCard, Notice, SubmitButton, TextField, focusRing } from '@/components/club/FormControls';
import { DeleteAccountModal } from '@/components/club/DeleteAccountModal';
import { useAuth, useAuthNotice } from '@/auth/AuthContext';
import { signOut } from '@/lib/auth';
import { fetchProfile, normalizePhone, updateProfile, type EditableProfile, type Profile } from '@/lib/profile';
import { navigate, routeHref } from '@/lib/router';

interface FormState {
  nombre: string;
  telefono: string;
  fechaNacimiento: string;
  aceptaEmail: boolean;
  aceptaWhatsapp: boolean;
}

function toForm(profile: Profile): FormState {
  return {
    nombre: profile.nombre ?? '',
    telefono: profile.telefono ?? '',
    fechaNacimiento: profile.fecha_nacimiento ?? '',
    aceptaEmail: profile.acepta_email,
    aceptaWhatsapp: profile.acepta_whatsapp,
  };
}

function sameForm(a: FormState, b: FormState) {
  return (Object.keys(a) as (keyof FormState)[]).every((key) => a[key] === b[key]);
}

const today = new Date().toISOString().slice(0, 10);

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

export function PerfilPage() {
  const { user, notify, isAdmin } = useAuth();
  const [notice, dismissNotice] = useAuthNotice();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [errors, setErrors] = useState<{ nombre?: string; telefono?: string; fechaNacimiento?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchProfile(userId).then(({ profile: loaded, error }) => {
      if (!active) return;
      setLoadingProfile(false);
      if (error) setLoadError(error);
      else if (!loaded) setLoadError('No encontramos tu perfil. Escríbenos y lo revisamos.');
      else {
        setProfile(loaded);
        setForm(toForm(loaded));
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaveResult(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !userId) return;

    const telefono = normalizePhone(form.telefono);
    const nextErrors = {
      nombre: form.nombre.trim().length < 2 ? 'Dinos cómo te llamas.' : undefined,
      telefono:
        telefono === undefined
          ? 'Ese teléfono no parece válido. Ejemplo: 612 345 678 o +33 6 12 34 56 78.'
          : form.aceptaWhatsapp && !telefono
            ? 'Para recibir WhatsApp necesitamos tu teléfono.'
            : undefined,
      fechaNacimiento:
        form.fechaNacimiento && (form.fechaNacimiento > today || form.fechaNacimiento < '1900-01-01')
          ? 'Revisa la fecha de cumpleaños.'
          : undefined,
    };
    setErrors(nextErrors);
    setSaveResult(null);
    if (Object.values(nextErrors).some(Boolean)) return;

    const changes: EditableProfile = {
      nombre: form.nombre.trim(),
      telefono: telefono ?? null,
      fecha_nacimiento: form.fechaNacimiento || null,
      acepta_email: form.aceptaEmail,
      acepta_whatsapp: form.aceptaWhatsapp,
    };

    setSaving(true);
    const result = await updateProfile(userId, changes);
    setSaving(false);

    if (result.error || !result.profile) {
      setSaveResult({ kind: 'error', text: result.error ?? 'No hemos podido guardar los cambios.' });
    } else {
      setProfile(result.profile);
      setForm(toForm(result.profile));
      setSaveResult({ kind: 'success', text: 'Cambios guardados.' });
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    const { error } = await signOut();
    if (error) {
      setSignOutError(error);
      setSigningOut(false);
    } else {
      navigate('/');
    }
  };

  const handleDeleted = useCallback(() => {
    setDeleteOpen(false);
    notify({ kind: 'success', text: 'Tu cuenta y tus datos se han borrado. ¡Esperamos verte pronto por el bar!' });
    // Sin sesión, ProtectedRoute lleva a la página del club, donde se muestra el aviso.
  }, [notify]);

  const dirty = form && profile ? !sameForm(form, toForm(profile)) : false;
  const firstName = profile?.nombre?.split(' ')[0];

  return (
    <PageShell>
      <div className="mx-auto max-w-[560px]">
        <header className="animate-fade-up text-center" style={{ opacity: 0 }}>
          <div className="eyebrow text-vino">Club La Alameda</div>
          <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[1.05] text-vino sm:text-[3rem]">
            {firstName ? `Hola, ${firstName}` : 'Mi perfil'}
          </h1>
          <div className="divider-gold my-5" />
          {profile && (
            <p className="text-sm text-carbon/70">Miembro del club desde {formatMemberSince(profile.created_at)}</p>
          )}
        </header>

        {isAdmin && (
          <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-r-md border border-piedra/60 bg-piedra-suave/60 px-4 py-3 text-sm text-carbon sm:flex-row">
            <span className="inline-flex items-center gap-2 font-semibold">
              <ShieldCheck size={17} className="text-vino" aria-hidden="true" /> Tienes acceso de administrador
            </span>
            <a href={routeHref('/admin')} className={`btn-vino w-full sm:w-auto ${focusRing}`}>
              <LayoutDashboard size={16} aria-hidden="true" /> Panel
            </a>
          </div>
        )}

        {notice && (
          <div className="mt-6">
            <Notice kind={notice.kind}>
              {notice.text}{' '}
              <button type="button" onClick={dismissNotice} className={`ml-1 rounded-r-sm underline ${focusRing}`}>
                Cerrar
              </button>
            </Notice>
          </div>
        )}

        <ClubCard className="mt-8">
          {loadingProfile ? (
            <div className="flex justify-center py-10" role="status">
              <Loader2 size={28} className="animate-spin text-vino" aria-hidden="true" />
              <span className="sr-only">Cargando tu perfil…</span>
            </div>
          ) : loadError || !form ? (
            <Notice kind="error">{loadError}</Notice>
          ) : (
            <form onSubmit={handleSave} noValidate className="space-y-8">
              <fieldset className="space-y-4">
                <legend className="mb-4 font-display text-2xl font-semibold text-vino">Tus datos</legend>

                <div>
                  <span className="mb-1 block text-xs font-semibold text-carbon/80">Email</span>
                  <p className="break-all rounded-r-sm border border-carbon/10 bg-carbon/5 px-3 py-2.5 text-sm text-carbon/75">
                    {user?.email}
                  </p>
                </div>

                <TextField
                  label="Nombre"
                  autoComplete="name"
                  value={form.nombre}
                  onChange={(e) => update('nombre', e.target.value)}
                  error={errors.nombre}
                  required
                />
                <TextField
                  label="Teléfono (opcional)"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="612 345 678"
                  value={form.telefono}
                  onChange={(e) => update('telefono', e.target.value)}
                  error={errors.telefono}
                  hint="Si no es un número español, añade el prefijo del país (por ejemplo +33)."
                />
                <TextField
                  label="Fecha de cumpleaños (opcional)"
                  type="date"
                  min="1900-01-01"
                  max={today}
                  value={form.fechaNacimiento}
                  onChange={(e) => update('fechaNacimiento', e.target.value)}
                  error={errors.fechaNacimiento}
                  hint="Para tener un detalle contigo el día de tu cumpleaños."
                />
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="mb-1 font-display text-2xl font-semibold text-vino">Comunicaciones</legend>
                <p className="text-sm text-carbon/70">
                  Elige por dónde quieres recibir nuestras ofertas, eventos y novedades. Puedes cambiarlo cuando quieras.
                </p>
                <div className="space-y-3 rounded-r-md border border-piedra/50 bg-piedra-suave/40 p-4">
                  <Checkbox checked={form.aceptaEmail} onChange={(v) => update('aceptaEmail', v)}>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-carbon">
                      <Mail size={15} aria-hidden="true" /> Por email
                    </span>
                    <span className="block text-carbon/65">A {user?.email}</span>
                  </Checkbox>
                  <Checkbox checked={form.aceptaWhatsapp} onChange={(v) => update('aceptaWhatsapp', v)}>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-carbon">
                      <MessageCircle size={15} aria-hidden="true" /> Por WhatsApp
                    </span>
                    <span className="block text-carbon/65">Al teléfono que indiques arriba</span>
                  </Checkbox>
                </div>
              </fieldset>

              <div className="space-y-3">
                {saveResult && <Notice kind={saveResult.kind}>{saveResult.text}</Notice>}
                <SubmitButton loading={saving} loadingText="Guardando…" disabled={!dirty}>
                  {dirty ? 'Guardar cambios' : 'Sin cambios'}
                </SubmitButton>
              </div>
            </form>
          )}
        </ClubCard>

        <section className="mt-8 text-center" aria-label="Opciones de la cuenta">
          {signOutError && (
            <div className="mb-4">
              <Notice kind="error">{signOutError}</Notice>
            </div>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
            className={`btn-outline-vino w-full py-3 sm:w-auto ${focusRing}`}
          >
            {signingOut ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <LogOut size={16} aria-hidden="true" />
            )}
            Cerrar sesión
          </button>

          <div className="mt-10 border-t border-carbon/10 pt-6">
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-r-sm px-2 py-1 text-sm font-semibold text-vino/80 transition-colors hover:text-vino hover:underline ${focusRing}`}
            >
              <Trash2 size={15} aria-hidden="true" /> Borrar mi cuenta
            </button>
          </div>
        </section>
      </div>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onDeleted={handleDeleted} />
    </PageShell>
  );
}
