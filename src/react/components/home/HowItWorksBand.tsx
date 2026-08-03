import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboardingProgress, type OnboardingStep } from "../../../logic/onboarding";
import { useProficiencies, useReflections, useShifts, useSkills } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { useOnboardingSteps } from "../../useOnboardingSteps";
import { SectionHeading, btnGhostSm } from "../ui";
import { CaptureFlowDiagram, type CaptureFlowNode } from "./CaptureFlowDiagram";

/**
 * "HOW PLACEMATE WORKS" — the one band that explains the app (spec-home-redesign.md
 * decisions 5 and 8).
 *
 * The mindmap and the first-steps checklist used to be separate sibling panels making
 * the same point twice: here's how capture flows, and here's how to try it. They are
 * one story, so they are one section — the diagram is the claim, the checklist is the
 * invitation to test it.
 *
 * The lifecycle is reversible and never empty. While there are steps left, the full
 * band shows both halves with "Hide" available. Once the checklist is finished or
 * hidden it collapses to a compact mindmap-only strip carrying "Show first steps" —
 * so the map of the connected record stays on Home for everyone, and a student who
 * hid the tour early can always get it back.
 */
function useFlowNodes(): CaptureFlowNode[] {
  const { progress: skillProgress } = useSkills();
  const { summary } = useShifts();
  const { reflections } = useReflections();
  const { evidenceLinks } = useProficiencies();

  return useMemo(() => {
    const evidenced = new Set(evidenceLinks.map((l) => l.proficiencyId)).size;
    return [
      {
        key: "skills",
        label: "Clinical skills",
        sub: `${skillProgress.length} tracked`,
        desc: "Your growing clinical-skills record.",
        href: "/skills",
        dot: "var(--color-primary-600)",
      },
      {
        key: "competencies",
        label: "NMC competencies",
        sub: `${evidenced} evidenced`,
        desc: "Evidence building toward the NMC proficiencies.",
        href: "/competencies",
        dot: "var(--color-secondary-600)",
      },
      {
        key: "hours",
        label: "Practice hours",
        sub: `${summary.practiceHours} / ${summary.targetHours.toLocaleString()} h`,
        desc: "Hours counting toward your 2,300.",
        href: "/placement-hours",
        dot: "var(--color-primary-500)",
      },
      {
        key: "reflections",
        label: "Reflections",
        sub: `${reflections.length} written`,
        desc: "Turning shifts into learning.",
        href: "/reflection",
        dot: "var(--color-accent-400)",
      },
    ];
  }, [skillProgress, summary, reflections, evidenceLinks]);
}

const HUB = {
  label: "A shift",
  desc: "Every shift you work on placement.",
  href: "/planner",
};

const REGISTRATION = {
  label: "Registration",
  sub: "your PAD",
  desc: "The NMC register — where it's all heading.",
  href: "/competencies",
};

const BAND =
  "min-w-0 rounded-2xl bg-gradient-to-br from-primary-50/70 to-secondary-50/40 ring-1 ring-primary-100";

/** One checklist row: a numbered (or ticked) node, the label, and a chevron. */
function StepRow({
  step,
  n,
  isLast,
  onOpen,
}: {
  step: OnboardingStep;
  n: number;
  isLast: boolean;
  onOpen: () => void;
}) {
  const node =
    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
    (step.done
      ? "bg-primary-600 text-white ring-4 ring-primary-50"
      : step.tier === "core"
        ? "border-2 border-primary-400 bg-primary-50 text-primary-700"
        : "border-2 border-slate-300 bg-white text-slate-500");

  return (
    <li className="relative flex gap-3">
      {!isLast && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-4 top-8 w-px -translate-x-1/2 ${step.done ? "bg-primary-300" : "bg-slate-200"}`}
        />
      )}
      <span className={node}>
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
        onClick={onOpen}
        className="group mb-3 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
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
}

export function HowItWorksBand() {
  const { repo, user, reloadUser } = useRepository();
  const navigate = useNavigate();
  const nodes = useFlowNodes();
  const steps = useOnboardingSteps();
  const [busy, setBusy] = useState(false);
  /** Session-only override, so "Show first steps" also reopens a finished checklist. */
  const [reopened, setReopened] = useState(false);

  const { done, total, allDone } = onboardingProgress(steps);
  const pct = Math.round((done / total) * 100);
  const hidden = !!user?.onboardingTourDismissedAt;
  const full = reopened || (!hidden && !allDone);

  const core = steps.filter((s) => s.tier === "core");
  const breadth = steps.filter((s) => s.tier === "breadth");

  /** Persist the dismissal so the band stays collapsed across devices. */
  const hide = async () => {
    setBusy(true);
    setReopened(false);
    try {
      await repo.updateUser({ onboardingTourDismissedAt: new Date().toISOString() });
      await reloadUser();
    } catch {
      setReopened(true); // the save failed — leave it open rather than lying about it
    } finally {
      setBusy(false);
    }
  };

  /** The exact inverse of `hide` — clearing the dismissal is what makes this reversible. */
  const show = async () => {
    setReopened(true);
    if (!hidden) return;
    setBusy(true);
    try {
      await repo.updateUser({ onboardingTourDismissedAt: undefined });
      await reloadUser();
    } catch {
      /* the session override already reopened it; the next save will catch up */
    } finally {
      setBusy(false);
    }
  };

  const diagram = (
    <CaptureFlowDiagram nodes={nodes} hub={HUB} destination={REGISTRATION} compact={!full} />
  );

  // ---- Collapsed: mindmap only, with the way back in. ----
  if (!full) {
    return (
      <section className={`${BAND} p-5`} aria-label="How PlaceMate works">
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 lg:max-w-xs">
            <SectionHeading
              eyebrow="How PlaceMate works"
              title="Capture once — feed everything"
              subtitle="Log something once on a shift and it flows to everything — all heading toward registration."
              align="start"
            />
            <button type="button" onClick={show} disabled={busy} className={`${btnGhostSm} mt-3`}>
              Show first steps
            </button>
          </div>
          <div className="w-full min-w-0 lg:max-w-xl">{diagram}</div>
        </div>
      </section>
    );
  }

  // ---- Full: the diagram and the checklist, one story. ----
  return (
    <section className={`${BAND} p-6`} aria-label="How PlaceMate works">
      <SectionHeading
        eyebrow="How PlaceMate works"
        title="Capture once — feed everything"
        subtitle={
          allDone
            ? "You've found your way around — that's the whole loop. Hide this whenever you're ready."
            : "Log something once on a shift and it flows to your skills, competency evidence, hours and reflections — all heading toward registration. Try it with your first steps."
        }
        align="start"
        action={
          <button type="button" onClick={hide} disabled={busy} className={btnGhostSm}>
            {allDone ? "Done" : "Hide"}
          </button>
        }
      />

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">{diagram}</div>

        <div className="min-w-0 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span className="font-semibold text-slate-700">Your first steps</span>
            <span>
              {done} of {total} done · <span className="text-primary-600">{pct}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Tap a step to try it — each ticks off once you&apos;ve done it for real.
          </p>

          <div className="mt-4 space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                The everyday loop
              </p>
              <ol>
                {core.map((s, i) => (
                  <StepRow
                    key={s.id}
                    step={s}
                    n={i + 1}
                    isLast={i === core.length - 1}
                    onOpen={() => navigate(s.href)}
                  />
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Explore more
              </p>
              <ol>
                {breadth.map((s, i) => (
                  <StepRow
                    key={s.id}
                    step={s}
                    n={core.length + i + 1}
                    isLast={i === breadth.length - 1}
                    onOpen={() => navigate(s.href)}
                  />
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
