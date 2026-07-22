import { Link } from "react-router-dom";
import type { Shift } from "../../../domain/types";
import { shiftContribution } from "../../../logic/contributions";
import {
  useMedicationLogs,
  useProficiencies,
  useReflections,
  useShifts,
  useSkills,
} from "../../hooks";

/**
 * "What this shift counts toward" — the derived contribution summary that makes a
 * shift a first-class spine unit (ethos D9). Shown at the top of the shift's own
 * tab so the shift always carries what it fed: hours banked, proficiencies it
 * evidences, and the skills / reflections / meds captured on it — each a
 * deep-link into that capture tab. Nothing is stored here; it's all derived from
 * existing records (see `logic/contributions.ts`).
 */
export function ShiftContributionSummary({ shift }: { shift: Shift }) {
  const { summary } = useShifts();
  const { evidenceLinks } = useProficiencies();
  const { progress: skillProgress } = useSkills();
  const { reflections } = useReflections();
  const { logs } = useMedicationLogs();

  const c = shiftContribution(shift, {
    evidenceLinks,
    skillProgress,
    reflections,
    medLogs: logs,
  });

  const base = `/planner/${shift.id}`;

  // A bare planned shift with nothing yet: a gentle, momentum-framed offer.
  if (c.isEmpty) {
    return (
      <div className="mb-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
        <p className="text-sm font-medium text-slate-700">This shift is ready to count</p>
        <p className="mt-0.5 text-sm text-slate-500">
          {shift.status === "COMPLETED"
            ? "Capture a skill, reflection, medication or evidence below — each one counts toward your PAD."
            : "Mark it worked when you've done it, then capture what you did — it all counts toward your hours and PAD."}
        </p>
      </div>
    );
  }

  const items: { key: string; value: number; label: string; to?: string }[] = [
    {
      key: "prof",
      value: c.proficienciesEvidenced,
      label: c.proficienciesEvidenced === 1 ? "proficiency evidenced" : "proficiencies evidenced",
      to: `${base}/competencies`,
    },
    {
      key: "skills",
      value: c.skills,
      label: c.skills === 1 ? "skill" : "skills",
      to: `${base}/skills`,
    },
    {
      key: "refl",
      value: c.reflections,
      label: c.reflections === 1 ? "reflection" : "reflections",
      to: `${base}/reflection`,
    },
    {
      key: "meds",
      value: c.medLogs,
      label: c.medLogs === 1 ? "medication" : "medications",
      to: `${base}/medications`,
    },
  ];

  return (
    <div className="mb-5 rounded-xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        What this shift counts toward
      </p>

      <div className="mt-2.5 flex flex-wrap items-stretch gap-2">
        {/* Hours — the shift's own counted hours (once worked). */}
        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-100">
          <div className="text-lg font-semibold tabular-nums text-ink">
            {c.counted ? `${c.netHours} h` : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {c.counted ? `of ${summary.targetHours.toLocaleString()} h counted` : "not yet worked"}
          </div>
        </div>

        {items.map((item) =>
          item.value > 0 && item.to ? (
            <Link
              key={item.key}
              to={item.to}
              className="group rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-100 transition hover:ring-emerald-300"
            >
              <div className="flex items-baseline gap-1 text-lg font-semibold tabular-nums text-ink">
                {item.value}
                <span
                  aria-hidden="true"
                  className="text-sm text-slate-300 transition group-hover:text-emerald-600"
                >
                  →
                </span>
              </div>
              <div className="text-xs text-slate-500">{item.label}</div>
            </Link>
          ) : null,
        )}
      </div>
    </div>
  );
}
