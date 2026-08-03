import { StorageBlockedScreen } from "student-nurse-planner";

/**
 * Shown when the browser won't give PlaceMate local storage — private windows,
 * or a locked-down trust setting. The app is local-first, so this is a hard stop
 * rather than a degraded mode.
 *
 * NOTE: the PlaceMate mark is an `<img src="/placemate-mark.svg">` served by the
 * host app, so it is absent here — see `.design-sync/NOTES.md`.
 */
export function Default() {
  return <StorageBlockedScreen />;
}
