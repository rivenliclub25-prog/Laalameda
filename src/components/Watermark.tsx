export function Watermark() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[26vh] min-h-[160px] opacity-[0.03] text-[#8a6b3f]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 1200 320" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
        <use href="#salamanca-skyline" x="0" width="600" height="320" />
        <use href="#salamanca-skyline" x="600" width="600" height="320" />
      </svg>
    </div>
  );
}
