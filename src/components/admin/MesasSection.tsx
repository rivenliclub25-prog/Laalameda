import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Printer, QrCode, RefreshCw, X } from 'lucide-react';
import { Notice, SubmitButton, Switch, TextField, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { reorder } from '@/lib/adminCatalog';
import { useScrollLock } from '@/lib/useScrollLock';
import { createMesa, fetchMesas, mesaQrUrl, regenerarQrMesa, updateMesa, type Mesa } from '@/lib/pos';

const iconButton = `flex h-9 w-9 items-center justify-center rounded-r-sm border border-carbon/15 bg-white text-carbon/70 transition-colors hover:border-vino hover:text-vino disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`;

/** Pestaña "Mesas" del panel: crear, renombrar, ordenar, desactivar e imprimir sus QR. */
export function MesasSection() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Mesa | 'new' | null>(null);
  const [qrMesa, setQrMesa] = useState<Mesa | null>(null);
  const [printing, setPrinting] = useState<Mesa[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchMesas();
    setMesas(r.mesas);
    setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (m: Mesa) => setMesas((prev) => prev.map((x) => (x.id === m.id ? m : x)));

  const toggleActiva = async (m: Mesa) => {
    setError(null);
    replace({ ...m, activa: !m.activa });
    const r = await updateMesa(m.id, { activa: !m.activa });
    if (r.mesa) replace(r.mesa);
    else {
      replace(m);
      setError(`${m.nombre}: ${r.error}`);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const changes = reorder(mesas, index, direction, (m) => m.id);
    if (changes.length === 0) return;
    setMesas((prev) =>
      prev.map((m) => ({ ...m, orden: changes.find((c) => c.key === m.id)?.orden ?? m.orden })).sort((a, b) => a.orden - b.orden)
    );
    for (const c of changes) {
      const r = await updateMesa(String(c.key), { orden: c.orden });
      if (!r.mesa) {
        setError(r.error);
        load();
        return;
      }
    }
  };

  const activas = mesas.filter((m) => m.activa);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-vino">Mesas</h2>
          <p className="mt-1 text-sm text-carbon/70">
            Cada mesa tiene su QR. Imprímelo y pégalo en la mesa: desde ahí los socios podrán pedir (próximamente).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPrinting(activas)} disabled={activas.length === 0} className={`btn-outline-vino disabled:opacity-50 ${focusRing}`}>
            <Printer size={16} aria-hidden="true" /> Imprimir QR
          </button>
          <button type="button" onClick={() => setEditing('new')} className={`btn-vino ${focusRing}`}>
            <Plus size={16} aria-hidden="true" /> Mesa
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
          <span className="sr-only">Cargando mesas…</span>
        </div>
      ) : mesas.length === 0 ? (
        <div className="mt-6 rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-12 text-center">
          <p className="font-display text-2xl font-semibold text-vino">Aún no hay mesas</p>
          <p className="mt-1 text-sm text-carbon/70">Crea la primera con «+ Mesa» (por ejemplo, «Terraza 1»).</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-carbon/10 rounded-r-lg border border-piedra/50 bg-white shadow-sm">
          {mesas.map((m, i) => (
            <li key={m.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${m.activa ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <span className="font-semibold text-carbon">{m.nombre}</span>
                {!m.activa && <span className="pend-badge ml-2">DESACTIVADA</span>}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-carbon/70">
                  <Switch checked={m.activa} onChange={() => toggleActiva(m)} label={`${m.nombre} activa`} />
                  <span className="hidden sm:inline">Activa</span>
                </label>
                <button type="button" className={iconButton} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${m.nombre}`}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" className={iconButton} disabled={i === mesas.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${m.nombre}`}>
                  <ArrowDown size={16} />
                </button>
                <button type="button" className={iconButton} onClick={() => setEditing(m)} aria-label={`Renombrar ${m.nombre}`}>
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => setQrMesa(m)} className={`btn-outline-vino ${focusRing}`}>
                  <QrCode size={16} aria-hidden="true" /> QR
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MesaEditor
        state={editing}
        nextOrden={Math.max(0, ...mesas.map((m) => m.orden)) + 10}
        onClose={() => setEditing(null)}
        onSaved={(m, created) => {
          setMesas((prev) => (created ? [...prev, m] : prev.map((x) => (x.id === m.id ? m : x))));
          setEditing(null);
        }}
      />

      {qrMesa && (
        <QrModal
          mesa={qrMesa}
          onClose={() => setQrMesa(null)}
          onRegenerated={(token) => {
            const m = { ...qrMesa, token };
            replace(m);
            setQrMesa(m);
          }}
          onPrint={() => setPrinting([qrMesa])}
        />
      )}

      {printing && <HojaQr mesas={printing} onClose={() => setPrinting(null)} />}
    </>
  );
}

function MesaEditor({
  state,
  nextOrden,
  onClose,
  onSaved,
}: {
  state: Mesa | 'new' | null;
  nextOrden: number;
  onClose: () => void;
  onSaved: (m: Mesa, created: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setNombre(state === 'new' ? '' : state.nombre);
    setError(null);
  }, [state]);

  if (!state) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribe el nombre de la mesa.');
    setSaving(true);
    const r = state === 'new' ? await createMesa(nombre.trim(), nextOrden) : await updateMesa(state.id, { nombre: nombre.trim() });
    setSaving(false);
    if (r.mesa) onSaved(r.mesa, state === 'new');
    else setError(r.error);
  };

  return (
    <Modal open title={state === 'new' ? 'Nueva mesa' : 'Renombrar mesa'} onClose={onClose} busy={saving} maxWidth="440px">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Terraza 1" required />
        {error && <Notice kind="error">{error}</Notice>}
        <SubmitButton loading={saving} loadingText="Guardando…">{state === 'new' ? 'Crear mesa' : 'Guardar'}</SubmitButton>
      </form>
    </Modal>
  );
}

function QrModal({ mesa, onClose, onRegenerated, onPrint }: { mesa: Mesa; onClose: () => void; onRegenerated: (token: string) => void; onPrint: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = mesaQrUrl(mesa.token);

  const regenerar = async () => {
    setBusy(true);
    setError(null);
    const r = await regenerarQrMesa(mesa.id);
    setBusy(false);
    setConfirming(false);
    if (r.data) onRegenerated(r.data);
    else setError(r.error);
  };

  return (
    <Modal open title={`QR de ${mesa.nombre}`} onClose={onClose} busy={busy} maxWidth="440px">
      <div className="flex flex-col items-center text-center">
        <div className="rounded-r-md border border-carbon/10 bg-white p-3">
          <QRCodeSVG value={url} size={220} level="M" fgColor="#1B1815" bgColor="#FFFFFF" title={`QR de ${mesa.nombre}`} />
        </div>
        <p className="mt-3 break-all text-xs text-carbon/55">{url}</p>
        <button type="button" onClick={onPrint} className={`btn-vino mt-4 w-full ${focusRing}`}>
          <Printer size={16} aria-hidden="true" /> Imprimir
        </button>
        {error && (
          <div className="mt-3 w-full">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        <div className="mt-5 w-full border-t border-carbon/10 pt-4 text-left">
          {confirming ? (
            <div className="space-y-3">
              <p className="text-sm text-carbon/75">
                El QR que está pegado en la mesa <strong>dejará de funcionar</strong>. Tendrás que imprimir y pegar el nuevo.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`btn-outline-vino flex-1 ${focusRing}`}>Cancelar</button>
                <button type="button" onClick={regenerar} disabled={busy} className={`btn-vino flex-1 ${focusRing}`}>
                  {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />} Crear nuevo QR
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={`inline-flex items-center gap-1.5 rounded-r-sm text-sm font-semibold text-vino hover:underline ${focusRing}`}>
              <RefreshCw size={15} aria-hidden="true" /> Nuevo QR (si el pegado se ha perdido o copiado)
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Hoja para imprimir y recortar: un QR por mesa. Solo se imprime esta hoja (ver index.css). */
function HojaQr({ mesas, onClose }: { mesas: Mesa[]; onClose: () => void }) {
  useScrollLock(true);

  useEffect(() => {
    document.documentElement.classList.add('qr-printing');
    return () => document.documentElement.classList.remove('qr-printing');
  }, []);

  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-white">
      <div className="no-print sticky top-0 flex items-center justify-between gap-3 border-b border-carbon/10 bg-white px-4 py-3">
        <p className="text-sm text-carbon/70">{mesas.length === 1 ? '1 QR' : `${mesas.length} QR`} · recorta por la línea de puntos</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className={`btn-vino ${focusRing}`}>
            <Printer size={16} aria-hidden="true" /> Imprimir
          </button>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={`flex h-10 w-10 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/10 ${focusRing}`}>
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="qr-print-area grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
        {mesas.map((m) => (
          <div key={m.id} className="flex break-inside-avoid flex-col items-center rounded-r-md border-2 border-dashed border-carbon/30 p-4 text-center">
            <p className="font-display text-2xl font-semibold text-vino">La Alameda</p>
            <p className="mt-1 text-lg font-semibold text-carbon">{m.nombre}</p>
            <div className="mt-3">
              <QRCodeSVG value={mesaQrUrl(m.token)} size={170} level="M" fgColor="#1B1815" bgColor="#FFFFFF" />
            </div>
            <p className="mt-3 text-sm text-carbon/75">Escanea para ver la carta y pedir</p>
          </div>
        ))}
      </div>
    </div>
  );
}
