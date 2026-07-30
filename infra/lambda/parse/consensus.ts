/**
 * Two-model transcription consensus (spec-note-capture.md P22/P23).
 *
 * This exists because **self-reported confidence is measurably worthless** here. Measured
 * against ground truth on a real page: gemma wrote `Acyclovir` for `Aciclovir` at
 * confidence 1.00; qwen corrupted the longest drug name on the page while reporting 1.00 on
 * every block. Disagreement between two models with *different biases* is the only signal
 * that tracked correctness — across 7 runs it caught every critical error.
 *
 * Two design constraints, both learned by getting them wrong first:
 *
 * 1. **Page-level, never block-level** (P23). The check model segmented the same page as 5
 *    blocks on one run and 28 on the next, so aligning blocks between models is hopeless.
 *    Page text is stable; segmentation is not.
 * 2. **Word pairing by character similarity, not adjacency** (P23). A naive adjacency pass
 *    reported `"V)" vs "Phenoxymethylpenicillin"` — because the two models place the
 *    `(Penicillin V)` gloss differently — and buried the actual finding, that one model
 *    wrote `Phenoxyethylpenicillin`. Naming the wrong word is worse than raising no flag:
 *    the student is sent to check something that isn't the error.
 */

export interface DisputedWord {
  /** The structure model's reading — the one that will be stored. */
  structure: string;
  /** The check model's reading, offered to the student as the alternative. */
  check: string;
}

const wordsOf = (s: string): string[] => s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

/**
 * Normalise for comparison. Leading/trailing dashes go along with punctuation: the models
 * disagree constantly about whether a dash attaches to the preceding or following word
 * (`"antibiotic,"` vs `"-antibiotic,"`), and surfacing that as a word to confirm is noise
 * that teaches students to tick through the flags without reading them.
 */
const norm = (w: string): string =>
  w
    .toLowerCase()
    .replace(/[.,;:()"'’]/g, "")
    .replace(/^-+|-+$/g, "");

/** Levenshtein distance over the normalised forms. */
function editDistance(a: string, b: string): number {
  const s = norm(a);
  const t = norm(b);
  const m = s.length;
  const n = t.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * How likely are these two the same written word? The **max** of two measures, because
 * neither alone works across the range of word lengths on a real page:
 *
 *  - **Character-bigram Jaccard** handles long words well (`Phenoxyethyl…` vs
 *    `Phenoxymethyl…` scores 0.8+) but punishes short ones badly: `block` has 4 bigrams,
 *    `blow` has 3, only 2 are shared → 0.40, which a 0.45 threshold would reject. That is a
 *    real observed misread (`It can blow methotrexate clearance`), so missing it is not
 *    acceptable — a test caught this.
 *  - **Edit-distance ratio** handles short words (`block`/`blow` → 0.60) and still separates
 *    unrelated ones cleanly (`V)` vs a 23-letter drug name → ~0.04).
 *
 * Taking the max keeps both strengths without lowering the threshold, which would have
 * weakened the unrelated-word rejection the pairing depends on.
 */
export function charSimilarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const t = norm(s);
    const g = new Set<string>();
    if (t.length < 2) {
      g.add(t);
      return g;
    }
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const jaccard = inter / (A.size + B.size - inter);

  const longest = Math.max(norm(a).length, norm(b).length);
  const editRatio = longest === 0 ? 0 : 1 - editDistance(a, b) / longest;

  return Math.max(jaccard, editRatio);
}

/**
 * Pairing threshold, set from the observed data rather than by feel. Measured on every
 * disagreement seen across the Appendix 2 runs:
 *
 *   TRUE pairs   block/blow 0.60 · antibiotic,/antibisiic, 0.80 · Aciclovir/Acyclovir 0.89
 *                Filgrastim/Filgastim 0.90 · Phenoxyethyl…/Phenoxymethyl… 0.96
 *   FALSE pairs  haematology/betaxolol 0.455 · methotrexate/neutropenia 0.25 · V)/drug 0.00
 *
 * The tightest true pair is 0.60 and the loosest false pair is 0.455, so 0.5 sits in the gap
 * with margin on both sides. Note 0.45 was tried first and paired haematology with
 * betaxolol — a test caught it. Moving this needs the same kind of evidence.
 */
export const PAIR_THRESHOLD = 0.5;

/**
 * Diff two whole-page transcriptions and return the words they genuinely disagree on.
 * Cosmetic-only differences (case, punctuation, attached dashes) are dropped.
 */
export function disputedWords(structureText: string, checkText: string): DisputedWord[] {
  const A = wordsOf(structureText);
  const B = wordsOf(checkText);
  const n = A.length;
  const m = B.length;

  // LCS over normalised words, so the diff ignores cosmetic noise from the start.
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        norm(A[i]) === norm(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  type Op = { op: "same" | "onlyA" | "onlyB"; a?: string; b?: string };
  const raw: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(A[i]) === norm(B[j])) {
      raw.push({ op: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ op: "onlyA", a: A[i++] });
    } else {
      raw.push({ op: "onlyB", b: B[j++] });
    }
  }
  while (i < n) raw.push({ op: "onlyA", a: A[i++] });
  while (j < m) raw.push({ op: "onlyB", b: B[j++] });

  // Within each contiguous run of non-matching words, pair by character similarity.
  const out: DisputedWord[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].op === "same") {
      k++;
      continue;
    }
    const start = k;
    while (k < raw.length && raw[k].op !== "same") k++;
    const run = raw.slice(start, k);
    const aWords = run.filter((o) => o.op === "onlyA").map((o) => o.a as string);
    const bWords = run.filter((o) => o.op === "onlyB").map((o) => o.b as string);
    const usedB = new Set<number>();
    for (const aw of aWords) {
      let best = -1;
      let bestScore = 0;
      bWords.forEach((bw, bi) => {
        if (usedB.has(bi)) return;
        const s = charSimilarity(aw, bw);
        if (s > bestScore) {
          bestScore = s;
          best = bi;
        }
      });
      if (best >= 0 && bestScore >= PAIR_THRESHOLD) {
        usedB.add(best);
        // A pair that normalises identically is cosmetic — not worth the student's attention.
        if (norm(aw) !== norm(bWords[best])) out.push({ structure: aw, check: bWords[best] });
      }
      // An unpaired word is a segmentation difference, not a misread — one model simply saw
      // text the other didn't. Flagging it would name a word with no alternative to compare.
    }
  }
  return out;
}

/** Which of the classifier's blocks contains a disputed word? Returns indices into `blocks`. */
export function mapDisputesToBlocks(
  blocks: Array<{ text: string }>,
  disputes: DisputedWord[],
): Map<number, DisputedWord[]> {
  const byBlock = new Map<number, DisputedWord[]>();
  for (const d of disputes) {
    const target = norm(d.structure);
    if (!target) continue;
    const idx = blocks.findIndex((b) => wordsOf(b.text).some((w) => norm(w) === target));
    if (idx < 0) continue; // the word didn't survive into any block (e.g. dismissed text)
    const list = byBlock.get(idx) ?? [];
    list.push(d);
    byBlock.set(idx, list);
  }
  return byBlock;
}
