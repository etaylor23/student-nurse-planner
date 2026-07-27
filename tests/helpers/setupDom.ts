/**
 * Vitest setup. Runs for EVERY suite, so it must stay inert under the default `node`
 * environment — only `*.test.tsx` files get jsdom (see `environmentMatchGlobs`).
 */
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  // The `/vitest` entry self-registers the matchers with vitest's `expect` (and their
  // types). Doing it by hand via `/matchers` + `expect.extend` is the older recipe and
  // gets the export shape wrong: the namespace has no runtime `default`.
  const [{ cleanup }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/jest-dom/vitest"),
  ]);
  afterEach(() => cleanup());

  // jsdom implements neither, and the panel uses both: `scrollIntoView` on every new
  // turn, and `matchMedia` via the teaser's reduced-motion check.
  Element.prototype.scrollIntoView = () => {};
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
}
