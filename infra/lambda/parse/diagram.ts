import type { ClassifiedBlock, Correction, VisionBlock } from "./schema";
import { applyCorrections } from "./sanitise";

/**
 * The vision model's DIAGRAM nomination — the PRIMARY one (P43).
 *
 * The classifier runs on text alone (P12) and so cannot know a drawing exists: probed with
 * the real mind-map page it returned `"diagramRegions": []` while merging every label into
 * one block, because nothing in plain text says "these are joined by arrows". The vision
 * model saw the pixels, so its per-region kind hints are the signal. Where several drawings
 * share a page they arrive with different groupKeys; the largest cluster wins in v1 (one
 * DIAGRAM block per page, matching the review UI's expectations).
 */
export function visionDiagramRegions(blocks: VisionBlock[]): number[] {
  const byGroup = new Map<string, number[]>();
  blocks.forEach((b, i) => {
    if (b.kind !== "DIAGRAM") return;
    const key = b.groupKey ?? "(ungrouped)";
    byGroup.set(key, [...(byGroup.get(key) ?? []), i]);
  });
  let best: number[] = [];
  for (const members of byGroup.values()) {
    if (members.length > best.length) best = members;
  }
  return best;
}

/**
 * Synthesise the DIAGRAM block (spec-note-capture.md P43) from the classifier's nomination.
 *
 * The classifier is only asked WHICH regions form the drawing — a judgement models make
 * reliably — and this builds the block from the vision transcriptions themselves. Both
 * prompt-level alternatives were tried against the real mind-map page and failed in opposite
 * directions on consecutive runs: asked to transcribe the drawing AND emit normal blocks,
 * glm-5 either merged everything into one giant block, or emitted only the diagram — whose
 * "reading order" transcription normalised a misread word (`BUFA LO` → `BUFFALO`) and was
 * rightly dropped by the invention guard. Synthesis has neither failure mode: the text is
 * the regions' own words in page order, with the sanitiser's validated swaps replayed.
 */
export function synthesiseDiagramBlock(
  diagramRegions: number[],
  regions: string[],
  corrections: Correction[],
  form?: string,
): ClassifiedBlock | null {
  const valid = [...new Set(diagramRegions)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < regions.length)
    .sort((a, b) => a - b);
  // One region is not a drawing worth a second block — its pass-1 block already carries it.
  if (valid.length < 2) return null;

  const text = applyCorrections(valid.map((i) => regions[i]).join("\n"), corrections).trim();
  if (!text) return null;

  return {
    fromRegions: valid,
    text,
    kind: "DIAGRAM",
    candidateCodes: [],
    tags: [form?.trim() || "diagram"],
  };
}
