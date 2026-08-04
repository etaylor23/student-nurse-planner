import type { Correction } from "./schema";
import type { ClassifiedBlock } from "./schema";
import { applyCorrections } from "./sanitise";

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
