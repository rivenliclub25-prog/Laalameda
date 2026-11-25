import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import type { AdminUser } from '@/lib/admin';
import { formatEuros } from '@/lib/pos';
import { ESTADOS_EVENTO, fechaLarga, fetchEventos, horaCorta, pendientePlazos, type Evento } from '@/lib/eventos';
import { EventoEditor } from '@/components/admin/eventos/EventoEditor';
import { EventoDetalle } from '@/components/admin/eventos/EventoDetalle';

type Filtro = 'proximos' | 'pasados' | 'cancelados';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'proximos', label: 'Próximos' },
  { id: 'pasados', label: 'Pasados' },
  { id: 'cancelados', label: 'Cancelados' },
];

/** Fecha de hoy (local) como «AAAA-MM-DD». */
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Panel → Eventos (EVENTOS.md, EV2): eventos con precio cerrado y pago en plazos. Se crean, editan,
 * confirman (abre su cuenta en el TPV) y cancelan aquí; se cobran en el TPV.
 */
export function EventosSection({ users }: { users: AdminUser[] }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('proximos');
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editando, setEditando] = useState<Evento | 'nuevo' | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const r = await fetchEventos();
    setEventos(r.eventos);
    setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const lista = useMemo(() => {
    const hoy = hoyISO();
    const t = buscar.trim().toLowerCase();
    const filtrados = eventos.filter((e) => {
      if (t && !`${e.nombre} ${e.contacto_nombre ?? ''} ${e.contacto_telefono ?? ''}`.toLowerCase().includes(t)) return false;
      if (filtro === 'cancelados') return e.estado === 'cancelado';
      if (e.estado === 'cancelado') return false;
      // Un evento pasado que aún tiene algo pendiente sigue en «Próximos» hasta que se cobra.
      const pasado = e.fecha < hoy && (e.estado === 'realizado' || pendientePlazos(e) === 0);
      return filtro === 'pasados' ? pasado || e.estado === 'realizado' : !pasado && e.estado !== 'realizado';
    });
    return filtro === 'proximos' ? filtrados : [...filtrados].reverse();
  }, [eventos, filtro, buscar]);

  const eventoAbierto = abierto ? eventos.find((e) => e.id === abierto) ?? null : null;

  return (
    <section aria-labelledby="eventos-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="eventos-title" className="font-display text-2xl font-semibold text-vino">Eventos</h2>
          <p className="text-sm text-carbon/65">Cumpleaños y celebraciones con precio cerrado, pagados en plazos. Se cobran en el TPV.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={cargar} disabled={loading} aria-label="Recargar" className={`btn-outline-vino ${focusRing}`}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setEditando('nuevo')} className={`btn-vino ${focusRing}`}>
            <Plus size={16} aria-hidden="true" /> Evento
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-r-sm border border-carbon/20" role="group" aria-label="Filtrar eventos">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`h-11 px-4 text-sm font-semibold ${focusRing} ${filtro === f.id ? 'bg-carbon text-white' : 'bg-white text-carbon/70'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Buscar evento</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-carbon/45" aria-hidden="true" />
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por nombre o contacto"
            className={`h-11 w-full rounded-r-sm border border-carbon/20 bg-white pl-9 pr-3 text-sm ${focusRing}`}
          />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        {aviso && <Notice kind="success">{aviso}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {loading && eventos.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-carbon/60">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando eventos…
          </p>
        ) : lista.length === 0 ? (
          <div className="rounded-r-md border border-dashed border-carbon/20 p-6 text-center text-sm text-carbon/60">
            <CalendarDays size={28} className="mx-auto mb-2 text-carbon/35" aria-hidden="true" />
            {filtro === 'proximos' ? 'No hay eventos próximos. Crea uno con «+ Evento».' : 'Nada por aquí.'}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {lista.map((e) => {
              const est = ESTADOS_EVENTO[e.estado];
              const pendiente = pendientePlazos(e);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setAbierto(e.id)}
                    className={`w-full rounded-r-md border border-carbon/10 bg-white p-4 text-left shadow-sm transition-colors hover:border-vino/40 ${focusRing}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-semibold text-carbon">{e.nombre}</p>
                        <p className="text-sm text-carbon/70">
                          {fechaLarga(e.fecha)}
                          {e.hora_inicio ? `, ${horaCorta(e.hora_inicio)}` : ''}
                          {e.personas ? ` · ${e.personas} pers.` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${est.clase}`}>{est.texto}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                      <span>
                        Precio <strong className="tabular-nums">{formatEuros(e.precio_centimos)}</strong>
                      </span>
                      {e.estado !== 'cancelado' && e.estado !== 'borrador' && (
                        <span className={pendiente > 0 ? 'text-[#7a4e00]' : 'text-[#1f4a2b]'}>
                          {pendiente > 0 ? `Pendiente ${formatEuros(pendiente)}` : 'Plazos cobrados ✓'}
                        </span>
                      )}
                    </div>
                    {e.plazos.length > 0 && e.estado !== 'cancelado' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.plazos.map((p) => (
                          <span
                            key={p.id}
                            className={`rounded-full border px-2 py-0.5 text-xs ${p.venta ? 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#1f4a2b]' : 'border-carbon/15 bg-carbon/5 text-carbon/70'}`}
                          >
                            {p.nombre} {formatEuros(p.importe_centimos)}
                            {p.venta ? ' ✓' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {eventoAbierto && !editando && (
        <EventoDetalle
          key={eventoAbierto.id}
          evento={eventoAbierto}
          users={users}
          onClose={() => setAbierto(null)}
          onEditar={() => setEditando(eventoAbierto)}
          onCambiado={async (msg) => {
            setAviso(msg ?? null);
            await cargar();
          }}
        />
      )}

      {editando && (
        <EventoEditor
          evento={editando === 'nuevo' ? null : editando}
          users={users}
          onClose={() => setEditando(null)}
          onSaved={async (id, msg) => {
            setEditando(null);
            setAviso(msg ?? (editando === 'nuevo' ? 'Evento guardado.' : 'Cambios guardados.'));
            await cargar();
            setAbierto(id);
          }}
        />
      )}
    </section>
  );
}
