import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';

// Mismo estilo que los inputs de ReserveModal. text-base en móvil evita el zoom automático de iOS.
const inputClass =
  'w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 font-primary text-base text-carbon outline-none transition-colors placeholder:text-carbon/40 focus:border-vino focus:ring-1 focus:ring-vino/30 disabled:bg-carbon/5 disabled:text-carbon/50 aria-[invalid=true]:border-vino sm:text-sm';

/** Anillo de foco visible solo con teclado, para enlaces y botones del club. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vino focus-visible:ring-offset-2 focus-visible:ring-offset-marfil';

/**
 * Teléfono en dos partes: país (prefijo) y número. Con «Otro país» se escribe el número completo
 * con su prefijo (+…).
 */
export function PhoneField({
  label,
  prefijos,
  otroValue,
  prefijo,
  numero,
  onPrefijo,
  onNumero,
  error,
  hint,
  disabled,
}: {
  label: string;
  prefijos: { code: string; pais: string }[];
  otroValue: string;
  prefijo: string;
  numero: string;
  onPrefijo: (value: string) => void;
  onNumero: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  const otro = prefijo === otroValue;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-carbon/80">
        {label}
      </label>
      <div className="flex gap-2">
        <label htmlFor={`${id}-prefijo`} className="sr-only">
          País (prefijo)
        </label>
        <select
          id={`${id}-prefijo`}
          value={prefijo}
          onChange={(e) => onPrefijo(e.target.value)}
          disabled={disabled}
          className={`${inputClass} w-auto max-w-[46%] shrink-0 pr-8`}
        >
          {prefijos.map((p) => (
            <option key={p.code} value={p.code}>
              {p.pais} ({p.code})
            </option>
          ))}
          <option value={otroValue}>Otro país…</option>
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete={otro ? 'tel' : 'tel-national'}
          placeholder={otro ? '+00 000 000 000' : prefijo === '+34' ? '612 345 678' : 'Número'}
          value={numero}
          onChange={(e) => onNumero(e.target.value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputClass} min-w-0 flex-1`}
        />
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-carbon/60">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-vino">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, type = 'text', className = '', ...props }: TextFieldProps) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-carbon/80">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && showPassword ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputClass} ${isPassword ? 'pr-11' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPassword}
            className={`absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-sm text-carbon/55 transition-colors hover:text-vino ${focusRing}`}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-carbon/60">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-vino">
          {error}
        </p>
      )}
    </div>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, children, error, required, disabled }: CheckboxProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-r-sm accent-vino ${focusRing}`}
        />
        <label htmlFor={id} className="cursor-pointer text-sm leading-snug text-carbon/85">
          {children}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="ml-8 mt-1 text-xs font-medium text-vino">
          {error}
        </p>
      )}
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'success' | 'error' | 'info'; children: ReactNode }) {
  const styles = {
    success: 'border-[#2f6b3f]/30 bg-[#2f6b3f]/10 text-[#1f4a2b]',
    error: 'border-vino/30 bg-vino/10 text-vino',
    info: 'border-piedra/60 bg-piedra-suave/60 text-carbon',
  }[kind];
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`animate-fade-in flex items-start gap-2.5 rounded-r-sm border px-3.5 py-3 text-sm leading-snug ${styles}`}
    >
      <Icon size={18} className="mt-px shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

interface SubmitButtonProps {
  loading: boolean;
  loadingText: string;
  children: ReactNode;
  disabled?: boolean;
}

export function SubmitButton({ loading, loadingText, children, disabled }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      aria-busy={loading}
      className={`btn-vino w-full py-3 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-vino ${focusRing}`}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto para lectores de pantalla (el interruptor no lleva texto visible). */
  label: string;
  disabled?: boolean;
}

/** Interruptor encendido/apagado (role="switch"). */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 ${focusRing} ${
        checked ? 'bg-vino' : 'bg-carbon/25'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/** Tarjeta de los formularios del club, con el estilo de las tarjetas de la web. */
export function ClubCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`animate-scale-in rounded-r-lg border border-piedra/50 bg-white/80 p-6 shadow-md sm:p-8 ${className}`}>
      {children}
    </div>
  );
}
