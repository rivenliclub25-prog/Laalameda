interface PlaceholderProps {
  label: string;
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const roundedMap = {
  sm: 'rounded-r-sm',
  md: 'rounded-r-md',
  lg: 'rounded-r-lg',
  full: 'rounded-full',
};

export function Placeholder({ label, className = '', rounded = 'md' }: PlaceholderProps) {
  return (
    <div
      className={`placeholder-box ${roundedMap[rounded]} ${className}`.trim()}
      aria-label={`Marcador de posición — ${label}`}
    >
      <span className="pointer-events-none select-none px-3 leading-relaxed">{label}</span>
    </div>
  );
}
