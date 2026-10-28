import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Clock3, Info, Loader2, Pencil, Plus, RefreshCw, Repeat, Save } from 'lucide-react';
import { Checkbox, Notice, SubmitButton, Switch, TextField, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { fetchPromoStates, parseEurosToCents, type PromoState } from '@/lib/tickets';
import {
  centsToInput,
  createPromo,
  createSegment,
  fetchCarta,
  fetchPromoLinks,
  fetchSegments,
  makeId,
  reorder,
  saveOrder,
  savePromoLinks,
  updatePromoFull,
  updateSegment,
  type ProductRow,
  type PromoItem,
  type SegmentRow,
} from '@/lib/adminCatalog';
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
  type PromotionRow,
} from '@/lib/adminTickets';

const iconButton = `flex h-9 w-9 items-center justify-center rounded-r-sm border border-carbon/15 bg-white text-carbon/70 transition-colors hover:border-vino hover:text-vino disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`;

const inputClass =
  'w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 font-primary text-base text-carbon outline-none transition-colors focus:border-vino focus:ring-1 focus:ring-vino/30 disabled:bg-carbon/5 sm:text-sm';

/** Pestaña "Promos": ajustes de la jornada, franjas y promos (lo que se ve en la web, horario y límites de tickets). */
export function PromosSection() {
  const [promos, setPromos] = useState<PromotionRow[]>([]);
  const [states, setStates] = useState<Map<string, PromoState> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [segments, setSegments] = useState<SegmentRow[]>([]);

  const refreshStates = useCallback(async () => setStates(await fetchPromoStates()), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [result, seg] = await Promise.all([fetchPromotions(), fetchSegments(), refreshStates()]);
    setPromos(result.promos);
    setSegments(seg.segments);
    setError(result.error ?? seg.error);
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

  /** Sube o baja una promo (orden en la web). */
  const movePromo = async (index: number, direction: -1 | 1) => {
    const changes = reorder(promos, index, direction, (p) => p.id);
    if (changes.length === 0) return;
    setPromos((prev) =>
      prev
        .map((p) => ({ ...p, orden: changes.find((c) => c.key === p.id)?.orden ?? p.orden }))
        .sort((a, b) => a.orden - b.orden)
    );
    const err = await saveOrder('promotions', changes);
    if (err) {
      setToggleError(err);
      load();
    }
  };

  return (
    <>
      <AjustesJornada />

      {!loading && !error && <FranjasManager segments={segments} onChange={setSegments} />}

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-vino">Promos del club</h2>
          <p className="mt-1 text-sm text-carbon/70">
            Enciende las que estén vigentes. Una promo apagada no da tickets y los que ya se dieron no se pueden canjear.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCreating(true)} className={`btn-vino ${focusRing}`}>
            <Plus size={16} aria-hidden="true" /> Nueva promo
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={`btn-outline-vino disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
          </button>
        </div>
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
          {promos.map((promo, index) => {
            const ahora = states?.get(promo.id)?.disponible_ahora ?? false;
            const periodo = describePeriodo(promo);
            return (
              <li key={promo.id} className="flex flex-col rounded-r-md border border-piedra/40 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-semibold leading-tight text-carbon">{promo.nombre}</h3>
                    <p className="mt-0.5 text-xs text-carbon/50">{promo.id}</p>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${
                        promo.publicada ? 'border-vino/40 bg-vino/10 text-vino' : 'border-carbon/20 bg-carbon/5 text-carbon/55'
                      }`}
                    >
                      {promo.publicada ? 'Publicada en la web' : 'Sin publicar'}
                    </span>
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

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-carbon/10 pt-3">
                  <button type="button" className={iconButton} disabled={index === 0} onClick={() => movePromo(index, -1)} aria-label={`Subir ${promo.nombre}`}>
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" className={iconButton} disabled={index === promos.length - 1} onClick={() => movePromo(index, 1)} aria-label={`Bajar ${promo.nombre}`}>
                    <ArrowDown size={16} />
                  </button>
                  <button type="button" onClick={() => setEditing(promo)} className={`btn-outline-vino ${focusRing}`}>
                    <Pencil size={15} aria-hidden="true" /> Editar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NuevaPromo
        open={creating}
        existingIds={promos.map((p) => p.id)}
        onClose={() => setCreating(false)}
        onCreated={(row) => {
          setPromos((prev) => [...prev, row]);
          setCreating(false);
          setEditing(row);
          refreshStates();
        }}
      />

      <PromoEditor
        promo={editing}
        segments={segments}
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
// Franjas de promos (promo_segments)
// ---------------------------------------------------------------------

function FranjasManager({
  segments,
  onChange,
}: {
  segments: SegmentRow[];
  onChange: (segments: SegmentRow[]) => void;
}) {
  const [editing, setEditing] = useState<SegmentRow | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...segments].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

  const patch = async (row: SegmentRow, changes: Partial<SegmentRow>) => {
    setError(null);
    onChange(segments.map((s) => (s.id === row.id ? { ...s, ...changes } : s)));
    const res = await updateSegment(row.id, changes);
    if (!res.row) {
      onChange(segments);
      setError(`${row.nombre}: ${res.error}`);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const changes = reorder(sorted, index, direction, (s) => s.id);
    if (changes.length === 0) return;
    onChange(segments.map((s) => ({ ...s, orden: changes.find((c) => c.key === s.id)?.orden ?? s.orden })));
    const err = await saveOrder('promo_segments', changes);
    if (err) setError(err);
  };

  return (
    <section aria-labelledby="franjas-title" className="mt-8 rounded-r-lg border border-piedra/50 bg-white/80 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="franjas-title" className="font-display text-2xl font-semibold text-vino">Franjas</h2>
          <p className="mt-1 text-sm text-carbon/70">Las pestañas de Promociones en la web (Mañanas, Noche…). Las ocultas no se ven.</p>
        </div>
        <button type="button" onClick={() => setEditing('new')} className={`btn-outline-vino ${focusRing}`}>
          <Plus size={16} aria-hidden="true" /> Franja
        </button>
      </div>
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <ul className="mt-4 divide-y divide-carbon/10">
        {sorted.map((seg, i) => (
          <li key={seg.id} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${seg.visible ? '' : 'opacity-60'}`}>
            <div className="min-w-0">
              <span className="font-semibold text-carbon">{seg.nombre}</span>
              {!seg.visible && <span className="pend-badge ml-2">OCULTA</span>}
              {seg.publico && <span className="block text-xs text-carbon/60">{seg.publico}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={seg.visible} onChange={(v) => patch(seg, { visible: v })} label={`Franja ${seg.nombre} visible`} />
              <button type="button" className={iconButton} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${seg.nombre}`}>
                <ArrowUp size={16} />
              </button>
              <button type="button" className={iconButton} disabled={i === sorted.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${seg.nombre}`}>
                <ArrowDown size={16} />
              </button>
              <button type="button" className={iconButton} onClick={() => setEditing(seg)} aria-label={`Editar ${seg.nombre}`}>
                <Pencil size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <FranjaEditor
        state={editing}
        segments={segments}
        onClose={() => setEditing(null)}
        onSaved={(row, created) => {
          onChange(created ? [...segments, row] : segments.map((s) => (s.id === row.id ? row : s)));
          setEditing(null);
        }}
      />
    </section>
  );
}

function FranjaEditor({
  state,
  segments,
  onClose,
  onSaved,
}: {
  state: SegmentRow | 'new' | null;
  segments: SegmentRow[];
  onClose: () => void;
  onSaved: (row: SegmentRow, created: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [publico, setPublico] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setNombre(state === 'new' ? '' : state.nombre);
    setPublico(state === 'new' ? '' : (state.publico ?? ''));
    setError(null);
  }, [state]);

  if (!state) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribe el nombre de la franja.');
    setSaving(true);
    setError(null);
    const res =
      state === 'new'
        ? await createSegment({
            id: makeId(nombre.replace(/\p{Extended_Pictographic}/gu, ''), segments.map((s) => s.id)),
            nombre: nombre.trim(),
            publico: publico.trim() || null,
            orden: Math.max(0, ...segments.map((s) => s.orden)) + 10,
            visible: true,
          })
        : await updateSegment(state.id, { nombre: nombre.trim(), publico: publico.trim() || null });
    setSaving(false);
    if (res.row) onSaved(res.row, state === 'new');
    else setError(res.error);
  };

  return (
    <Modal open title={state === 'new' ? 'Nueva franja' : 'Editar franja'} onClose={onClose} busy={saving} maxWidth="460px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField label="Nombre (puede llevar emoji)" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="🌙 Noche" required />
        <TextField label="Para quién (texto bajo las pestañas)" value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Grupos" />
        {error && <Notice kind="error">{error}</Notice>}
        <SubmitButton loading={saving} loadingText="Guardando…">{state === 'new' ? 'Crear franja' : 'Guardar'}</SubmitButton>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Nueva promo (nace sin publicar y apagada)
// ---------------------------------------------------------------------

function NuevaPromo({
  open,
  existingIds,
  onClose,
  onCreated,
}: {
  open: boolean;
  existingIds: string[];
  onClose: () => void;
  onCreated: (row: PromotionRow) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribe el nombre de la promo.');
    setSaving(true);
    setError(null);
    const res = await createPromo(makeId(nombre, existingIds), nombre.trim());
    setSaving(false);
    if (res.row) onCreated(res.row);
    else setError(res.error);
  };

  return (
    <Modal open title="Nueva promo" onClose={onClose} busy={saving} maxWidth="460px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-carbon/70">
          Se crea <strong>sin publicar y apagada</strong>. Después rellenas precio, contenidos y horario, y la publicas cuando
          esté lista.
        </p>
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Tardeo de tercios" required />
        {error && <Notice kind="error">{error}</Notice>}
        <SubmitButton loading={saving} loadingText="Creando…">Crear y editar</SubmitButton>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Editor de una promo: lo que se ve en la web + horario y límites de los tickets
// ---------------------------------------------------------------------

interface EditorState {
  // En la web
  publicada: boolean;
  nombre: string;
  tipo: PromotionRow['tipo'];
  precio: string;
  descuento: string;
  descripcion: string;
  contenidos: string; // una línea por elemento
  personas: string;
  textoHorario: string;
  mensajeReserva: string;
  visibleHasta: string;
  exclusiva: boolean;
  segmentIds: string[];
  items: PromoItem[];
  // Tickets
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
    publicada: p.publicada,
    nombre: p.nombre,
    tipo: p.tipo,
    precio: centsToInput(p.precio_centimos),
    descuento: p.descuento_pct === null ? '' : String(p.descuento_pct),
    descripcion: p.descripcion ?? '',
    contenidos: (p.contenidos ?? []).join('\n'),
    personas: p.personas ? String(p.personas) : '',
    textoHorario: p.texto_horario ?? '',
    mensajeReserva: p.mensaje_reserva ?? '',
    visibleHasta: toDateTimeLocal(p.visible_hasta),
    exclusiva: p.exclusiva,
    segmentIds: [],
    items: [],
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
  segments,
  onClose,
  onSaved,
}: {
  promo: PromotionRow | null;
  segments: SegmentRow[];
  onClose: () => void;
  onSaved: (promo: PromotionRow) => void;
}) {
  const [form, setForm] = useState<EditorState | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState('');

  useEffect(() => {
    setError(null);
    if (!promo) {
      setForm(null);
      return;
    }
    const base = toEditorState(promo);
    setForm(base);
    setLinksLoading(true);
    Promise.all([fetchPromoLinks(promo.id), fetchCarta()]).then(([links, carta]) => {
      setForm((prev) => (prev ? { ...prev, segmentIds: links.segmentIds, items: links.items } : prev));
      setProducts(carta.products);
      if (links.error || carta.error) setError(links.error ?? carta.error);
      setLinksLoading(false);
    });
  }, [promo]);

  if (!promo || !form) return null;

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm({ ...form, [key]: value });
  const toggleDia = (dia: number) =>
    set('dias', form.dias.includes(dia) ? form.dias.filter((d) => d !== dia) : [...form.dias, dia].sort((a, b) => a - b));
  const toggleSegment = (id: string) =>
    set('segmentIds', form.segmentIds.includes(id) ? form.segmentIds.filter((s) => s !== id) : [...form.segmentIds, id]);
  const productName = (id: number) => products.find((p) => p.id === id)?.nombre ?? `#${id}`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // En la web
    if (!form.nombre.trim()) return setError('Escribe el nombre de la promo.');
    const precio = parseEurosToCents(form.precio);
    if (precio === undefined) return setError('Escribe el precio como 9 o 7,50, o déjalo vacío («Consulta condiciones»).');
    const descuento = form.descuento.trim() === '' ? null : Number(form.descuento);
    if (descuento !== null && (!Number.isInteger(descuento) || descuento < 0 || descuento > 100))
      return setError('El descuento debe ser un número entero entre 0 y 100, o vacío.');
    const personas = form.personas.trim() === '' ? null : Number(form.personas);
    if (personas !== null && (!Number.isInteger(personas) || personas < 1)) return setError('Personas debe ser un número entero mayor que 0, o vacío.');
    if (form.publicada && form.segmentIds.length === 0) return setError('Elige al menos una franja para que se vea en la web.');
    // Tickets
    if (!form.todosLosDias && form.dias.length === 0) return setError('Elige al menos un día o marca «Todos los días».');
    if (!form.todoElDia && (!form.horaInicio || !form.horaFin)) return setError('Indica la hora de inicio y la de fin de la franja.');
    if (!form.todoElDia && form.horaInicio === form.horaFin) return setError('La hora de inicio y la de fin no pueden ser iguales.');
    if (form.inicio && form.fin && new Date(form.inicio) >= new Date(form.fin)) return setError('El fin del periodo debe ser posterior al inicio.');
    const max = Number(form.maxUsos);
    if (!form.sinLimite && (!Number.isInteger(max) || max < 1)) return setError('El límite de usos debe ser un número entero mayor que 0.');

    const contenidos = form.contenidos.split('\n').map((l) => l.trim()).filter(Boolean);
    const changes: Partial<PromotionRow> = {
      publicada: form.publicada,
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      precio_centimos: precio,
      descuento_pct: descuento,
      descripcion: form.descripcion.trim() || null,
      contenidos,
      // El ticket guarda una copia de esto: se mantiene igual que los contenidos.
      descuento_texto: contenidos.join(' + '),
      personas,
      texto_horario: form.textoHorario.trim() || null,
      mensaje_reserva: form.mensajeReserva.trim() || null,
      visible_hasta: fromDateTimeLocal(form.visibleHasta),
      exclusiva: form.exclusiva,
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
    const result = await updatePromoFull(promo.id, changes);
    if (!result.row) {
      setSaving(false);
      return setError(result.error);
    }
    const linksError = await savePromoLinks(promo.id, form.segmentIds, form.items);
    setSaving(false);
    if (linksError) return setError(`Datos guardados, pero no las franjas o productos: ${linksError}`);
    onSaved(result.row);
  };

  const cruza = !form.todoElDia && crossesMidnight(form.horaInicio, form.horaFin);
  const sortedSegments = [...segments].sort((a, b) => a.orden - b.orden);
  const availableProducts = [...products].sort((a, b) => a.nombre.localeCompare(b.nombre)).filter((p) => !form.items.some((i) => i.product_id === p.id));

  return (
    <Modal open title={`Editar: ${promo.nombre}`} onClose={onClose} busy={saving} maxWidth="620px">
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* ---------------- En la web ---------------- */}
        <div className="rounded-r-md border border-piedra/50 bg-piedra-suave/40 p-4">
          <h3 className="font-display text-xl font-semibold text-vino">En la web</h3>
          <div className="mt-3 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-r-sm bg-white px-3 py-2.5">
              <span className="text-sm font-semibold text-carbon">
                {form.publicada ? 'Publicada: se ve en la web' : 'Sin publicar: no se ve en la web'}
              </span>
              <Switch checked={form.publicada} onChange={(v) => set('publicada', v)} label="Publicada" />
            </div>
            <TextField label="Nombre" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} required />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="promo-tipo" className="mb-1 block text-xs font-semibold text-carbon/80">Tipo</label>
                <select id="promo-tipo" value={form.tipo} onChange={(e) => set('tipo', e.target.value as EditorState['tipo'])} className={inputClass}>
                  <option value="pack">Pack</option>
                  <option value="obsequio">Obsequio</option>
                  <option value="sorteo">Sorteo</option>
                </select>
              </div>
              <TextField label="Precio (€)" value={form.precio} onChange={(e) => set('precio', e.target.value)} inputMode="decimal" placeholder="9" hint="0 = Gratis" />
              <TextField label="Descuento (%)" value={form.descuento} onChange={(e) => set('descuento', e.target.value)} inputMode="numeric" placeholder="—" hint="Vacío = sin etiqueta" />
            </div>
            <TextField label="Descripción (opcional)" value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Pack para 4" />
            <div>
              <label htmlFor="promo-contenidos" className="mb-1 block text-xs font-semibold text-carbon/80">Contenidos (uno por línea)</label>
              <textarea
                id="promo-contenidos"
                rows={3}
                value={form.contenidos}
                onChange={(e) => set('contenidos', e.target.value)}
                placeholder={'4 cañones Estrella\nPatatas bravas'}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-carbon/60">También es el texto que guarda cada ticket.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Personas (opcional)" value={form.personas} onChange={(e) => set('personas', e.target.value)} inputMode="numeric" hint="Muestra «Para N» y el precio por persona" />
              <TextField label="Horario que se muestra" value={form.textoHorario} onChange={(e) => set('textoHorario', e.target.value)} placeholder="L-V · 16:00-20:00" />
            </div>
            <TextField
              label="Mensaje de WhatsApp para reservar (opcional)"
              value={form.mensajeReserva}
              onChange={(e) => set('mensajeReserva', e.target.value)}
              hint="Si lo rellenas, aparece el botón «Reservar por WhatsApp»."
            />
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-carbon">Franjas en las que aparece</legend>
              <div className="flex flex-wrap gap-2">
                {sortedSegments.map((seg) => {
                  const on = form.segmentIds.includes(seg.id);
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSegment(seg.id)}
                      disabled={linksLoading}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${focusRing} ${
                        on ? 'border-vino bg-vino text-white' : 'border-carbon/25 bg-white text-carbon/70 hover:border-vino'
                      }`}
                    >
                      {seg.nombre}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="visible-hasta" className="mb-1 block text-xs font-semibold text-carbon/80">Visible hasta (opcional)</label>
                <input id="visible-hasta" type="datetime-local" value={form.visibleHasta} onChange={(e) => set('visibleHasta', e.target.value)} className={inputClass} />
              </div>
              <div className="flex items-end pb-1">
                <Checkbox checked={form.exclusiva} onChange={(v) => set('exclusiva', v)}>
                  Exclusiva: mientras se vea, oculta las demás promos
                </Checkbox>
              </div>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-carbon">Productos de la carta que lleva</legend>
              <p className="mb-2 text-xs text-carbon/60">Muestran la etiqueta «En promo» en la carta.</p>
              {linksLoading ? (
                <p className="text-xs text-carbon/60" role="status">Cargando…</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {form.items.map((item) => (
                      <li key={item.product_id} className="flex items-center gap-2 rounded-r-sm bg-white px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="text-xs text-carbon/50">#{item.product_id}</span> {productName(item.product_id)}
                        </span>
                        <label className="sr-only" htmlFor={`cant-${item.product_id}`}>Cantidad</label>
                        <input
                          id={`cant-${item.product_id}`}
                          type="number"
                          min={1}
                          value={item.cantidad}
                          onChange={(e) =>
                            set('items', form.items.map((i) => (i.product_id === item.product_id ? { ...i, cantidad: Math.max(1, Number(e.target.value) || 1) } : i)))
                          }
                          className="w-16 rounded-r-sm border border-carbon/25 px-2 py-1 text-right"
                        />
                        <button
                          type="button"
                          onClick={() => set('items', form.items.filter((i) => i.product_id !== item.product_id))}
                          className={`rounded-r-sm px-2 py-1 text-xs font-semibold text-vino hover:underline ${focusRing}`}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <label className="sr-only" htmlFor="nuevo-item">Añadir producto</label>
                    <select id="nuevo-item" value={newItem} onChange={(e) => setNewItem(e.target.value)} className={inputClass}>
                      <option value="">Añadir producto…</option>
                      {availableProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.id} · {p.nombre}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!newItem}
                      onClick={() => {
                        set('items', [...form.items, { product_id: Number(newItem), cantidad: 1 }]);
                        setNewItem('');
                      }}
                      className={`btn-outline-vino shrink-0 disabled:opacity-50 ${focusRing}`}
                    >
                      Añadir
                    </button>
                  </div>
                </>
              )}
            </fieldset>
          </div>
        </div>

        {/* ---------------- Tickets ---------------- */}
        <div className="rounded-r-md border border-carbon/15 p-4">
          <h3 className="font-display text-xl font-semibold text-vino">Tickets: cuándo se pueden pedir y canjear</h3>
          <div className="mt-3 space-y-6">
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

          </div>
        </div>

        {error && <Notice kind="error">{error}</Notice>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={onClose} disabled={saving} className={`btn-outline-vino flex-1 py-3 ${focusRing}`}>
            Cancelar
          </button>
          <div className="flex-1">
            <SubmitButton loading={saving} loadingText="Guardando…" disabled={linksLoading}>
              Guardar cambios
            </SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
