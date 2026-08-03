import { Logo } from "student-nurse-planner";

/**
 * The full lockup: heart-pin mark plus the lowercase wordmark, "place" in ink
 * and "mate" in the emerald primary.
 *
 * NOTE: the mark is an `<img src="/placemate-mark.svg">` served by the host app.
 * The design system doesn't ship that asset, so the mark is absent here and the
 * wordmark carries the lockup. See `.design-sync/NOTES.md`.
 */
export function Default() {
  return <Logo />;
}

/** `size` drives the mark; the wordmark scales with it. */
export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-8">
      <Logo size={24} />
      <Logo size={32} />
      <Logo size={48} />
    </div>
  );
}

/** In context: the lockup as it sits in the app's top bar. */
export function InHeader() {
  return (
    <header className="flex items-center justify-between rounded-2xl bg-white px-5 py-3.5 ring-1 ring-slate-200/70">
      <Logo size={30} />
      <nav className="flex items-center gap-5 text-sm font-medium text-slate-500">
        <span className="text-primary-700">Planner</span>
        <span>Shifts</span>
        <span>Reflections</span>
      </nav>
    </header>
  );
}
