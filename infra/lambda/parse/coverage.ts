import type { ClassifiedBlock } from "./schema";

/**
 * Coverage guard: no region of the page may silently vanish.
 *
 * Measured on the real medication-notes photo: the classifier returned **3 blocks from 5
 * regions**. The `co-trimoxazole` note — a whole drug, nine lines of it — and the page header
 * were simply absent, and a fourth block was dropped by the invented-text guard because the
 * model had reworded it instead of copying. The student would have been shown a page of their
 * own notes with a drug missing, and nothing would have said so.
 *
 * This is a GUARD, not a prompt tweak, deliberately: prompts have already been measured
 * unreliable twice in this pipeline (Appendix 3, and the reworded block above). Any region
 * whose words no block covers is re-emitted as an `UNKNOWN` block, so the worst case is a
 * student seeing an unclassified fragment they can route by hand — never losing it.
 */

/** Words that carry meaning. Ignores punctuation and case so reflowing can't fool the check. */
function contentWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * How much of `region` appears anywhere in `covered`?
 *
 * Word-set containment rather than substring, because the classifier legitimately splits a
 * region across two blocks and reflows line breaks (P26) — a substring test would report a
 * correctly-handled region as lost.
 */
function coverageRatio(region: string, covered: Set<string>): number {
  const words = contentWords(region);
  if (words.length === 0) return 1; // nothing to lose
  const hits = words.filter((w) => covered.has(w)).length;
  return hits / words.length;
}

/**
 * A region is "covered" once most of its words appear in some block. 0.7 rather than 1.0
 * because the sanitiser legitimately changes the odd word (a corrected drug name) and the
 * classifier may drop a stray artefact; requiring every word would re-emit regions that were
 * in fact handled, which is its own kind of noise.
 */
export const COVERAGE_THRESHOLD = 0.7;

export interface CoverageResult {
  blocks: ClassifiedBlock[];
  /** Region indices that had to be recovered — worth a metric, and worth logging. */
  recovered: number[];
}

/**
 * Append an `UNKNOWN` block for every region the classifier's output doesn't account for.
 *
 * Recovered blocks carry no target and no codes on purpose: the classifier either couldn't
 * place this text or invented a version of it, so pretending to know where it belongs would
 * be worse than admitting the gap. `UNKNOWN` is retypeable in review (P34).
 */
export function ensureRegionsCovered(
  blocks: ClassifiedBlock[],
  regions: string[],
): CoverageResult {
  const covered = new Set(blocks.flatMap((b) => contentWords(b.text)));
  const recovered: number[] = [];
  const out = [...blocks];

  regions.forEach((region, i) => {
    if (coverageRatio(region, covered) >= COVERAGE_THRESHOLD) return;
    recovered.push(i);
    out.push({
      fromRegions: [i],
      text: region,
      kind: "UNKNOWN",
      candidateCodes: [],
      tags: [],
    });
  });

  return { blocks: out, recovered };
}
