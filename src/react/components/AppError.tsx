import { btnGhost, btnPrimary, card } from "./ui";
import { Logo } from "./Logo";

const SUPPORT_EMAIL = "hello@placemate.uk";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className={`${card} w-full max-w-md`}>
        <Logo size={34} className="mb-4" />
        {children}
      </div>
    </div>
  );
}

/**
 * Fallback for the top-level Sentry.ErrorBoundary. A render crash used to white-screen the
 * whole app with no way out and no report; now the user gets a branded, recoverable screen
 * and the error is captured (in production) with an event id they can quote.
 */
export function AppErrorFallback({
  error,
  eventId,
  resetError,
}: {
  error: unknown;
  eventId?: string;
  resetError: () => void;
}) {
  const message = error instanceof Error ? error.message : String(error);
  const subject = encodeURIComponent("PlaceMate error report");
  const body = encodeURIComponent(
    `Something went wrong in PlaceMate.\n\nWhat I was doing:\n\n\n---\nError: ${message}${
      eventId ? `\nReference: ${eventId}` : ""
    }`,
  );
  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Something went wrong</h1>
      <p className="mt-3 text-sm text-slate-600">
        PlaceMate hit an unexpected error. Your saved data is safe on this device. Reloading usually
        fixes it.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={`${btnPrimary} w-full sm:w-auto`}
          onClick={() => {
            resetError();
            window.location.reload();
          }}
        >
          Reload PlaceMate
        </button>
        <a
          className={`${btnGhost} w-full sm:w-auto`}
          href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`}
        >
          Report it
        </a>
      </div>
      {eventId && <p className="mt-4 text-xs text-slate-400">Reference: {eventId}</p>}
    </Shell>
  );
}

/**
 * Shown when the browser refuses to open the local database — private-browsing modes and
 * storage-blocked profiles reject IndexedDB. Previously this left the app spinning on
 * "Loading…" forever; now it says plainly that data can't be saved here.
 */
export function StorageBlockedScreen() {
  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Can&rsquo;t save data here</h1>
      <p className="mt-3 text-sm text-slate-600">
        This browser is blocking local storage, so PlaceMate can&rsquo;t keep your data on this
        device. This usually means private/incognito browsing or a locked-down profile.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>Open PlaceMate in a normal (non-private) window, or</li>
        <li>Allow site data / cookies for this site, then reload.</li>
      </ul>
      <div className="mt-5">
        <button
          type="button"
          className={`${btnPrimary} w-full sm:w-auto`}
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Still stuck? Email{" "}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </Shell>
  );
}
