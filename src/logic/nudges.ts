/**
 * The single source of "what's the natural next step?" — one prioritised rule set that
 * drives the app's uniform nudge system (see `components/Nudge.tsx`). Keeping the rules
 * here (pure + testable) means every surface nudges consistently instead of each screen
 * inventing its own prompt.
 *
 * Rules are pushed in priority order; consumers take the first N.
 */
export type NudgeTone = "primary" | "accent" | "info";

export interface Nudge {
  id: string;
  message: string;
  cta: string;
  href: string;
  tone: NudgeTone;
}

export interface NudgeInputs {
  hasPlacement: boolean;
  /** id of the shift in progress right now, if any. */
  onShiftId?: string;
  hasUpcomingShift: boolean;
  /** NMC proficiencies due now (from `surfaceGaps`). */
  gapsDue: number;
  /** tracked clinical skills not yet linked to any proficiency. */
  skillsUnlinked: number;
  /** reflections not yet linked to any proficiency. */
  reflectionsUnlinked: number;
  hasSkillProgress: boolean;
  hasReflection: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function deriveNudges(i: NudgeInputs): Nudge[] {
  const out: Nudge[] = [];

  if (!i.hasPlacement) {
    out.push({
      id: "placement",
      tone: "primary",
      message: "Add your first placement — your hours, shifts and evidence all hang off it.",
      cta: "Add a placement",
      href: "/placement-hours",
    });
  }

  if (i.onShiftId) {
    out.push({
      id: "onshift",
      tone: "primary",
      message: "You're on shift — capture what you see while it's fresh.",
      cta: "Capture now",
      href: `/planner/${i.onShiftId}`,
    });
  }

  if (i.gapsDue > 0) {
    out.push({
      id: "gaps",
      tone: "accent",
      message: `${i.gapsDue} NMC ${plural(i.gapsDue, "proficiency is", "proficiencies are")} ready for you to evidence.`,
      cta: "See them",
      href: "/competencies/gaps",
    });
  }

  if (i.skillsUnlinked > 0) {
    out.push({
      id: "skill-evidence",
      tone: "info",
      message: `${i.skillsUnlinked} clinical ${plural(i.skillsUnlinked, "skill", "skills")} could count toward your PAD.`,
      cta: "Link to your PAD",
      href: "/skills",
    });
  }

  if (i.reflectionsUnlinked > 0) {
    out.push({
      id: "reflection-evidence",
      tone: "info",
      message: `${i.reflectionsUnlinked} ${plural(i.reflectionsUnlinked, "reflection could", "reflections could")} count as evidence.`,
      cta: "Link them",
      href: "/reflection",
    });
  }

  if (!i.hasSkillProgress) {
    out.push({
      id: "skill-start",
      tone: "info",
      message: "Start tracking a clinical skill while you're on placement.",
      cta: "Pick a skill",
      href: "/skills",
    });
  }

  if (!i.hasReflection) {
    out.push({
      id: "reflection-start",
      tone: "info",
      message: "Turn a shift into learning with your first reflection.",
      cta: "New reflection",
      href: "/reflection/new",
    });
  }

  if (!i.onShiftId && !i.hasUpcomingShift) {
    out.push({
      id: "plan-shift",
      tone: "info",
      message: "Plan your next shift so your hours keep counting.",
      cta: "Open the planner",
      href: "/planner",
    });
  }

  return out;
}
