import { Link } from "react-router-dom";
import { CALC_TYPE_LABEL } from "../../../domain/types";
import { summariseCalcStats } from "../../../logic/calcStats";
import { useCalcStats } from "../../hooks";
import { Panel, btnGhostSm } from "../ui";

/**
 * Shown on a drug-calculation proficiency (4.14 / B11.4): the student's calc-practice
 * accuracy as supporting evidence of numeracy competence, linking to the practice
 * screen. Read-only — practice doesn't auto-mark the proficiency.
 */
export function NumeracyPanel() {
  const { stats } = useCalcStats();
  const summary = summariseCalcStats(stats);
  const pct = Math.round(summary.total.accuracy * 100);

  return (
    <Panel title="Your numeracy" hint="Drug-calculation practice supports this proficiency">
      {summary.total.attempts === 0 ? (
        <p className="text-sm text-slate-500">
          No calc practice yet.{" "}
          <Link to="/medications/calc" className="font-medium text-emerald-700">
            Practise drug calculations
          </Link>{" "}
          to build toward this proficiency.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            <span className="text-2xl font-semibold tabular-nums text-slate-900">{pct}%</span>{" "}
            accuracy across {summary.total.attempts} attempt
            {summary.total.attempts === 1 ? "" : "s"}.
          </p>
          {summary.weakest && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
              Weakest area:{" "}
              <span className="font-semibold">{CALC_TYPE_LABEL[summary.weakest]}</span> — worth a
              few more reps.
            </p>
          )}
          <Link to="/medications/calc" className={btnGhostSm}>
            Practise more
          </Link>
        </div>
      )}
    </Panel>
  );
}
