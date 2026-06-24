// Baseline clinical-skills list, DERIVED from the seeded Annexe B proficiencies
// (the national nursing-procedures baseline) — not a separate hand-maintained list.
// Deriving keeps a 1:1 mapping between a baseline skill and its Annexe B proficiency
// by code (skill `skill_B2.1` ↔ proficiency `prof_B2.1`), which the cross-screen
// "counts toward proficiency …" link and the auto-evidence-on-sign-off rely on.
// See spec-clinical-skills.md.
import type { Skill } from "../../domain/types";
import { seedProficiencies } from "./proficiencies";

/**
 * The Annexe B procedures split into two parts; we surface the part as a short,
 * readable category (the full `platformTitle` is long). Falls back to the title.
 */
function categoryForTitle(platformTitle: string): string {
  if (platformTitle.includes("Part 1")) return "Assessing needs";
  if (platformTitle.includes("Part 2")) return "Planning & managing care";
  return platformTitle;
}

/** The proficiency code a baseline skill maps to, e.g. `skill_B2.1` → `B2.1`. */
export function annexeCodeOf(skill: Skill): string | null {
  if (skill.source !== "ANNEXE_B") return null;
  return skill.id.startsWith("skill_") ? skill.id.slice("skill_".length) : null;
}

/** The proficiency id a baseline skill counts toward, e.g. `skill_B2.1` → `prof_B2.1`. */
export function annexeProficiencyIdOf(skill: Skill): string | null {
  const code = annexeCodeOf(skill);
  return code ? `prof_${code}` : null;
}

/** Built-in baseline skills (`userId: null`), one per Annexe B procedure. */
export const seedSkills: Skill[] = seedProficiencies
  .filter((p) => p.annexe === "B")
  .map((p) => ({
    id: `skill_${p.code}`,
    userId: null,
    name: p.statement,
    category: categoryForTitle(p.platformTitle),
    source: "ANNEXE_B",
    orderIndex: p.orderIndex,
  }));
