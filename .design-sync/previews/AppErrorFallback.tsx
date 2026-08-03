import { AppErrorFallback } from "student-nurse-planner";

/**
 * The top-level error boundary screen.
 *
 * NOTE: the PlaceMate mark is an `<img src="/placemate-mark.svg">` served by the
 * host app, so it is absent here — see `.design-sync/NOTES.md`.
 */
export function Default() {
  return (
    <AppErrorFallback
      error={new Error("Cannot read properties of undefined (reading 'netHours')")}
      resetError={() => {}}
    />
  );
}

/** With a Sentry event id, so a student can quote it when reporting the problem. */
export function WithEventId() {
  return (
    <AppErrorFallback
      error={new Error("Failed to fetch")}
      eventId="7f3c1a92e4b84d6f"
      resetError={() => {}}
    />
  );
}
