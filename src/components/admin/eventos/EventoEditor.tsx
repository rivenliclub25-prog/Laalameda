import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { Notice, TextField, focusRing } from '@/components/club/FormControls';
import { Modal } from '@/components/club/Modal';
import { fetchCarta, type CategoryRow, type ProductRow } from '@/lib/adminCatalog';
import type { AdminUser } from '@/lib/admin';
import { formatEuros } from '@/lib/pos';
import { parseEurosToCents } from '@/lib/tickets';
import { confirmarEvento, guardarEvento, type DatosEvento, type Evento } from '@/lib/eventos';

interface FilaContenido {
  key: number;
  tipo: 'producto' | 'concepto';
  product_id: string;
  concepto: string;
  cantidad: string;
}

interface FilaPlazo {
  key: number;
  id?: string;
  nombre: string;
  importe: string;
  /** Cobrado: no se puede tocar ni quitar (EV-D8). */
  cobrado: string | null;
}

let clave = 1;
const nueva = () => clave++;
const aEuros = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const inputClass = `h-11 w-full rounded-r-sm border border-carbon/20 bg-white px-3 text-sm ${focusRing}`;

/**
 * Crear o editar un evento (Panel → Eventos, EVENTOS.md EV2): datos, contenido acordado (producto de la
 * carta o concepto libre, sin precio) y plazos que suman el precio cerrado. En un evento confirmado, los
 * plazos cobrados salen bloqueados.
 */
export function EventoEditor({
  evento,
  users,
  onClose,
  onSaved,
}: {
  evento: Evento | null;
  users: AdminUser[];
  onClose: () => void;
  onSaved: (id: string, aviso?: string) => void;
}) {
  const [nombre, setNombre] = useState(evento?.nombre ?? '');
  const [fecha, setFecha] = useState(evento?.fecha ?? '');
  const [hora, setHora] = useState(evento?.hora_inicio?.slice(0, 5) ?? '');
  const [personas, setPersonas] = useState(evento?.personas ? String(evento.personas) : '');
  const [contactoNombre, setContactoNombre] = useState(evento?.contacto_nombre ?? '');
  const [contactoTelefono, setContactoTelefono] = useState(evento?.contacto_telefono ?? '');
  const [socio, setSocio] = useState(evento?.socio_id ?? '');
  const [buscarSocio, setBuscarSocio] = useState('');
  const [notas, setNotas] = useState(evento?.notas ?? '');
  const [precio, setPrecio] = useState(evento ? aEuros(evento.precio_centimos) : '');
  const [contenido, setContenido] = useState<FilaContenido[]>(
    evento?.items.map((i) => ({
      key: nueva(),
      tipo: i.product_id ? 'producto' : 'concepto',
      product_id: i.product_id ? String(i.product_id) : '',
      concepto: i.concepto ?? '',
      cantidad: String(i.cantidad),
    })) ?? [{ key: nueva(), tipo: 'concepto', product_id: '', concepto: '', cantidad: '1' }]
  );
  const [plazos, setPlazos] = useState<FilaPlazo[]>(
    evento?.plazos.map((p) => ({
      key: nueva(),
      id: evento.estado === 'confirmado' ? p.id : undefined,
      nombre: p.nombre,
      importe: aEuros(p.importe_centimos),
      cobrado: p.venta ? `venta nº ${p.venta.numero}` : null,
    })) ?? [
      { key: nueva(), nombre: 'Señal', importe: '', cobrado: null },
      { key: nueva(), nombre: 'Resto', importe: '', cobrado: null },
    ]
  );
  const [carta, setCarta] = useState<{ categories: CategoryRow[]; products: ProductRow[] } | null>(null);
  const [saving, setSaving] = useState<'guardar' | 'confirmar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idNotas = useId();
  const idSocio = useId();

  useEffect(() => {
    fetchCarta().then((c) => setCarta({ categories: c.categories, products: c.products }));
  }, []);

  const grupos = useMemo(() => {
    if (!carta) return [];
    return [...carta.categories]
      .sort((a, b) => a.orden - b.orden)
      .map((c) => [c, carta.products.filter((p) => p.categoria_id === c.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))] as const)
      .filter(([, ps]) => ps.length > 0);
  }, [carta]);

  const socios = useMemo(() => {
    const t = buscarSocio.trim().toLowerCase();
    return users
      .filter((u) => u.id === socio || !t || `${u.nombre ?? ''} ${u.email}`.toLowerCase().includes(t))
      .sort((a, b) => (a.nombre ?? a.email).localeCompare(b.nombre ?? b.email, 'es'))
      .slice(0, 60);
  }, [users, buscarSocio, socio]);

  const precioC = parseEurosToCents(precio);
  const importes = plazos.map((p) => parseEurosToCents(p.importe));
  const suma = importes.reduce<number>((s, c) => s + (typeof c === 'number' ? c : 0), 0);
  const diferencia = typeof precioC === 'number' ? precioC - suma : null;
  const confirmado = evento?.estado === 'confirmado';

  const ponerPlazos = (tipo: 'unico' | 'senal') => {
    if (plazos.some((p) => p.cobrado)) return;
    const total = typeof precioC === 'number' ? precioC : null;
    setPlazos(
      tipo === 'unico'
        ? [{ key: nueva(), nombre: 'Pago', importe: total !== null ? aEuros(total) : '', cobrado: null }]
        : [
            { key: nueva(), nombre: 'Señal', importe: '', cobrado: null },
            { key: nueva(), nombre: 'Resto', importe: total !== null ? aEuros(total) : '', cobrado: null },
          ]
    );
  };
  /** El último plazo pendiente se queda con lo que falta para el precio. */
  const ajustarUltimo = () => {
    if (typeof precioC !== 'number') return;
    const idx = [...plazos].map((p, i) => [p, i] as const).reverse().find(([p]) => !p.cobrado)?.[1];
    if (idx === undefined) return;
    const otros = plazos.reduce((s, p, i) => s + (i === idx ? 0 : (parseEurosToCents(p.importe) as number) || 0), 0);
    const resto = precioC - otros;
    if (resto <= 0) return;
    setPlazos((ps) => ps.map((p, i) => (i === idx ? { ...p, importe: aEuros(resto) } : p)));
  };

  const mover = <T,>(lista: T[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return lista;
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  };

  const validar = (): DatosEvento | string => {
    if (!nombre.trim()) return 'Escribe el nombre del evento.';
    if (!fecha) return 'Elige la fecha del evento.';
    const pers = personas.trim() ? Number(personas) : null;
    if (pers !== null && (!Number.isInteger(pers) || pers < 1)) return 'El número de personas tiene que ser un número entero.';
    if (typeof precioC !== 'number' || precioC <= 0) return 'Escribe el precio cerrado (por ejemplo 300 o 300,50).';
    const items: DatosEvento['items'] = [];
    for (const c of contenido) {
      if (c.tipo === 'concepto' && !c.concepto.trim() && !c.cantidad.trim()) continue;
      const cant = Number(c.cantidad);
      if (!Number.isInteger(cant) || cant < 1) return 'Cada fila del contenido necesita una cantidad entera mayor que 0.';
      if (c.tipo === 'producto') {
        if (!c.product_id) return 'Elige el producto de la carta en cada fila (o cámbiala a «Concepto»).';
        items.push({ product_id: Number(c.product_id), cantidad: cant });
      } else {
        if (!c.concepto.trim()) return 'Escribe el concepto en cada fila (por ejemplo «Barril Estrella 30 L»).';
        items.push({ concepto: c.concepto.trim(), cantidad: cant });
      }
    }
    if (plazos.length === 0) return 'Añade al menos un plazo de pago.';
    const pls: DatosEvento['plazos'] = [];
    for (const [i, p] of plazos.entries()) {
      const imp = importes[i];
      if (!p.nombre.trim()) return 'Cada plazo necesita un nombre («Señal», «Resto»…).';
      if (typeof imp !== 'number' || imp <= 0) return `Escribe el importe de «${p.nombre || 'plazo'}».`;
      pls.push({ ...(p.id ? { id: p.id } : {}), nombre: p.nombre.trim(), importe_centimos: imp });
    }
    if (suma !== precioC) return `Los plazos suman ${formatEuros(suma)} y el precio es ${formatEuros(precioC)}.`;
    return {
      nombre: nombre.trim(),
      fecha,
      hora_inicio: hora || null,
      personas: pers,
      contacto_nombre: contactoNombre.trim() || null,
      contacto_telefono: contactoTelefono.trim() || null,
      socio_id: socio || null,
      precio_centimos: precioC,
      notas: notas.trim() || null,
      items,
      plazos: pls,
    };
  };

  const guardar = async (yConfirmar: boolean) => {
    setError(null);
    const d = validar();
    if (typeof d === 'string') return setError(d);
    setSaving(yConfirmar ? 'confirmar' : 'guardar');
    const r = await guardarEvento(evento?.id ?? null, d);
    if (r.error || !r.id) {
      setSaving(null);
      return setError(r.error ?? 'No se ha podido guardar.');
    }
    if (yConfirmar) {
      const c = await confirmarEvento(r.id);
      setSaving(null);
      if (c.error) return onSaved(r.id, `Evento guardado, pero no se ha podido confirmar: ${c.error}`);
      return onSaved(r.id);
    }
    setSaving(null);
    onSaved(r.id);
  };

  return (
    <Modal open title={evento ? `Editar · ${evento.nombre}` : 'Nuevo evento'} onClose={onClose} busy={saving !== null} maxWidth="760px">
      <div className="space-y-6">
        {/* Datos */}
        <section className="space-y-4" aria-label="Datos del evento">
          <TextField label="Nombre del evento" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cumple Laura" maxLength={120} required />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            <TextField label="Hora (opcional)" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            <TextField label="Personas (aprox.)" value={personas} onChange={(e) => setPersonas(e.target.value)} inputMode="numeric" placeholder="25" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Contacto (opcional)" value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} maxLength={120} placeholder="Laura" />
            <TextField label="Teléfono (opcional)" value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} maxLength={40} inputMode="tel" placeholder="600 000 000" />
          </div>
          <div>
            <label htmlFor={idSocio} className="mb-1 block text-xs font-semibold text-carbon/80">
              ¿Es socio? (opcional)
            </label>
            <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
              <input
                type="search"
                value={buscarSocio}
                onChange={(e) => setBuscarSocio(e.target.value)}
                placeholder="Buscar por nombre o email"
                aria-label="Buscar socio"
                className={inputClass}
              />
              <select id={idSocio} value={socio} onChange={(e) => setSocio(e.target.value)} className={inputClass}>
                <option value="">No es socio / no enlazar</option>
                {socios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre ? `${u.nombre} · ${u.email}` : u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={idNotas} className="mb-1 block text-xs font-semibold text-carbon/80">
              Notas (opcional)
            </label>
            <textarea id={idNotas} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} placeholder="Zona del fondo, tarta a las 22:00…" className={`w-full rounded-r-sm border border-carbon/20 bg-white px-3 py-2 text-sm ${focusRing}`} />
          </div>
        </section>

        {/* Contenido */}
        <section aria-labelledby="ev-contenido">
          <h3 id="ev-contenido" className="font-display text-xl font-semibold text-vino">Qué incluye</h3>
          <p className="text-xs text-carbon/60">Informativo: lo que entra en el precio. No lleva precio por fila. Para lo que no está en la carta, «Concepto».</p>
          {!carta && (
            <p className="mt-2 flex items-center gap-2 text-sm text-carbon/60">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando la carta…
            </p>
          )}
          <ul className="mt-2 space-y-2">
            {contenido.map((c, i) => (
              <li key={c.key} className="rounded-r-md border border-carbon/10 bg-white p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex overflow-hidden rounded-r-sm border border-carbon/20" role="group" aria-label="Tipo de fila">
                    {(['producto', 'concepto'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={c.tipo === t}
                        onClick={() => setContenido((cs) => cs.map((x) => (x.key === c.key ? { ...x, tipo: t } : x)))}
                        className={`h-11 px-3 text-xs font-semibold ${focusRing} ${c.tipo === t ? 'bg-carbon text-white' : 'bg-white text-carbon/70'}`}
                      >
                        {t === 'producto' ? 'De la carta' : 'Concepto'}
                      </button>
                    ))}
                  </div>
                  <label className="min-w-[200px] flex-1 text-xs font-semibold text-carbon/80">
                    <span className="sr-only">{c.tipo === 'producto' ? 'Producto' : 'Concepto'}</span>
                    {c.tipo === 'producto' ? (
                      <select
                        value={c.product_id}
                        onChange={(e) => setContenido((cs) => cs.map((x) => (x.key === c.key ? { ...x, product_id: e.target.value } : x)))}
                        className={inputClass}
                      >
                        <option value="">— Elegir producto —</option>
                        {grupos.map(([cat, ps]) => (
                          <optgroup key={cat.id} label={cat.nombre}>
                            {ps.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                                {p.activo ? '' : ' (no sale en la carta)'}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={c.concepto}
                        onChange={(e) => setContenido((cs) => cs.map((x) => (x.key === c.key ? { ...x, concepto: e.target.value } : x)))}
                        maxLength={120}
                        placeholder="Barril Estrella 30 L"
                        className={inputClass}
                      />
                    )}
                  </label>
                  <label className="w-24 text-xs font-semibold text-carbon/80">
                    Cantidad
                    <input
                      value={c.cantidad}
                      onChange={(e) => setContenido((cs) => cs.map((x) => (x.key === c.key ? { ...x, cantidad: e.target.value } : x)))}
                      inputMode="numeric"
                      className={`${inputClass} mt-1 text-right`}
                    />
                  </label>
                  <div className="flex gap-1">
                    <button type="button" disabled={i === 0} onClick={() => setContenido((cs) => mover(cs, i, -1))} aria-label="Subir" className={`flex h-11 w-10 items-center justify-center rounded-r-sm border border-carbon/15 disabled:opacity-30 ${focusRing}`}>
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" disabled={i === contenido.length - 1} onClick={() => setContenido((cs) => mover(cs, i, 1))} aria-label="Bajar" className={`flex h-11 w-10 items-center justify-center rounded-r-sm border border-carbon/15 disabled:opacity-30 ${focusRing}`}>
                      <ArrowDown size={16} />
                    </button>
                    <button type="button" onClick={() => setContenido((cs) => cs.filter((x) => x.key !== c.key))} aria-label="Quitar fila" className={`flex h-11 w-10 items-center justify-center rounded-r-sm border border-carbon/15 text-carbon/60 hover:text-vino ${focusRing}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setContenido((cs) => [...cs, { key: nueva(), tipo: 'producto', product_id: '', concepto: '', cantidad: '1' }])} className={`btn-outline-vino ${focusRing}`}>
              <Plus size={16} aria-hidden="true" /> De la carta
            </button>
            <button type="button" onClick={() => setContenido((cs) => [...cs, { key: nueva(), tipo: 'concepto', product_id: '', concepto: '', cantidad: '1' }])} className={`btn-outline-vino ${focusRing}`}>
              <Plus size={16} aria-hidden="true" /> Concepto
            </button>
          </div>
        </section>

        {/* Precio y plazos */}
        <section aria-labelledby="ev-precio" className="rounded-r-md border border-piedra/60 bg-piedra-suave/30 p-4">
          <h3 id="ev-precio" className="font-display text-xl font-semibold text-vino">Precio cerrado y plazos</h3>
          <div className="mt-3 max-w-xs">
            <TextField label="Precio cerrado (€)" value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="300" required />
          </div>
          {confirmado && (
            <p className="mt-2 text-xs text-carbon/65">Evento confirmado: los plazos cobrados no se tocan; los pendientes sí (se cambian en su cuenta del TPV).</p>
          )}
          <ul className="mt-3 space-y-2">
            {plazos.map((p) => (
              <li key={p.key} className={`flex flex-wrap items-end gap-2 rounded-r-md border p-3 ${p.cobrado ? 'border-[#2f6b3f]/40 bg-[#2f6b3f]/5' : 'border-carbon/10 bg-white'}`}>
                <label className="min-w-[160px] flex-1 text-xs font-semibold text-carbon/80">
                  Plazo
                  <input
                    value={p.nombre}
                    disabled={!!p.cobrado}
                    onChange={(e) => setPlazos((ps) => ps.map((x) => (x.key === p.key ? { ...x, nombre: e.target.value } : x)))}
                    maxLength={60}
                    className={`${inputClass} mt-1 disabled:bg-carbon/5`}
                  />
                </label>
                <label className="w-36 text-xs font-semibold text-carbon/80">
                  Importe (€)
                  <input
                    value={p.importe}
                    disabled={!!p.cobrado}
                    onChange={(e) => setPlazos((ps) => ps.map((x) => (x.key === p.key ? { ...x, importe: e.target.value } : x)))}
                    inputMode="decimal"
                    className={`${inputClass} mt-1 text-right disabled:bg-carbon/5`}
                  />
                </label>
                {p.cobrado ? (
                  <span className="inline-flex h-11 items-center gap-1 rounded-r-sm px-2 text-xs font-semibold text-[#1f4a2b]">
                    <Lock size={14} aria-hidden="true" /> Cobrado · {p.cobrado}
                  </span>
                ) : (
                  <button type="button" onClick={() => setPlazos((ps) => ps.filter((x) => x.key !== p.key))} aria-label={`Quitar ${p.nombre || 'plazo'}`} className={`flex h-11 w-10 items-center justify-center rounded-r-sm border border-carbon/15 text-carbon/60 hover:text-vino ${focusRing}`}>
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPlazos((ps) => [...ps, { key: nueva(), nombre: `Plazo ${ps.length + 1}`, importe: '', cobrado: null }])} className={`btn-outline-vino ${focusRing}`}>
              <Plus size={16} aria-hidden="true" /> Plazo
            </button>
            {!plazos.some((p) => p.cobrado) && (
              <>
                <button type="button" onClick={() => ponerPlazos('unico')} className={`btn-outline-vino ${focusRing}`}>
                  Pago único
                </button>
                <button type="button" onClick={() => ponerPlazos('senal')} className={`btn-outline-vino ${focusRing}`}>
                  Señal + resto
                </button>
              </>
            )}
            <button type="button" onClick={ajustarUltimo} disabled={typeof precioC !== 'number'} className={`btn-outline-vino disabled:opacity-50 ${focusRing}`}>
              Ajustar el último a lo que falta
            </button>
          </div>
          <p
            className={`mt-3 text-sm font-semibold ${diferencia === 0 ? 'text-[#1f4a2b]' : 'text-[#7a4e00]'}`}
            aria-live="polite"
          >
            Plazos: {formatEuros(suma)}
            {diferencia === null ? '' : diferencia === 0 ? ' · Cuadra con el precio ✓' : diferencia > 0 ? ` · Faltan ${formatEuros(diferencia)}` : ` · Sobran ${formatEuros(-diferencia)}`}
          </p>
        </section>

        {error && <Notice kind="error">{error}</Notice>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={onClose} disabled={saving !== null} className={`btn-outline-vino min-h-12 flex-1 ${focusRing}`}>
            Cancelar
          </button>
          <button type="button" onClick={() => guardar(false)} disabled={saving !== null} className={`${evento?.estado === 'confirmado' ? 'btn-vino' : 'btn-outline-vino'} min-h-12 flex-1 ${focusRing}`}>
            {saving === 'guardar' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />} Guardar{!evento || evento.estado === 'borrador' ? ' borrador' : ''}
          </button>
          {(!evento || evento.estado === 'borrador') && (
            <button type="button" onClick={() => guardar(true)} disabled={saving !== null} className={`btn-vino min-h-12 flex-1 ${focusRing}`}>
              {saving === 'confirmar' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />} Guardar y confirmar
            </button>
          )}
        </div>
        {(!evento || evento.estado === 'borrador') && (
          <p className="-mt-3 text-xs text-carbon/60">Confirmar abre su cuenta en el TPV con los plazos, para poder cobrarlos.</p>
        )}
      </div>
    </Modal>
  );
}
