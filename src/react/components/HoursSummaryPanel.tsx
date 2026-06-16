import type { HoursSummary, Projection } from "../../logic/hours";
import { PageHero, StatTile } from "./ui";

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function HoursSummaryPanel({
  summary,
  projection,
}: {
  summary: HoursSummary;
  projection?: Projection;
}) {
  const pct = Math.round(summary.progressFraction * 100);
  const target = summary.targetHours.toLocaleString();

  return (
    <PageHero
      eyebrow="Your progress"
      title="Placement hours"
      subtitle={`Counting toward ${target} practice hours. Your PAD stays the official record.`}
      aside={
        <>
          <div className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
            {summary.practiceHours}
            <span className="text-lg font-normal text-slate-400"> / {target} h</span>
          </div>
          <div className="text-sm font-medium text-emerald-600">{pct}% complete</div>
        </>
      }
    >
      <div
        className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={summary.targetHours}
        aria-valuenow={summary.practiceHours}
      >
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        >
          {/* faint top highlight = subtle gloss */}
          <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-white/25" />
        </div>
      </div>

      {projection?.shiftsToGo != null && (
        <p className="mt-2 text-xs text-slate-400">
          ≈ {projection.shiftsToGo.toLocaleString()} shifts to go
          {projection.finishDate && <> · on track for {formatMonthYear(projection.finishDate)}</>}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          dot="bg-emerald-500"
          label="Counted"
          value={`${summary.practiceHours} h`}
          sub={`${pct}% of goal`}
        />
        <StatTile
          dot="bg-slate-300"
          label="Remaining"
          value={`${summary.remainingHours} h`}
          sub="to reach goal"
        />
        <StatTile
          dot="bg-sky-500"
          label="Simulated"
          value={`${summary.simulatedHours} h`}
          sub={`${summary.simulatedRemaining} h under ${summary.simulatedCap} cap`}
        />
        <StatTile
          dot="bg-amber-500"
          label="Planned"
          value={`${summary.plannedHours} h`}
          sub="not counted yet"
        />
      </div>

      {summary.simulatedCapReached && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
          Simulated practice has reached the {summary.simulatedCap}-hour cap — extra simulated hours
          won't count toward {target}.
        </p>
      )}
    </PageHero>
  );
}
