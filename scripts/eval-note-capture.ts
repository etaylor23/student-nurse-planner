/**
 * Note Capture parse harness — the two-model consensus pipeline from
 * `spec/spec-note-capture.md` (P12, P21, P22, P23), run against a real photo.
 *
 * This is the only test gating the feature, and it earns its keep: the runs that
 * produced it corrected five assumptions in the spec — downscale target (1600px was
 * losing drug names), confidence flagging (worthless), single-model parsing (not
 * enough), wardHint inference (hallucinated), and parse latency (~15s, not ~8s).
 *
 * How consensus works, and why it isn't block-aligned:
 *   - The STRUCTURE model (qwen3-vl) owns blocks, kinds, groups, geometry.
 *   - The CHECK model (gemma-3-27b) is used ONLY as a transcription cross-check.
 *   - Diffing happens on WHOLE-PAGE TEXT, then disagreements are mapped back to
 *     whichever structure block contains them.
 * Block-level alignment was tried first and abandoned: the same page came back as
 * 5 blocks on one run and 28 on the next, so the models never reliably agree on
 * where a block begins. Page text is stable; segmentation is not.
 *
 * Why two models at all: self-reported confidence is measurably worthless here.
 * gemma wrote "Acyclovir" for "Aciclovir" at confidence 1.00; qwen misread the
 * longest drug name on the page while reporting 1.00 on every block. Over 7 runs the
 * structure model corrupted "Phenoxymethylpenicillin" in 3 of them, a different way
 * each time, always at confidence 1.00 — and the check model read it correctly every
 * time. No confidence threshold separates those runs; disagreement does.
 *
 *   AWS_PROFILE=personal npx tsx scripts/eval-note-capture.ts <photo.jpg> [--gt ground-truth.txt] [--out run.log]
 */
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REGION = process.env.AWS_REGION ?? "eu-west-2";
const ENDPOINT = process.env.MANTLE_ENDPOINT ?? `https://bedrock-mantle.${REGION}.api.aws`;

/** Structure model — owns blocks, kinds, groups, geometry. */
const STRUCTURE_MODEL = process.env.AI_VISION_MODEL_ID ?? "qwen.qwen3-vl-235b-a22b-instruct";
/** Check model — transcription cross-check only. Chosen because its bias differs. */
const CHECK_MODEL = process.env.AI_VISION_CHECK_MODEL_ID ?? "google.gemma-3-27b-it";

/** Spec P-default: downscale before upload. 2400px, not 1600 — 1600 cost drug names. */
const LONG_EDGE = 2400;

const PROMPT = `This is a photo of a student nurse's handwritten placement notes. Distinct notes may be scattered across the page at different angles.

Transcribe EXACTLY what is written. Do not correct, expand, Americanise or guess at words you cannot read. Use the surrounding prose to help you READ an ambiguous word, but never replace a written word with a different one you think is more likely. If a word remains unclear, transcribe your best reading and lower that block's confidence.

Only report wardHint if a ward or unit name is actually written on the page — never infer it from the prose.

Return ONLY JSON:
{"pageDateRaw":"<date exactly as written, or null>","wardHint":"<ward name written on the page, or null>","blocks":[{"rawText":"<verbatim>","text":"<lightly tidied>","kind":"CLINICAL_SKILL|MEDICATION|REFLECTION|OBSERVATION|TODO|DATE_HEADER","confidence":0-1,"bbox":[x0,y0,x1,y1],"rotationDeg":<n>,"groupKey":"<shared by related blocks>"}]}`;

interface ParsedBlock {
  rawText: string;
  text: string;
  kind: string;
  confidence: number;
  bbox?: number[];
  rotationDeg?: number;
  groupKey?: string;
}
interface ParseResult {
  pageDateRaw: string | null;
  wardHint: string | null;
  blocks: ParsedBlock[];
}
interface ModelRun {
  model: string;
  ms: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  parsed: ParseResult | null;
  repaired: boolean;
  parseError: string | null;
}

const signer = new SignatureV4({
  service: "bedrock",
  region: REGION,
  sha256: Sha256,
  credentials: defaultProvider(),
});

async function callModel(model: string, dataUri: string): Promise<ModelRun> {
  const payload = JSON.stringify({
    model,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
  });
  const url = new URL(ENDPOINT + "/v1/chat/completions");
  const signed = await signer.sign(
    new HttpRequest({
      method: "POST",
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      headers: { "content-type": "application/json", host: url.hostname },
      body: payload,
    }),
  );
  const t0 = Date.now();
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: signed.headers as Record<string, string>,
    body: payload,
  });
  const ms = Date.now() - t0;
  const body = await res.text();
  if (!res.ok) throw new Error(`${model} HTTP ${res.status}: ${body.slice(0, 200)}`);
  const envelope = JSON.parse(body);
  const content: string = envelope.choices?.[0]?.message?.content ?? "";
  const stripped =
    content
      .replace(/^[\s\S]*?```(?:json)?\s*/, "")
      .replace(/```[\s\S]*$/, "")
      .trim() || content.trim();

  let parsed: ParseResult | null = null;
  let repaired = false;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    parseError = (e as Error).message;
    // Observed malformations: unquoted keys, trailing commas, // comments.
    const fixed = stripped
      .replace(/\/\/[^\n]*/g, "")
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
    try {
      parsed = JSON.parse(fixed);
      repaired = true;
    } catch {
      /* unrecoverable — caller reports it */
    }
  }
  return { model, ms, usage: envelope.usage, parsed, repaired, parseError };
}

// ---------- word-level diff over whole-page text ----------
const wordsOf = (s: string) => s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
/**
 * Normalise for comparison. Leading/trailing dashes are stripped as well as
 * punctuation: the models disagree constantly about whether a dash attaches to the
 * preceding or following word ("antibiotic," vs "-antibiotic,"), and surfacing that
 * to a student as a word to confirm is pure noise.
 */
const norm = (w: string) =>
  w
    .toLowerCase()
    .replace(/[.,;:()"'’]/g, "")
    .replace(/^-+|-+$/g, "");

type DiffOp = { op: "same" | "sub" | "onlyA" | "onlyB"; a?: string; b?: string };

/** LCS word diff, with adjacent insert pairs collapsed into substitutions. */
function wordDiff(aText: string, bText: string): DiffOp[] {
  const A = wordsOf(aText);
  const B = wordsOf(bText);
  const n = A.length;
  const m = B.length;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        norm(A[i]) === norm(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(A[i]) === norm(B[j])) {
      raw.push({ op: "same", a: A[i], b: B[j] });
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

  // Pair up unmatched words into substitutions by CHARACTER similarity, not by
  // adjacency. Adjacency alone mis-pairs badly: the models place the "(Penicillin V)"
  // gloss differently, so a naive pass reported `"V)" vs "Phenoxymethylpenicillin"`
  // and buried the real finding — that one model wrote "Phenoxyethylpenicillin" and
  // the other "Phenoxymethylpenicillin". Naming the wrong word is worse than useless,
  // because the student is asked to check something that isn't the error.
  const out: DiffOp[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].op === "same") {
      out.push(raw[k++]);
      continue;
    }
    // Gather the whole contiguous run of non-matching ops.
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
      // 0.45 keeps "Phenoxyethyl…"/"Phenoxymethyl…" (0.8+) and "block"/"blow" (0.5)
      // together, while refusing to pair unrelated words like "V)" and a drug name.
      if (best >= 0 && bestScore >= 0.45) {
        usedB.add(best);
        out.push({ op: "sub", a: aw, b: bWords[best] });
      } else {
        out.push({ op: "onlyA", a: aw });
      }
    }
    bWords.forEach((bw, bi) => {
      if (!usedB.has(bi)) out.push({ op: "onlyB", b: bw });
    });
  }
  return out;
}

/** Character-bigram Jaccard — how likely are these two the same written word? */
function charSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = norm(s);
    const g = new Set<string>();
    if (t.length < 2) return (g.add(t), g);
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Which structure block contains this word? Returns index or -1. */
function locateBlock(blocks: ParsedBlock[], word: string): number {
  const w = norm(word);
  if (!w) return -1;
  return blocks.findIndex((b) => wordsOf(b.rawText).some((x) => norm(x) === w));
}

// ---------- main ----------
async function main() {
  const argv = process.argv.slice(2);
  const photo = argv.find((a) => !a.startsWith("--"));
  const gtPath = argv[argv.indexOf("--gt") + 1];
  const outPath = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "note-capture-run.log";
  if (!photo) {
    console.error(
      "Usage: eval-note-capture.ts <photo.jpg> [--gt ground-truth.txt] [--out run.log]",
    );
    process.exit(1);
  }

  // Downscale exactly as the client would before upload (spec P-default).
  const scaled = `${outPath}.upload.jpg`;
  execFileSync("magick", [
    photo,
    "-auto-orient",
    "-resize",
    `${LONG_EDGE}x${LONG_EDGE}>`,
    "-quality",
    "85",
    scaled,
  ]);
  const bytes = readFileSync(scaled);
  const dataUri = `data:image/jpeg;base64,${bytes.toString("base64")}`;

  const L: string[] = [];
  const say = (s = "") => {
    L.push(s);
    console.log(s);
  };

  const [structure, check] = await Promise.all([
    callModel(STRUCTURE_MODEL, dataUri),
    callModel(CHECK_MODEL, dataUri),
  ]);

  say("=".repeat(78));
  say("NOTE CAPTURE — PARSE + CONSENSUS RUN");
  say("=".repeat(78));
  say(`photo        : ${photo}`);
  say(`uploaded as  : ${LONG_EDGE}px long edge, ${(bytes.length / 1024).toFixed(0)} KB`);
  say(`run at       : ${new Date().toISOString()}`);
  say(
    `structure    : ${structure.model}  ${structure.ms}ms  ` +
      `in ${structure.usage?.prompt_tokens} / out ${structure.usage?.completion_tokens} tok  ` +
      `json ${structure.repaired ? "REPAIRED" : structure.parsed ? "clean" : "UNPARSEABLE"}`,
  );
  say(
    `check        : ${check.model}  ${check.ms}ms  ` +
      `in ${check.usage?.prompt_tokens} / out ${check.usage?.completion_tokens} tok  ` +
      `json ${check.repaired ? "REPAIRED" : check.parsed ? "clean" : "UNPARSEABLE"}`,
  );
  say(`wall clock   : ${Math.max(structure.ms, check.ms)}ms (parallel)`);
  say("");

  if (!structure.parsed) {
    say(`FATAL: structure model returned unparseable JSON — ${structure.parseError}`);
    writeFileSync(outPath, L.join("\n") + "\n");
    process.exit(2);
  }

  const blocks = structure.parsed.blocks ?? [];
  const pageA = blocks.map((b) => b.rawText).join(" ");
  const pageB = (check.parsed?.blocks ?? []).map((b) => b.rawText).join(" ");

  // ---- page-level fields ----
  say("-".repeat(78));
  say("PAGE FIELDS");
  say("-".repeat(78));
  const pd = structure.parsed.pageDateRaw ?? null;
  const wh = structure.parsed.wardHint ?? null;
  say(
    `  pageDateRaw  ${JSON.stringify(pd)}   ${pd === null ? "(no date written → shift falls back to most recent, P9)" : "(app resolves the year, P8)"}`,
  );
  say(`  wardHint     ${JSON.stringify(wh)}`);
  const checkPd = check.parsed?.pageDateRaw ?? null;
  if (String(checkPd) !== String(pd)) {
    say(`  !! check model disagrees on pageDateRaw: ${JSON.stringify(checkPd)}`);
  }
  say("");

  // ---- consensus over page text ----
  const diffs = wordDiff(pageA, pageB).filter((d) => d.op !== "same");
  const subs = diffs.filter((d) => d.op === "sub" && norm(d.a ?? "") !== norm(d.b ?? ""));
  const flagsByBlock = new Map<number, { a: string; b: string }[]>();
  for (const s of subs) {
    const bi = locateBlock(blocks, s.a ?? "");
    if (bi < 0) continue;
    const list = flagsByBlock.get(bi) ?? [];
    list.push({ a: s.a ?? "", b: s.b ?? "" });
    flagsByBlock.set(bi, list);
  }

  say("-".repeat(78));
  say("BLOCKS AS THE APP WOULD STORE THEM   (structure from the primary model)");
  say("-".repeat(78));
  blocks.forEach((b, i) => {
    const flags = flagsByBlock.get(i) ?? [];
    say("");
    say(
      `  BLOCK ${i + 1}  kind=${b.kind}  group=${b.groupKey ?? "-"}  selfConf=${Number(b.confidence).toFixed(2)}`,
    );
    say(`    rawText : ${JSON.stringify(b.rawText)}`);
    if (b.text && norm(b.text) !== norm(b.rawText)) say(`    text    : ${JSON.stringify(b.text)}`);
    say(
      `    review  : ${flags.length === 0 ? "AGREED by both models → safe to pre-select" : `${flags.length} WORD(S) TO CONFIRM → not pre-selected`}`,
    );
    flags.forEach((f) => say(`       ? "${f.a}"  (check model read: "${f.b}")`));
  });
  say("");

  // ---- ground truth scoring, if supplied ----
  if (gtPath) {
    const gt = readFileSync(gtPath, "utf8").toLowerCase();
    const gtWords = new Set(wordsOf(gt).map(norm));
    say("-".repeat(78));
    say("GROUND TRUTH CHECK");
    say("-".repeat(78));
    let caught = 0;
    let missed = 0;
    const primaryErrors = wordsOf(pageA)
      .map(norm)
      .filter((w) => w.length > 3 && !gtWords.has(w));
    say(`  words in primary transcription not present in ground truth: ${primaryErrors.length}`);
    for (const w of primaryErrors) {
      const flagged = subs.some((s) => norm(s.a ?? "") === w);
      if (flagged) caught++;
      else missed++;
      say(`    ${flagged ? "CAUGHT  " : "MISSED  "} "${w}"`);
    }
    say("");
    say(`  errors caught by consensus : ${caught}`);
    say(
      `  errors missed by consensus : ${missed}${missed ? "   ← both models wrong the same way" : ""}`,
    );
    say("");
    say("  Self-reported confidence on blocks containing a flagged word:");
    let anyConf = false;
    flagsByBlock.forEach((f, bi) => {
      anyConf = true;
      say(
        `    block ${bi + 1}: selfConf ${Number(blocks[bi].confidence).toFixed(2)} — flagged ${f.map((x) => `"${x.a}"`).join(", ")}`,
      );
    });
    if (!anyConf) say("    (no flags this run)");
    say("");
    say("  If selfConf stays ~1.00 on flagged blocks, confidence cannot gate review (P16).");
  }

  say("=".repeat(78));
  writeFileSync(outPath, L.join("\n") + "\n");
  writeFileSync(
    outPath.replace(/\.log$/, "") + "-structure.json",
    JSON.stringify(structure.parsed, null, 2),
  );
  writeFileSync(
    outPath.replace(/\.log$/, "") + "-check.json",
    JSON.stringify(check.parsed, null, 2),
  );
  console.log(`\n→ ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
