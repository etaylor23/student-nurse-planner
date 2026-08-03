import { WorthACheck, card } from "student-nurse-planner";

/** The badge on its own — one flag for anything the app isn't sure about. */
export function Default() {
  return <WorthACheck />;
}

/**
 * Why it's shared rather than restyled per site: a low-confidence shift guess
 * and a disputed transcription look identical, so both read as "have a look".
 */
export function InContext() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-primary-800">
          Shift
        </h4>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-slate-700">
          Thu 18 Jun · long day <WorthACheck />
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          No date on the page we could match — this is just your most recent shift.
        </p>
      </div>

      <article className={`${card} !p-3`}>
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Medication <WorthACheck />
        </p>
        <p className="mt-1 text-sm leading-snug text-slate-700">
          Furosemide 40mg PO — the two readings disagreed on the dose.
        </p>
      </article>
    </div>
  );
}
