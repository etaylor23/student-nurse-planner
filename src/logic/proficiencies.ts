import type { Proficiency, ProficiencyProgress, ProficiencyStatus, User } from "../domain/types";

/**
 * Pure derivation for the NMC competency tracker: status lookup, platform/annexe
 * roll-ups, and gap surfacing. View shapes live here beside the logic, not in the
 * entity model (see spec-architecture.md → Data reuse).
 */

/** A proficiency with no progress row is treated as not yet achieved. */
export const DEFAULT_STATUS: ProficiencyStatus = "NOT_YET_ACHIEVED";

/** Index progress rows by proficiency id for O(1) status lookup. */
export function progressByProficiency(
  progress: ProficiencyProgress[],
): Map<string, ProficiencyProgress> {
  return new Map(progress.map((p) => [p.proficiencyId, p]));
}

export function statusOf(
  proficiencyId: string,
  byProf: Map<string, ProficiencyProgress>,
): ProficiencyStatus {
  return byProf.get(proficiencyId)?.status ?? DEFAULT_STATUS;
}

/** The group a proficiency rolls up into: "1".."7" for platforms, "A"/"B" for annexes. */
export function groupKeyOf(p: Proficiency): string {
  return p.annexe === "NONE" ? String(p.platform) : p.annexe;
}

/** A platform / annexe roll-up card on the overview. */
export interface PlatformSummary {
  key: string; // "1".."7" | "A" | "B"
  platform: number; // 1..7, or 0 for an annexe group
  annexe: "NONE" | "A" | "B";
  title: string;
  total: number;
  achieved: number;
  developing: number;
  notYetAchieved: number;
  percentAchieved: number; // 0..100, rounded
}

const GROUP_TITLE_OVERRIDE: Record<string, string> = {
  A: "Annexe A · Communication skills",
  B: "Annexe B · Nursing procedures",
};

/**
 * Roll proficiencies up into the 7 platform cards + Annexe A/B, with per-status
 * counts and % achieved. Ordered: platforms 1..7, then Annexe A, then Annexe B.
 * Pure.
 */
export function summarisePlatforms(
  proficiencies: Proficiency[],
  progress: ProficiencyProgress[],
): PlatformSummary[] {
  const byProf = progressByProficiency(progress);
  const groups = new Map<string, PlatformSummary>();
  for (const p of proficiencies) {
    const key = groupKeyOf(p);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        platform: p.annexe === "NONE" ? p.platform : 0,
        annexe: p.annexe,
        title: GROUP_TITLE_OVERRIDE[key] ?? p.platformTitle,
        total: 0,
        achieved: 0,
        developing: 0,
        notYetAchieved: 0,
        percentAchieved: 0,
      };
      groups.set(key, g);
    }
    g.total += 1;
    const status = statusOf(p.id, byProf);
    if (status === "ACHIEVED") g.achieved += 1;
    else if (status === "DEVELOPING") g.developing += 1;
    else g.notYetAchieved += 1;
  }
  const list = [...groups.values()];
  for (const g of list) {
    g.percentAchieved = g.total === 0 ? 0 : Math.round((g.achieved / g.total) * 100);
  }
  return list.sort(sortGroups);
}

/** Platforms 1..7 first (numeric), then Annexe A, then Annexe B. */
function sortGroups(a: PlatformSummary, b: PlatformSummary): number {
  const rank = (g: PlatformSummary) =>
    g.annexe === "NONE" ? g.platform : g.annexe === "A" ? 100 : 101;
  return rank(a) - rank(b);
}

/**
 * Is this proficiency an outstanding gap for the student's current stage?
 * Per spec-architecture.md: not achieved AND
 *   - if a target part is set: that part has been reached (`targetPart <= currentPart`);
 *   - otherwise: the student is in their final part (`currentPart === totalParts`).
 */
export function isGap(progress: ProficiencyProgress | undefined, user: User): boolean {
  const status = progress?.status ?? DEFAULT_STATUS;
  if (status === "ACHIEVED") return false;
  if (progress?.targetPart != null) return progress.targetPart <= user.currentPart;
  return user.currentPart === user.totalParts;
}

/**
 * A gap is "escalating" when the deadline is imminent: a target part equal to the
 * current part, or (untagged) the student is in their final part and it's still not
 * even developing. Used to colour/raise the most urgent gaps.
 */
export function isEscalating(progress: ProficiencyProgress | undefined, user: User): boolean {
  if (!isGap(progress, user)) return false;
  if (progress?.targetPart != null) return progress.targetPart === user.currentPart;
  return (progress?.status ?? DEFAULT_STATUS) === "NOT_YET_ACHIEVED";
}

export interface GapItem {
  proficiency: Proficiency;
  progress?: ProficiencyProgress;
  status: ProficiencyStatus;
  escalating: boolean;
}

const STATUS_RANK: Record<ProficiencyStatus, number> = {
  NOT_YET_ACHIEVED: 0,
  DEVELOPING: 1,
  ACHIEVED: 2,
};

/**
 * The student's outstanding gaps, most urgent first: escalating before the rest,
 * then not-yet-achieved before developing, then by the proficiency's natural order.
 * Pure.
 */
export function surfaceGaps(
  proficiencies: Proficiency[],
  progress: ProficiencyProgress[],
  user: User,
): GapItem[] {
  const byProf = progressByProficiency(progress);
  const gaps: GapItem[] = [];
  for (const p of proficiencies) {
    const pr = byProf.get(p.id);
    if (!isGap(pr, user)) continue;
    gaps.push({
      proficiency: p,
      progress: pr,
      status: pr?.status ?? DEFAULT_STATUS,
      escalating: isEscalating(pr, user),
    });
  }
  return gaps.sort((a, b) => {
    if (a.escalating !== b.escalating) return a.escalating ? -1 : 1;
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return a.proficiency.orderIndex - b.proficiency.orderIndex;
  });
}

/** Overall % achieved across every proficiency (for the page hero metric). */
export function overallPercentAchieved(
  proficiencies: Proficiency[],
  progress: ProficiencyProgress[],
): number {
  if (proficiencies.length === 0) return 0;
  const byProf = progressByProficiency(progress);
  const achieved = proficiencies.filter((p) => statusOf(p.id, byProf) === "ACHIEVED").length;
  return Math.round((achieved / proficiencies.length) * 100);
}

/** How many evidence links each proficiency has (for at-a-glance badges). */
export function evidenceCountByProficiency(
  links: { proficiencyId: string }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of links) m.set(l.proficiencyId, (m.get(l.proficiencyId) ?? 0) + 1);
  return m;
}

/**
 * Proficiencies whose competence is demonstrated by drug-calculation numeracy:
 * 4.14 ("accuracy when calculating dosages") and Annexe B11.4 ("undertake accurate
 * drug calculations"). The calc-practice stats surface against these.
 */
export const DRUG_CALC_PROFICIENCY_CODES = ["4.14", "B11.4"] as const;
export function isDrugCalcProficiency(code: string): boolean {
  return (DRUG_CALC_PROFICIENCY_CODES as readonly string[]).includes(code);
}

/** Case-insensitive match of a search term against a proficiency's code + statement. */
export function matchesQuery(p: Proficiency, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return p.code.toLowerCase().includes(q) || p.statement.toLowerCase().includes(q);
}
