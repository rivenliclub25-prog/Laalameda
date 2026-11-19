import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Notice, SubmitButton, TextField } from '@/components/club/FormControls';
import { EtiquetaBadge } from '@/components/admin/rentabilidad/Etiqueta';
import { fetchAjustes, updateAjustes, type Ajustes } from '@/lib/rentabilidad';
import { parseNumero } from '@/lib/costes';

const aTexto = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2, useGrouping: false });

/**
 * Cortes de la escala de etiquetas (la misma del Excel). Cambiarlos solo cambia las etiquetas, no los
 * precios. El IVA no se usa: el % de ganancia va con el precio tal cual (queda para la fase R6).
 */
export function AjustesView() {
  const [cargado, setCargado] = useState(false);
  const [bueno, setBueno] = useState('');
  const [muyBueno, setMuyBueno] = useState('');
  const [excelente, setExcelente] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchAjustes().then(({ ajustes, error }) => {
      setBueno(aTexto(ajustes.escala_bueno_pct));
      setMuyBueno(aTexto(ajustes.escala_muy_bueno_pct));
      setExcelente(aTexto(ajustes.escala_excelente_pct));
      if (error) setResult({ kind: 'error', text: error });
      setCargado(true);
    });
  }, []);

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setResult(null);
    const b = parseNumero(bueno);
    const mb = parseNumero(muyBueno);
    const e = parseNumero(excelente);
    if (b === null || mb === null || e === null || !(0 < b && b < mb && mb < e && e < 100)) {
      return setResult({ kind: 'error', text: 'Los cortes tienen que ir de menor a mayor y por debajo de 100 (por ejemplo 60, 70 y 80).' });
    }
    const a: Ajustes = { escala_bueno_pct: b, escala_muy_bueno_pct: mb, escala_excelente_pct: e };
    setSaving(true);
    const r = await updateAjustes(a);
    setSaving(false);
    setResult(r.error ? { kind: 'error', text: r.error } : { kind: 'success', text: 'Ajustes guardados. Las etiquetas ya se calculan con ellos.' });
  };

  if (!cargado) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-carbon/60" role="status">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Cargando…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-xl space-y-5 rounded-r-lg border border-piedra/50 bg-white p-4 shadow-sm sm:p-5">
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-carbon/80">Escala de etiquetas (% de ganancia sobre el precio de venta)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="«Bueno» desde (%)" value={bueno} onChange={(e) => setBueno(e.target.value)} inputMode="decimal" />
          <TextField label="«Muy bueno» desde (%)" value={muyBueno} onChange={(e) => setMuyBueno(e.target.value)} inputMode="decimal" />
          <TextField label="«Excelente» desde (%)" value={excelente} onChange={(e) => setExcelente(e.target.value)} inputMode="decimal" />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-carbon/65">
          <span>Por debajo de {bueno || '—'} %:</span> <EtiquetaBadge etiqueta="bajo" />
          <span>· {bueno || '—'}–{muyBueno || '—'} %:</span> <EtiquetaBadge etiqueta="bueno" />
          <span>· {muyBueno || '—'}–{excelente || '—'} %:</span> <EtiquetaBadge etiqueta="muy_bueno" />
          <span>· desde {excelente || '—'} %:</span> <EtiquetaBadge etiqueta="excelente" />
        </p>
        <p className="mt-2 text-xs text-carbon/55">
          Cambiar la escala solo cambia las etiquetas: no toca ningún precio. Los precios se usan tal cual, como en el Excel (el IVA no se tiene en cuenta por ahora).
        </p>
      </fieldset>
      {result && <Notice kind={result.kind}>{result.text}</Notice>}
      <SubmitButton loading={saving} loadingText="Guardando…">
        Guardar ajustes
      </SubmitButton>
    </form>
  );
}
