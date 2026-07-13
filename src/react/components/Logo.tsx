/**
 * Placemate logo lockup — the heart-pin mark (place + care) next to the lowercase
 * wordmark ("place" in ink, "mate" in the emerald primary). The mark art is the shared
 * asset at /placemate-mark.svg (also the source for the favicon + marketing site).
 *
 * `showWordmark={false}` renders just the mark (compact spots). `size` drives the mark
 * dimensions; the wordmark scales with it.
 */
export function Logo({
  className = "",
  size = 32,
  showWordmark = true,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/placemate-mark.svg"
        alt=""
        aria-hidden="true"
        className="shrink-0"
        style={{ height: size, width: size }}
      />
      {showWordmark && (
        <span
          className="font-extrabold lowercase tracking-tight"
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          <span className="text-ink">place</span>
          <span className="text-primary-600">mate</span>
        </span>
      )}
    </span>
  );
}
