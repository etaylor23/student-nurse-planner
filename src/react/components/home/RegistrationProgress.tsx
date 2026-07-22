import { Link } from "react-router-dom";
import { formatHumanDate } from "../../../logic/calendar";
import { progressByProficiency, statusOf, surfaceGaps } from "../../../logic/proficiencies";
import { summariseSkills } from "../../../logic/skills";
import { useProficiencies, useShifts, useSkills } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { card } from "../ui";

/**
 * "Toward registration" — the one momentum-framed narrative of how far the student
 * is (ethos D6: Home answers "how far to registration?" alongside "what now?", with
 * no separate screen). Three real dimensions — practice hours, NMC competencies and
 * clinical skills — set against the programme part and target date, with a gentle
 * pace estimate. Tone is momentum, never deficit (D7): no red "behind", progress is
 * framed as what's building and what you could do next.
 *
 * Everything is derived from existing records; nothing is stored here.
 */
function Meter({
  label,
  value,
  caption,
  pct,
  to,
}: {
  label: string;
  value: string;
  caption: string;
  pct: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 transition hover:ring-primary-200"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span
          aria-hidden="true"
          className="text-xs text-slate-300 transition group-hover:text-primary-500"
        >
          →
        </span>
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-slate-400">{caption}</div>
    </Link>
  );
}

export function RegistrationProgress() {
  const { user } = useRepository();
  const { summary, projection } = useShifts();
  const { proficiencies, progress: profProgress, evidenceLinks } = useProficiencies();
  const { skills, progress: skillProgress } = useSkills();

  if (!user) return null;

  // Hours.
  const hoursPct = Math.round(summary.progressFraction * 100);

  // Competencies: self-assessed achievement, evidence gathered, and real PAD sign-offs.
  const byProf = progressByProficiency(profProgress);
  const profTotal = proficiencies.length;
  const profAchieved = proficiencies.filter((p) => statusOf(p.id, byProf) === "ACHIEVED").length;
  const evidencedIds = new Set(evidenceLinks.map((l) => l.proficiencyId));
  const profEvidenced = evidencedIds.size;
  const profSignedOff = profProgress.filter((p) => p.padSignedOff).length;
  const profPct = profTotal === 0 ? 0 : Math.round((profAchieved / profTotal) * 100);
  // "Ready to take to your assessor": evidence gathered, but not yet signed off in the PAD.
  const readyToSignOff = proficiencies.filter(
    (p) => evidencedIds.has(p.id) && !byProf.get(p.id)?.padSignedOff,
  ).length;

  // Skills (these carry a real, permanent sign-off).
  const skillsSummary = summariseSkills(skills, skillProgress);
  const skillsPct =
    skillsSummary.total === 0
      ? 0
      : Math.round((skillsSummary.signedOff / skillsSummary.total) * 100);

  // The most useful next move, framed as an offer (never a deficit alarm).
  const gaps = surfaceGaps(proficiencies, profProgress, user);
  const topGap = gaps[0];

  const targetDate = user.targetRegistrationDate
    ? formatHumanDate(user.targetRegistrationDate)
    : null;

  return (
    <section className={card} aria-label="Toward registration">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary-600">
            Toward registration
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">
            You're in part {user.currentPart} of {user.totalParts}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Every shift you capture builds your hours, competency evidence and skills record — all
            heading for the NMC register.
          </p>
        </div>
        {targetDate && (
          <div className="text-right">
            <div className="text-xs font-medium text-slate-500">Aiming for</div>
            <div className="text-sm font-semibold text-ink">{targetDate}</div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Meter
          label="Practice hours"
          value={`${summary.practiceHours} / ${summary.targetHours.toLocaleString()} h`}
          caption={`${hoursPct}% of the way there`}
          pct={hoursPct}
          to="/placement-hours"
        />
        <Meter
          label="NMC competencies"
          value={`${profAchieved} / ${profTotal} achieved`}
          caption={
            profSignedOff > 0
              ? `${profSignedOff} signed off in PAD · ${profEvidenced} evidenced`
              : `${profEvidenced} with evidence gathered`
          }
          pct={profPct}
          to="/competencies"
        />
        <Meter
          label="Clinical skills"
          value={`${skillsSummary.signedOff} / ${skillsSummary.total} signed off`}
          caption={
            skillsSummary.inProgress > 0
              ? `${skillsSummary.inProgress} on the go`
              : "a permanent record"
          }
          pct={skillsPct}
          to="/skills"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {projection.finishDate && (
          <p className="text-sm text-slate-500">
            At your recent pace, that's around{" "}
            <span className="font-medium text-ink">{formatHumanDate(projection.finishDate)}</span>.
          </p>
        )}
        {readyToSignOff > 0 && (
          <Link
            to="/competencies/ready"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100/70"
          >
            {readyToSignOff === 1
              ? "1 competency ready to take to your assessor"
              : `${readyToSignOff} competencies ready to take to your assessor`}
            <span aria-hidden="true">→</span>
          </Link>
        )}
        {topGap && (
          <Link
            to="/competencies/gaps"
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary-50 px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-100 transition hover:bg-secondary-100/70"
          >
            {gaps.length === 1
              ? `1 competency you could evidence next: ${topGap.proficiency.code}`
              : `${gaps.length} competencies you could evidence next`}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </section>
  );
}
