/**
 * First-run onboarding "example flow" — the ideal first journey through PlaceMate.
 *
 * Completion is DERIVED from whether the user has actually done each thing (real
 * data exists), computed on Home from the existing repository hooks — no per-feature
 * event wiring. Seeded baseline lists (skills / proficiencies / subjects) are
 * excluded; only user-generated records (progress, logs, sessions, reflections,
 * placements, shifts) count as "done".
 *
 * Two tiers: `core` is the everyday capture loop (shown first, emphasised); `breadth`
 * rounds out the rest of the app.
 */

export type OnboardingTier = "core" | "breadth";

export interface OnboardingStep {
  id: string;
  label: string;
  hint: string;
  /** react-router path the step deep-links to (the section's main page). */
  href: string;
  tier: OnboardingTier;
  done: boolean;
}

/** Booleans derived from the user's real data — see `ExampleFlow`. */
export interface OnboardingSignals {
  hasPlacement: boolean;
  hasShift: boolean;
  hasLoggedHours: boolean;
  hasSkillProgress: boolean;
  hasReflection: boolean;
  hasCompetencyProgress: boolean;
  hasMedicationLog: boolean;
  hasRevisionActivity: boolean;
  hasSelfCareCheckin: boolean;
}

export function buildOnboardingSteps(s: OnboardingSignals): OnboardingStep[] {
  return [
    // Core — the everyday capture loop.
    {
      id: "placement",
      tier: "core",
      href: "/placement-hours",
      label: "Add your first placement",
      hint: "Where you're on shift",
      done: s.hasPlacement,
    },
    {
      id: "shift",
      tier: "core",
      href: "/planner",
      label: "Plan a shift",
      hint: "Block it out on the planner",
      done: s.hasShift,
    },
    {
      id: "hours",
      tier: "core",
      href: "/placement-hours",
      label: "Log your hours",
      hint: "Count them towards your 2,300",
      done: s.hasLoggedHours,
    },
    {
      id: "skill",
      tier: "core",
      href: "/skills",
      label: "Track a clinical skill",
      hint: "Capture it while it's fresh",
      done: s.hasSkillProgress,
    },
    {
      id: "reflection",
      tier: "core",
      href: "/reflection",
      label: "Write a reflection",
      hint: "Turn a shift into learning",
      done: s.hasReflection,
    },
    // Breadth — explore the rest.
    {
      id: "competency",
      tier: "breadth",
      href: "/competencies",
      label: "Check an NMC proficiency",
      hint: "See where your evidence is building",
      done: s.hasCompetencyProgress,
    },
    {
      id: "medication",
      tier: "breadth",
      href: "/medications",
      label: "Make a medication note",
      hint: "Build your own drug reference",
      done: s.hasMedicationLog,
    },
    {
      id: "revision",
      tier: "breadth",
      href: "/revision",
      label: "Plan some revision",
      hint: "Stay on top of the theory",
      done: s.hasRevisionActivity,
    },
    {
      id: "selfcare",
      tier: "breadth",
      href: "/self-care",
      label: "Do a self-care check-in",
      hint: "Look after yourself, too",
      done: s.hasSelfCareCheckin,
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]): {
  done: number;
  total: number;
  allDone: boolean;
} {
  const done = steps.filter((x) => x.done).length;
  return { done, total: steps.length, allDone: steps.length > 0 && done === steps.length };
}
