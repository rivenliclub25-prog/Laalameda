import { useEffect, useRef, useState, type FormEvent } from 'react';
import type QrScannerType from 'qr-scanner';
import { Camera, CameraOff, Loader2, ScanLine } from 'lucide-react';
import { Notice, focusRing } from '@/components/club/FormControls';
import { parseScannedCode } from '@/lib/tickets';

/**
 * Lector de QR de tickets y campo para escribir el código. Lo usan #/canjear y el TPV (promos del
 * club). qr-scanner se descarga solo al abrir la cámara.
 */

// ---------------------------------------------------------------------
// Lector QR (qr-scanner se descarga solo al abrir la cámara)
// ---------------------------------------------------------------------

function cameraErrorText(error: unknown): string {
  if (!window.isSecureContext) return 'La cámara solo funciona en páginas seguras (https). Escribe el código a mano.';
  const text = String((error as Error)?.name ?? error);
  if (/NotAllowed|Permission/i.test(text)) {
    return 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código a mano.';
  }
  if (/not found|NotFound|Overconstrained/i.test(text)) return 'No encontramos ninguna cámara. Escribe el código a mano.';
  return 'No se ha podido abrir la cámara. Escribe el código a mano.';
}

export function QrScannerBox({ paused, onScan }: { paused: boolean; onScan: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [wanted, setWanted] = useState(false); // el camarero ha abierto la cámara
  const [status, setStatus] = useState<'off' | 'starting' | 'on' | 'error'>('off');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setWanted(true);
    setStatus('starting');
    setError(null);
    try {
      const { default: QrScanner } = await import('qr-scanner');
      if (!scannerRef.current && videoRef.current) {
        scannerRef.current = new QrScanner(videoRef.current, (result) => onScanRef.current(result.data), {
          preferredCamera: 'environment',
          maxScansPerSecond: 8,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        });
      }
      await scannerRef.current?.start();
      setStatus('on');
    } catch (e) {
      console.error('[club] Cámara:', e);
      setWanted(false);
      setStatus('error');
      setError(cameraErrorText(e));
    }
  };

  const stop = () => {
    scannerRef.current?.stop();
    setWanted(false);
    setStatus('off');
  };

  // Mientras se muestra un resultado, la cámara se para; al volver, sigue sola.
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner || !wanted) return;
    if (paused) scanner.stop();
    else scanner.start().catch(() => setStatus('error'));
  }, [paused, wanted]);

  useEffect(() => () => scannerRef.current?.destroy(), []);

  return (
    <section aria-label="Lector de QR">
      <div className="relative overflow-hidden rounded-r-lg border border-piedra/50 bg-carbon shadow-md">
        {/* El vídeo nunca se oculta (ni con display ni con visibility): qr-scanner lo detecta y lo deja
            a tamaño 0 para siempre. Cuando la cámara está apagada, se tapa con el panel de encima. */}
        <video ref={videoRef} muted playsInline className="block aspect-square w-full object-cover" />
        {status !== 'on' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-carbon p-6 text-center text-marfil">
            {status === 'starting' ? (
              <>
                <Loader2 size={34} className="animate-spin text-piedra" aria-hidden="true" />
                <p className="text-sm">Abriendo la cámara…</p>
              </>
            ) : (
              <>
                <ScanLine size={46} className="text-piedra" aria-hidden="true" />
                <button type="button" onClick={start} className={`btn-gold min-h-14 px-7 text-base ${focusRing}`}>
                  <Camera size={20} aria-hidden="true" /> Abrir cámara
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {status === 'on' && (
        <div className="mt-2 flex items-center justify-between text-xs text-carbon/60">
          <span>Apunta al QR del ticket.</span>
          <button type="button" onClick={stop} className={`inline-flex items-center gap-1 rounded-r-sm font-semibold text-vino hover:underline ${focusRing}`}>
            <CameraOff size={14} aria-hidden="true" /> Cerrar cámara
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Código a mano
// ---------------------------------------------------------------------

export function ManualCodeForm({
  disabled,
  onSubmit,
  idPrefix = 'codigo-manual',
}: {
  disabled: boolean;
  onSubmit: (codigo: string) => void;
  idPrefix?: string;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const codigo = parseScannedCode(value);
    if (!codigo) {
      setError('El código son 4 letras o números (sin 0, O, 1, I ni L). Ejemplo: 7K3P.');
      return;
    }
    setError(null);
    setValue('');
    onSubmit(codigo);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 rounded-r-lg border border-piedra/50 bg-white/80 p-4 shadow-sm sm:p-5">
      <label htmlFor={idPrefix} className="mb-2 block text-sm font-semibold text-carbon/85">
        O escribe el código
      </label>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-r-sm border border-carbon/25 bg-white focus-within:border-vino focus-within:ring-1 focus-within:ring-vino/30">
          <span className="flex items-center bg-piedra-suave/70 px-3 text-lg font-bold tracking-[0.12em] text-carbon/70" aria-hidden="true">
            ALA-
          </span>
          <input
            id={idPrefix}
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase().replace(/^ALA-?/, '').slice(0, 4))}
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            placeholder="7K3P"
            aria-describedby={error ? `${idPrefix}-error` : undefined}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className="min-w-0 flex-1 px-3 py-3 text-xl font-bold uppercase tracking-[0.2em] text-carbon outline-none placeholder:text-carbon/25"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || value.length < 4}
          className={`btn-vino min-h-14 px-5 text-base disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-vino ${focusRing}`}
        >
          Comprobar
        </button>
      </div>
      {error && (
        <p id={`${idPrefix}-error`} className="mt-2 text-xs font-medium text-vino">
          {error}
        </p>
      )}
    </form>
  );
}
