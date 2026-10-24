import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Clock3, Info, Loader2, Pencil, RefreshCw, Repeat, Save } from 'lucide-react';
import { Checkbox, Notice, SubmitButton, Switch, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { fetchPromoStates, type PromoState } from '@/lib/tickets';
import {
  DIAS,
  crossesMidnight,
  describeDias,
  describeFranja,
  describeLimite,
  describePeriodo,
  diaLargo,
  fetchAppSettings,
  fetchPromotions,
  fromDateTimeLocal,
  hhmm,
  toDateTimeLocal,
  updateAppSettings,
  updatePromotion,
  type AppSettings,
  type PromotionChanges,
  type PromotionRow,
} from '@/lib/adminTickets';

const inputClass =
  'w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 font-primary text-base text-carbon outline-none transition-colors focus:border-vino focus:ring-1 focus:ring-vino/30 disabled:bg-carbon/5 sm:text-sm';

/** Pestaña "Promos": encender/apagar, editar horario y límites, y ajustes de la jornada. */
export function PromosSection() {
  const [promos, setPromos] = useState<PromotionRow[]>([]);
  const [states, setStates] = useState<Map<string, PromoState> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PromotionRow | null>(null);

  const refreshStates = useCallback(async () => setStates(await fetchPromoStates()), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [result] = await Promise.all([fetchPromotions(), refreshStates()]);
    setPromos(result.promos);
    setError(result.error);
    setLoading(false);
  }, [refreshStates]);

  useEffect(() => {
    load();
  }, [load]);

  const replacePromo = (promo: PromotionRow) => setPromos((prev) => prev.map((p) => (p.id === promo.id ? promo : p)));

  const toggleActiva = async (promo: PromotionRow) => {
    setPendingId(promo.id);
    setToggleError(null);
    replacePromo({ ...promo, activa: !promo.activa });
    const result = await updatePromotion(promo.id, { activa: !promo.activa });
    if (result.promo) {
      replacePromo(result.promo);
      refreshStates();
    } else {
      replacePromo(promo);
      setToggleError(`${promo.nombre}: ${result.error}`);
    }
    setPendingId(null);
  };

  return (
    <>
      <AjustesJornada />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-vino">Promos del club</h2>
          <p className="mt-1 text-sm text-carbon/70">
            Enciende las que estén vigentes. Una promo apagada no da tickets y los que ya se dieron no se pueden canjear.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={`btn-outline-vino disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
        </button>
      </div>

      {toggleError && (
        <div className="mt-4">
          <Notice kind="error">{toggleError}</Notice>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          Cargando promos…
        </div>
      ) : error ? (
        <div className="mt-4 space-y-4">
          <Notice kind="error">{error}</Notice>
          <button type="button" onClick={load} className={`btn-outline-vino ${focusRing}`}>
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : promos.length === 0 ? (
        <div className="mt-4">
          <Notice kind="info">No hay promos en la base de datos. Ejecuta supabase/tickets.sql para crearlas.</Notice>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {promos.map((promo) => {
            const ahora = states?.get(promo.id)?.disponible_ahora ?? false;
            const periodo = describePeriodo(promo);
            return (
              <li key={promo.id} className="flex flex-col rounded-r-md border border-piedra/40 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-semibold leading-tight text-carbon">{promo.nombre}</h3>
                    <p className="mt-0.5 text-xs text-carbon/50">{promo.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-semibold text-carbon/70" aria-hidden="true">
                      {promo.activa ? 'Activa' : 'Apagada'}
                    </span>
                    <Switch
                      checked={promo.activa}
                      onChange={() => toggleActiva(promo)}
                      disabled={pendingId === promo.id}
                      label={`${promo.nombre}: ${promo.activa ? 'activa' : 'apagada'}`}
                    />
                  </div>
                </div>

                <div className="mt-2">
                  {promo.activa ? (
                    ahora ? (
                      <span className="inline-flex rounded-full border border-[#2f6b3f]/40 bg-[#2f6b3f]/10 px-2.5 py-0.5 text-[0.72rem] font-semibold text-[#1f4a2b]">
                        Disponible ahora
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-carbon/20 px-2.5 py-0.5 text-[0.72rem] font-semibold text-carbon/60">
                        Fuera de horario
                      </span>
                    )
                  ) : (
                    <span className="inline-flex rounded-full border border-carbon/20 bg-carbon/5 px-2.5 py-0.5 text-[0.72rem] font-semibold text-carbon/55">
                      Apagada: los socios ven «Disponible próximamente»
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm text-carbon/75">{promo.descuento_texto}</p>

                <dl className="mt-3 space-y-1.5 text-sm text-carbon/80">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={15} className="shrink-0 text-vino" aria-hidden="true" />
                    <dt className="sr-only">Días</dt>
                    <dd>{describeDias(promo.dias_semana)}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock3 size={15} className="shrink-0 text-vino" aria-hidden="true" />
                    <dt className="sr-only">Franja</dt>
                    <dd>
                      {describeFranja(promo)}
                      {promo.hora_inicio && promo.hora_fin && crossesMidnight(hhmm(promo.hora_inicio), hhmm(promo.hora_fin))
                        ? ' (cruza la medianoche)'
                        : ''}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Repeat size={15} className="shrink-0 text-vino" aria-hidden="true" />
                    <dt className="sr-only">Límite</dt>
                    <dd>{describeLimite(promo)}</dd>
                  </div>
                  {periodo && (
                    <div className="flex items-center gap-2">
                      <Info size={15} className="shrink-0 text-vino" aria-hidden="true" />
                      <dt className="sr-only">Periodo</dt>
                      <dd>{periodo}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex justify-end border-t border-carbon/10 pt-3">
                  <button type="button" onClick={() => setEditing(promo)} className={`btn-outline-vino ${focusRing}`}>
                    <Pencil size={15} aria-hidden="true" /> Editar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PromoEditor
        promo={editing}
        onClose={() => setEditing(null)}
        onSaved={(promo) => {
          replacePromo(promo);
          setEditing(null);
          refreshStates();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------
// Ajustes de la jornada (app_settings)
// ---------------------------------------------------------------------

function AjustesJornada() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [horaCierre, setHoraCierre] = useState('');
  const [margen, setMargen] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchAppSettings().then(({ settings: s, error }) => {
      setLoading(false);
      if (error || !s) {
        setResult({ kind: 'error', text: error ?? 'No se han encontrado los ajustes. Ejecuta supabase/tickets.sql.' });
        return;
      }
      setSettings(s);
      setHoraCierre(hhmm(s.hora_cierre));
      setMargen(String(s.margen_cortesia_min));
    });
  }, []);

  const dirty = settings !== null && (horaCierre !== hhmm(settings.hora_cierre) || margen !== String(settings.margen_cortesia_min));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const minutos = Number(margen);
    if (!horaCierre || !Number.isInteger(minutos) || minutos < 0 || minutos > 240) {
      setResult({ kind: 'error', text: 'Indica una hora de cierre y un margen entre 0 y 240 minutos.' });
      return;
    }
    setSaving(true);
    setResult(null);
    const { settings: saved, error } = await updateAppSettings({ hora_cierre: horaCierre, margen_cortesia_min: minutos });
    setSaving(false);
    if (saved) {
      setSettings(saved);
      setHoraCierre(hhmm(saved.hora_cierre));
      setMargen(String(saved.margen_cortesia_min));
      setResult({ kind: 'success', text: 'Ajustes guardados. Se aplican a los tickets nuevos.' });
    } else {
      setResult({ kind: 'error', text: error ?? 'No se han podido guardar los ajustes.' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-r-lg border border-piedra/50 bg-piedra-suave/50 p-4 shadow-sm sm:p-6">
      <h2 className="font-display text-2xl font-semibold text-vino">Ajustes de la jornada</h2>
      <p className="mt-1 text-sm text-carbon/70">
        Los tickets caducan, como muy tarde, al cierre más el margen de cortesía. Si el cierre es de madrugada, lo que pase
        después de medianoche cuenta para la jornada anterior.
      </p>
      {loading ? (
        <div className="py-4 text-sm text-carbon/60" role="status">
          Cargando ajustes…
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="hora-cierre" className="mb-1 block text-xs font-semibold text-carbon/80">
              Hora de cierre
            </label>
            <input
              id="hora-cierre"
              type="time"
              value={horaCierre}
              onChange={(e) => setHoraCierre(e.target.value)}
              disabled={!settings}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="margen" className="mb-1 block text-xs font-semibold text-carbon/80">
              Margen de cortesía (minutos)
            </label>
            <input
              id="margen"
              type="number"
              min={0}
              max={240}
              inputMode="numeric"
              value={margen}
              onChange={(e) => setMargen(e.target.value)}
              disabled={!settings}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={!dirty || saving}
            className={`btn-vino min-h-11 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-vino ${focusRing}`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            Guardar
          </button>
        </div>
      )}
      {result && (
        <div className="mt-4">
          <Notice kind={result.kind}>{result.text}</Notice>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------
// Editor de una promo
// ---------------------------------------------------------------------

interface EditorState {
  inicio: string;
  fin: string;
  todosLosDias: boolean;
  dias: number[];
  todoElDia: boolean;
  horaInicio: string;
  horaFin: string;
  sinLimite: boolean;
  maxUsos: string;
  ventana: PromotionRow['ventana_usos'];
}

function toEditorState(p: PromotionRow): EditorState {
  return {
    inicio: toDateTimeLocal(p.inicio),
    fin: toDateTimeLocal(p.fin),
    todosLosDias: !p.dias_semana || p.dias_semana.length === 0 || p.dias_semana.length === 7,
    dias: p.dias_semana ?? [],
    todoElDia: !p.hora_inicio,
    horaInicio: hhmm(p.hora_inicio),
    horaFin: hhmm(p.hora_fin),
    sinLimite: p.max_usos === null,
    maxUsos: p.max_usos ? String(p.max_usos) : '1',
    ventana: p.ventana_usos,
  };
}

function PromoEditor({
  promo,
  onClose,
  onSaved,
}: {
  promo: PromotionRow | null;
  onClose: () => void;
  onSaved: (promo: PromotionRow) => void;
}) {
  const [form, setForm] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(promo ? toEditorState(promo) : null);
    setError(null);
  }, [promo]);

  if (!promo || !form) return null;

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm({ ...form, [key]: value });
  const toggleDia = (dia: number) =>
    set('dias', form.dias.includes(dia) ? form.dias.filter((d) => d !== dia) : [...form.dias, dia].sort((a, b) => a - b));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.todosLosDias && form.dias.length === 0) return setError('Elige al menos un día o marca «Todos los días».');
    if (!form.todoElDia && (!form.horaInicio || !form.horaFin)) return setError('Indica la hora de inicio y la de fin de la franja.');
    if (!form.todoElDia && form.horaInicio === form.horaFin) return setError('La hora de inicio y la de fin no pueden ser iguales.');
    if (form.inicio && form.fin && new Date(form.inicio) >= new Date(form.fin)) return setError('El fin del periodo debe ser posterior al inicio.');
    const max = Number(form.maxUsos);
    if (!form.sinLimite && (!Number.isInteger(max) || max < 1)) return setError('El límite de usos debe ser un número entero mayor que 0.');

    const changes: PromotionChanges = {
      inicio: fromDateTimeLocal(form.inicio),
      fin: fromDateTimeLocal(form.fin),
      dias_semana: form.todosLosDias ? null : form.dias,
      hora_inicio: form.todoElDia ? null : form.horaInicio,
      hora_fin: form.todoElDia ? null : form.horaFin,
      max_usos: form.sinLimite ? null : max,
      ventana_usos: form.ventana,
    };

    setSaving(true);
    setError(null);
    const result = await updatePromotion(promo.id, changes);
    setSaving(false);
    if (result.promo) onSaved(result.promo);
    else setError(result.error);
  };

  const cruza = !form.todoElDia && crossesMidnight(form.horaInicio, form.horaFin);

  return (
    <Modal open title={`Editar: ${promo.nombre}`} onClose={onClose} busy={saving} maxWidth="560px">
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Notice kind="info">
          Estos cambios deciden <strong>cuándo se puede pedir y canjear el ticket</strong>. El texto del horario que se ve
          en la web (por ejemplo «L-V · 16:00-20:00») no cambia: sale de <code>promos.ts</code>.
        </Notice>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-carbon">Días de la semana</legend>
          <Checkbox checked={form.todosLosDias} onChange={(v) => set('todosLosDias', v)}>
            Todos los días
          </Checkbox>
          {!form.todosLosDias && (
            <div className="mt-3 flex flex-wrap gap-2">
              {DIAS.map((letra, i) => {
                const dia = i + 1;
                const on = form.dias.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    aria-pressed={on}
                    aria-label={diaLargo(dia)}
                    onClick={() => toggleDia(dia)}
                    className={`h-11 w-11 rounded-full border text-sm font-bold transition-colors ${focusRing} ${
                      on ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/70 hover:border-vino'
                    }`}
                  >
                    {letra}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-carbon">Franja horaria</legend>
          <Checkbox checked={form.todoElDia} onChange={(v) => set('todoElDia', v)}>
            Todo el día
          </Checkbox>
          {!form.todoElDia && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="hora-inicio" className="mb-1 block text-xs font-semibold text-carbon/80">
                  Desde
                </label>
                <input
                  id="hora-inicio"
                  type="time"
                  value={form.horaInicio}
                  onChange={(e) => set('horaInicio', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="hora-fin" className="mb-1 block text-xs font-semibold text-carbon/80">
                  Hasta
                </label>
                <input
                  id="hora-fin"
                  type="time"
                  value={form.horaFin}
                  onChange={(e) => set('horaFin', e.target.value)}
                  className={inputClass}
                />
              </div>
              {cruza && (
                <p className="col-span-2 text-xs text-carbon/65">
                  Cruza la medianoche: empieza el día marcado y termina de madrugada del día siguiente.
                </p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-carbon">Periodo (opcional)</legend>
          <p className="mb-3 text-xs text-carbon/60">Para eventos o promos de temporada. Vacío = sin límite.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="periodo-inicio" className="mb-1 block text-xs font-semibold text-carbon/80">
                Empieza
              </label>
              <input
                id="periodo-inicio"
                type="datetime-local"
                value={form.inicio}
                onChange={(e) => set('inicio', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="periodo-fin" className="mb-1 block text-xs font-semibold text-carbon/80">
                Termina
              </label>
              <input
                id="periodo-fin"
                type="datetime-local"
                value={form.fin}
                onChange={(e) => set('fin', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-carbon">Límite de usos por socio</legend>
          <Checkbox checked={form.sinLimite} onChange={(v) => set('sinLimite', v)}>
            Sin límite (solo un ticket disponible a la vez)
          </Checkbox>
          {!form.sinLimite && (
            <div className="mt-3 grid grid-cols-[110px_1fr] gap-3">
              <div>
                <label htmlFor="max-usos" className="mb-1 block text-xs font-semibold text-carbon/80">
                  Usos
                </label>
                <input
                  id="max-usos"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={form.maxUsos}
                  onChange={(e) => set('maxUsos', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ventana" className="mb-1 block text-xs font-semibold text-carbon/80">
                  Cada
                </label>
                <select
                  id="ventana"
                  value={form.ventana}
                  onChange={(e) => set('ventana', e.target.value as EditorState['ventana'])}
                  className={inputClass}
                >
                  <option value="dia">Jornada</option>
                  <option value="semana">Semana (lunes a domingo)</option>
                  <option value="mes">Mes</option>
                  <option value="total">En total (para siempre)</option>
                </select>
              </div>
            </div>
          )}
        </fieldset>

        {error && <Notice kind="error">{error}</Notice>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={onClose} disabled={saving} className={`btn-outline-vino flex-1 py-3 ${focusRing}`}>
            Cancelar
          </button>
          <div className="flex-1">
            <SubmitButton loading={saving} loadingText="Guardando…">
              Guardar cambios
            </SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
