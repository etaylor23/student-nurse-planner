import { useEffect, useState } from "react";

/**
 * True on a screen wide enough for the review lanes (spec-note-capture.md P35).
 *
 * Deliberately a JS media query rather than Tailwind's `lg:` breakpoint: the two layouts mount
 * the SAME cards, and rendering both with one hidden by CSS would give each card two copies of
 * its edit state — the text you typed in one and not the other. Only one can exist at a time.
 */
export function useWideScreen(query = "(min-width: 1024px)"): boolean {
  const [wide, setWide] = useState(() => !!window.matchMedia?.(query).matches);

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setWide(mq.matches);
    setWide(mq.matches); // catches a resize between first render and this effect
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [query]);

  return wide;
}
