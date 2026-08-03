import { ProficiencyPicker } from "student-nurse-planner";

/**
 * The escape hatch from the classifier's shortlist into the full NMC taxonomy.
 *
 * It shows nothing until asked — the picker is the exception path, not the
 * default one — so the resting state is a single quiet link.
 */
export function Closed() {
  return <ProficiencyPicker onPick={() => {}} />;
}

/**
 * In context: the shortlist the classifier suggested, with the picker beneath it
 * as the way past a suggestion that doesn't fit.
 */
export function BelowAShortlist() {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Suggested proficiencies
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 ring-1 ring-primary-100">
          B2.1
        </span>
        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
          B2.4
        </span>
        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
          3.4
        </span>
      </div>
      <ProficiencyPicker onPick={() => {}} />
    </div>
  );
}
