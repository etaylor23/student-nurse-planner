import type { ClassifiedBlock, Correction, VisionBlock } from "./schema";
import { applyCorrections } from "./sanitise";

/** One drawing's member regions, keyed by the groupKey its vision hints share (P45). */
export interface DiagramCluster {
  /** Absent for a cluster the classifier nominated that vision never hinted. */
  groupKey?: string;
  regions: number[];
}

/**
 * The vision model's DIAGRAM nomination — the PRIMARY one (P43).
 *
 * The classifier runs on text alone (P12) and so cannot know a drawing exists: probed with
 * the real mind-map page it returned `"diagramRegions": []` while merging every label into
 * one block, because nothing in plain text says "these are joined by arrows". The vision
 * model saw the pixels, so its per-region kind hints are the signal. A page can hold
 * SEVERAL drawings (P45) — one cluster per groupKey, in page order, each of which becomes
 * its own DIAGRAM block. Single-label clusters are dropped for the same reason a one-region
 * synthesis is: one label is not a drawing.
 */
export function visionDiagramClusters(blocks: VisionBlock[]): DiagramCluster[] {
  const byGroup = new Map<string, number[]>();
  blocks.forEach((b, i) => {
    if (b.kind !== "DIAGRAM") return;
    const key = b.groupKey ?? "(ungrouped)";
    byGroup.set(key, [...(byGroup.get(key) ?? []), i]);
  });
  return [...byGroup.entries()]
    .map(([groupKey, regions]) => ({ groupKey, regions }))
    .filter((c) => c.regions.length >= 2)
    .sort((a, b) => a.regions[0] - b.regions[0]);
}

/**
 * Fold the classifier's flat `diagramRegions` nomination into the vision clusters: union
 * into the cluster it overlaps most (the two models drew the same drawing's boundary
 * differently), or stand alone as an extra drawing when it overlaps none (the classifier
 * saw something vision didn't hint). Empty nomination changes nothing.
 */
export function mergeNomination(
  clusters: DiagramCluster[],
  classifierRegions: number[],
): DiagramCluster[] {
  if (classifierRegions.length === 0) return clusters;
  const nominated = new Set(classifierRegions);
  let bestIdx = -1;
  let bestOverlap = 0;
  clusters.forEach((c, i) => {
    const overlap = c.regions.filter((r) => nominated.has(r)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0) {
    const merged = [...new Set([...clusters[bestIdx].regions, ...nominated])].sort(
      (a, b) => a - b,
    );
    return clusters.map((c, i) => (i === bestIdx ? { ...c, regions: merged } : c));
  }
  return [...clusters, { regions: [...nominated].sort((a, b) => a - b) }];
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
/** Mermaid structural vocabulary — words the source needs that are never on the page. */
const MERMAID_SYNTAX = new Set([
  "mindmap",
  "flowchart",
  "graph",
  "subgraph",
  "end",
  "td",
  "lr",
  "tb",
  "rl",
  "bt",
  "root",
]);

/**
 * Admit the vision model's Mermaid rebuild (P44) only if every word in it was written on
 * the page. The model rebuilds STRUCTURE — nesting, arrows — which is exactly what the
 * transcription guards can't see, so this is the same invention boundary applied to the
 * one thing it is allowed to add: syntax. Node ids in `flowchart` (`A[label]`) and quoting
 * are stripped before checking; a failure returns undefined and the UI falls back to the
 * transcription. Fail closed, never fail wrong.
 */
export function guardMermaid(mermaid: string | undefined, pageText: string): string | undefined {
  const source = mermaid?.trim();
  if (!source) return undefined;
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const pageWords = new Set(words(pageText));
  // Strip flowchart node ids: `A[...]`, `B2(...)`, `C{...}` — the id is model-invented and
  // legitimate; the label inside is what must come from the page.
  const withoutIds = source.replace(/(^|[\s>-])[A-Za-z][A-Za-z0-9_]*(?=[[({])/g, "$1");
  const foreign = words(withoutIds).filter((w) => !pageWords.has(w) && !MERMAID_SYNTAX.has(w));
  return foreign.length === 0 ? source : undefined;
}

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
