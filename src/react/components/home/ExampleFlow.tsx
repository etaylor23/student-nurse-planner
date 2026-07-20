import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildOnboardingSteps,
  onboardingProgress,
  type OnboardingStep,
} from "../../../logic/onboarding";
import { useRepository } from "../../RepositoryContext";
import {
  useMedicationLogs,
  usePlacements,
  useProficiencies,
  useReflections,
  useRevision,
  useSelfCare,
  useShifts,
  useSkills,
} from "../../hooks";
import { btnGhostSm, card } from "../ui";

/**
 * First-run "example flow" on Home — a connected stepper that walks a new user
 * through the ideal first journey. Each step deep-links to where the action is
 * performed, and ticks itself once the real action has happened (completion is
 * derived from repository data in `logic/onboarding.ts` — no event wiring).
 *
 * Only mounted while `user.onboardingTourDismissedAt` is unset (see HomePage), so
 * the extra reads here run for onboarding users only; "Hide" persists the dismissal
 * to the synced profile and "Replay" (in Profile) clears it.
 */
export function ExampleFlow() {
  const { repo, reloadUser } = useRepository();
  const navigate = useNavigate();
  const [hiding, setHiding] = useState(false);

  const { placements } = usePlacements();
  const { shifts } = useShifts();
  const { progress: skillProgress } = useSkills();
  const { reflections } = useReflections();
  const { progress: profProgress } = useProficiencies();
  const { logs: medicationLogs } = useMedicationLogs();
  const { targets, topics, sessions } = useRevision();
  const { checkins } = useSelfCare();

  const steps = useMemo(
    () =>
      buildOnboardingSteps({
        hasPlacement: placements.length > 0,
        hasShift: shifts.length > 0,
        hasLoggedHours: shifts.some((sh) => sh.status === "COMPLETED" || sh.netHours > 0),
        hasSkillProgress: skillProgress.length > 0,
        hasReflection: reflections.length > 0,
        hasCompetencyProgress: profProgress.length > 0,
        hasMedicationLog: medicationLogs.length > 0,
        hasRevisionActivity: targets.length + topics.length + sessions.length > 0,
        hasSelfCareCheckin: checkins.length > 0,
      }),
    [
      placements,
      shifts,
      skillProgress,
      reflections,
      profProgress,
      medicationLogs,
      targets,
      topics,
      sessions,
      checkins,
    ],
  );

  const { done, total, allDone } = onboardingProgress(steps);
  const pct = Math.round((done / total) * 100);

  const core = steps.filter((s) => s.tier === "core");
  const breadth = steps.filter((s) => s.tier === "breadth");

  const dismiss = async () => {
    setHiding(true);
    try {
      await repo.updateUser({ onboardingTourDismissedAt: new Date().toISOString() });
      await reloadUser();
    } catch {
      setHiding(false); // keep it visible if the save failed
    }
  };

  const nodeCls = (step: OnboardingStep) =>
    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
    (step.done
      ? "bg-primary-600 text-white ring-4 ring-primary-50"
      : step.tier === "core"
        ? "border-2 border-primary-400 bg-primary-50 text-primary-700"
        : "border-2 border-slate-300 bg-white text-slate-500");

  const renderRow = (step: OnboardingStep, n: number, isLast: boolean) => (
    <li key={step.id} className="relative flex gap-3">
      {!isLast && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-4 top-8 w-px -translate-x-1/2 ${step.done ? "bg-primary-300" : "bg-slate-200"}`}
        />
      )}
      <span className={nodeCls(step)}>
        {step.done ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
        ) : (
          n
        )}
      </span>
      <button
        type="button"
        onClick={() => navigate(step.href)}
        className="group mb-4 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span className="min-w-0">
          <span
            className={`block truncate text-sm font-medium ${step.done ? "text-slate-400 line-through decoration-slate-300" : step.tier === "core" ? "text-ink" : "text-slate-700"}`}
          >
            {step.label}
          </span>
          <span className="block truncate text-xs text-slate-400">
            {step.done ? "Done" : step.hint}
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary-500"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
    </li>
  );

  return (
    <section className={card} aria-label="Getting started">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
            Getting started
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">
            {allDone ? "You've found your way around 🎉" : "Your first steps"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            {allDone
              ? "Nice one — that's the whole loop. Hide this whenever you're ready."
              : "A quick tour of what PlaceMate does. Tap a step to try it — each ticks off once you've done it for real."}
          </p>
        </div>
        <button type="button" onClick={dismiss} disabled={hiding} className={btnGhostSm}>
          {allDone ? "Done" : "Hide"}
        </button>
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>
            {done} of {total} done
          </span>
          <span className="text-primary-600">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stepper */}
      <div className="mt-6 space-y-6">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            The everyday loop
          </p>
          <ol>{core.map((s, i) => renderRow(s, i + 1, i === core.length - 1))}</ol>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Explore more
          </p>
          <ol>{breadth.map((s, i) => renderRow(s, core.length + i + 1, i === breadth.length - 1))}</ol>
        </div>
      </div>
    </section>
  );
}
