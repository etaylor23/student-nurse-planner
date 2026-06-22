import { Link } from "react-router-dom";
import { PLATFORM_DESCRIPTIONS } from "../../../data/seed/proficiencies";
import { summarisePlatforms } from "../../../logic/proficiencies";
import { useProficiencies } from "../../hooks";
import { Panel } from "../ui";
import { ProgressBar, SourceCredit } from "./shared";

/** Platform overview — 7 platform cards + Annexe A/B, each with % achieved. */
export function PlatformOverviewPage() {
  const { proficiencies, progress } = useProficiencies();
  const summaries = summarisePlatforms(proficiencies, progress);

  if (proficiencies.length === 0) {
    return (
      <Panel title="Proficiencies">
        <p className="text-sm text-slate-400">Loading the proficiency list…</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaries.map((g) => (
          <Link
            key={g.key}
            to={`/competencies/platform/${g.key}`}
            className="group min-w-0 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-28px_rgba(16,24,40,0.22)] transition hover:ring-emerald-200"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                {g.annexe === "NONE" ? `Platform ${g.platform}` : `Annexe ${g.annexe}`}
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {g.percentAchieved}%
              </span>
            </div>
            <h3 className="mt-1 text-sm font-semibold text-slate-800 group-hover:text-emerald-700">
              {g.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">
              {PLATFORM_DESCRIPTIONS[g.key]}
            </p>
            <div className="mt-3">
              <ProgressBar percent={g.percentAchieved} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {g.achieved}/{g.total} achieved
              {g.developing > 0 ? ` · ${g.developing} developing` : ""}
            </p>
          </Link>
        ))}
      </div>

      <Panel title="About this list" hint="Where these statements come from">
        <SourceCredit />
      </Panel>
    </div>
  );
}
