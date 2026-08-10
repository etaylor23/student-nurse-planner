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
 * Fold the classifier's flat `diagramRegions` nomination into the vision clusters.
 *
 * The nomination is ONE flat list — the classifier's contract predates multi-drawing pages
 * (P45) and cannot say which drawing it means. So how much it can contribute depends on how
 * ambiguous it is:
 *
 * - **No vision cluster** → the nomination stands alone as the only signal: the classifier
 *   saw a drawing vision didn't hint.
 * - **One cluster** → union: the two models drew the same drawing's boundary differently,
 *   and the disagreement is worth keeping (this was the nomination's original job).
 * - **Two or more clusters** → the nomination is IGNORED. On `real-falls-handling`
 *   (2026-08-10, `runs/aug10-new-pages/`) the flat list swept up both drawings, the page
 *   title and the closing bullets, and the old best-overlap union turned one cluster into a
 *   superset of the other plus most of the page — "file whole" would have appended
 *   everything. A signal that cannot name its drawing is noise once there are two, and
 *   vision's per-region hints already define each drawing's membership.
 *
 * Clusters therefore stay disjoint by construction: vision assigns each region one
 * groupKey, and the union path only exists when there is a single cluster to union into.
 */
export function mergeNomination(
  clusters: DiagramCluster[],
  classifierRegions: number[],
): DiagramCluster[] {
  if (classifierRegions.length === 0) return clusters;
  const nominated = [...new Set(classifierRegions)].sort((a, b) => a - b);
  if (clusters.length === 0) return [{ regions: nominated }];
  if (clusters.length > 1) return clusters;
  const only = clusters[0];
  const overlap = only.regions.some((r) => nominated.includes(r));
  // Overlapping the one drawing → the same drawing, seen differently: union. Disjoint from
  // it → a second drawing vision missed: it stands alone.
  if (!overlap) return [...clusters, { regions: nominated }];
  // Union by CONTIGUITY, not wholesale. Regions arrive in reading order and a drawing is
  // contiguous on the page, so a nominated region only joins if it touches the cluster —
  // growing outward, so a run of adjacent regions still extends the boundary (the union's
  // original job). What this blocks is the distant island: on `real-diabetes-meds`
  // (2026-08-10) the nomination reached across the page and pulled the "always check BM +
  // prescription chart" margin box (region 5) into the flowchart's cluster (8–17) — the one
  // red note that shares words with a flowchart node, which is exactly the mistake a
  // text-only nominator makes and a region-set union can't see.
  const merged = new Set(only.regions);
  const candidates = new Set(nominated.filter((r) => !merged.has(r)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of [...candidates]) {
      if (merged.has(r - 1) || merged.has(r + 1)) {
        merged.add(r);
        candidates.delete(r);
        grew = true;
      }
    }
  }
  if (merged.size === only.regions.length) return clusters;
  return [{ ...only, regions: [...merged].sort((a, b) => a - b) }];
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
  // Flowchart node ids (`A[...]`, `B2(...)`, `C{...}`) are model-invented and legitimate.
  // Collect every id declared before a bracket, then allow it ANYWHERE — edges reference
  // ids bare (`C -- YES --> D`), and treating those as invented words rejected every real
  // flowchart on first contact (the heart-failure page).
  const ids = new Set<string>();
  for (const m of source.matchAll(/(?:^|[\s>-])([A-Za-z][A-Za-z0-9_]*)(?=[[({])/g)) {
    ids.add(m[1].toLowerCase());
  }
  const foreign = words(source).filter(
    (w) => !pageWords.has(w) && !MERMAID_SYNTAX.has(w) && !ids.has(w),
  );
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
