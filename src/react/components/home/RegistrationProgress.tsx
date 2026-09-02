import { Link } from "react-router-dom";
import { formatHumanDate } from "../../../logic/calendar";
import { progressByProficiency, statusOf } from "../../../logic/proficiencies";
import { summariseSkills } from "../../../logic/skills";
import { useProficiencies, useShifts, useSkills } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { MetricTile, SectionHeading, card } from "../ui";

/**
 * "YOUR PROGRESS" — the page's single progress story (spec-home-redesign.md decision 4,
 * and ethos D6: Home answers "how far to registration?" alongside "what now?", with no
 * separate screen). Three real dimensions — practice hours, NMC competencies and
 * clinical skills — set against the programme part, with a gentle pace estimate.
 * Tone is momentum, never deficit (D7): no red "behind", progress is framed as what's
 * building.
 *
 * Practice hours live here and nowhere else on the page. They used to appear twice —
 * a pace tile in the hero and again in this section — which split one story in two and
 * pushed the actual next action off the top of the screen. The pace bar and the
 * shifts-to-go estimate came with them into the hours tile.
 *
 * The "ready to take to your assessor" pill is this section's CTA: it's the one thing
 * on the page that turns progress into an action, so it rides with the progress rather
 * than floating among the tiles.
 *
 * Everything is derived from existing records; nothing is stored here.
 */
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

  const targetDate = user.targetRegistrationDate
    ? formatHumanDate(user.targetRegistrationDate)
    : null;

  // The hours tile absorbs what the hero's pace tile used to say.
  const hoursCaption =
    projection.shiftsToGo != null
      ? `${hoursPct}% of the way there · ≈ ${projection.shiftsToGo.toLocaleString()} shifts to go`
      : `${hoursPct}% of the way there`;

  return (
    <section className={card} aria-label="Your progress">
      <SectionHeading
        eyebrow="Your progress"
        eyebrowTone="secondary"
        title={`You're in part ${user.currentPart} of ${user.totalParts}`}
        subtitle="Every shift you capture builds your hours, competency evidence and skills record, all heading for the NMC register."
        action={
          readyToSignOff > 0 && (
            <Link
              to="/competencies/ready"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100/70"
            >
              {readyToSignOff === 1
                ? "1 competency ready to take to your assessor"
                : `${readyToSignOff} competencies ready to take to your assessor`}
              <span aria-hidden="true">→</span>
            </Link>
          )
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricTile
          label="Practice hours"
          value={`${summary.practiceHours} / ${summary.targetHours.toLocaleString()} h`}
          caption={hoursCaption}
          pct={hoursPct}
          to="/placement-hours"
        />
        <MetricTile
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
        <MetricTile
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

      {/* The long view, kept quiet: a footnote under the tiles rather than a second
          block competing with the assessor CTA for the top-right of the section. */}
      {(targetDate || projection.finishDate) && (
        <p className="mt-3 text-xs text-slate-400">
          {targetDate && (
            <>
              Aiming for <span className="font-medium text-slate-500">{targetDate}</span>.
            </>
          )}
          {targetDate && projection.finishDate && " "}
          {projection.finishDate && (
            <>
              At your recent pace, that&apos;s around{" "}
              <span className="font-medium text-slate-500">
                {formatHumanDate(projection.finishDate)}
              </span>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}
