import type { Skill, SkillProgress, SkillStage } from "../domain/types";

/**
 * Pure derivation for the clinical-skills tracker: progress lookup, category
 * grouping, search/stage filtering and roll-up counts. View shapes live here beside
 * the logic, not in the entity model (see spec-architecture.md → Data reuse).
 */

/** Index progress rows by skill id for O(1) lookup. */
export function progressBySkill(progress: SkillProgress[]): Map<string, SkillProgress> {
  return new Map(progress.map((p) => [p.skillId, p]));
}

/** The current stage of a skill, or `null` when the student hasn't started it. */
export function skillStageOf(progress: SkillProgress | undefined): SkillStage | null {
  return progress?.stage ?? null;
}

/** Skills grouped by category, preserving the incoming (orderIndex) order. */
export interface SkillGroup {
  category: string;
  skills: Skill[];
}
export function groupSkillsByCategory(skills: Skill[]): SkillGroup[] {
  const groups = new Map<string, Skill[]>();
  for (const s of skills) {
    const list = groups.get(s.category);
    if (list) list.push(s);
    else groups.set(s.category, [s]);
  }
  return [...groups.entries()].map(([category, list]) => ({ category, skills: list }));
}

/** The distinct categories in first-appearance order (for the custom-skill picker). */
export function skillCategories(skills: Skill[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    if (!seen.has(s.category)) {
      seen.add(s.category);
      out.push(s.category);
    }
  }
  return out;
}

/** Case-insensitive match of a search term against a skill's name + category. */
export function skillMatchesQuery(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return skill.name.toLowerCase().includes(q) || skill.category.toLowerCase().includes(q);
}

/** The list view's stage/sign-off filter chips. */
export type SkillFilter = "ALL" | SkillStage | "SIGNED_OFF";

/**
 * Does a skill (via its progress) match the active filter? "Signed off" matches the
 * permanent flag; a stage matches the current stage exactly (an unstarted skill —
 * no progress row — matches only "All").
 */
export function skillMatchesFilter(
  progress: SkillProgress | undefined,
  filter: SkillFilter,
): boolean {
  if (filter === "ALL") return true;
  if (filter === "SIGNED_OFF") return progress?.signedOff === true;
  return progress?.stage === filter;
}

/** Roll-up counts for the page hero. */
export interface SkillsSummary {
  total: number;
  signedOff: number;
  inProgress: number; // has a stage recorded but not yet signed off
}
export function summariseSkills(skills: Skill[], progress: SkillProgress[]): SkillsSummary {
  const bySkill = progressBySkill(progress);
  let signedOff = 0;
  let inProgress = 0;
  for (const s of skills) {
    const p = bySkill.get(s.id);
    if (p?.signedOff) signedOff += 1;
    else if (p) inProgress += 1;
  }
  return { total: skills.length, signedOff, inProgress };
}
