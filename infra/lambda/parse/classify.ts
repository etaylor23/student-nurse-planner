import { seedProficiencies } from "../../../src/data/seed/proficiencies";
import { chat } from "../ai/provider";
import { type ClassifiedBlock, classifyResponseSchema, parseModelJson } from "./schema";

/**
 * The classification pass (spec-note-capture.md P26–P37).
 *
 * Takes the sanitised page text and produces the blocks the app will actually store. The
 * vision model's regions are only *guidance* about where the subject changes (P26): a real
 * block is a semantic unit, which may span several regions or subdivide one.
 *
 * It runs AFTER sanitisation because matching depends on correct terms —
 * `Phenoxyethylpenicillin` matches no proficiency and no medication card. And it is its own
 * call rather than folded into the sanitiser because Appendix 3 measured what happens when
 * one model is handed two jobs: it drifts into doing neither properly.
 */

const MODEL = process.env.AI_CLASSIFY_MODEL_ID ?? "zai.glm-5";
const MAX_TOKENS = 6000;

/**
 * Context providers, deliberately kept as separate functions (P29). v1 stuffs all of them
 * into one prompt; the future agentic classifier turns each into a tool handler, and that
 * swap should not require restructuring this module.
 */

/** All 219 NMC statements: 31,237 chars ≈ 7.8k tokens, measured. Sent once per photo. */
export function proficiencyContext(): string {
  return seedProficiencies.map((p) => `${p.code}|${p.statement}`).join("\n");
}

/** Valid codes, for validating what comes back rather than trusting it. */
const VALID_CODES = new Set(seedProficiencies.map((p) => p.code));

export interface StudentContext {
  /** The student's own Medication card names (P33) — they are UserOwned. */
  medicationNames?: string[];
  /** Existing Tag labels, so tags are reused rather than near-duplicated (P37). */
  tagLabels?: string[];
  placementName?: string;
  placementSetting?: string;
}

function studentContextBlock(ctx: StudentContext): string {
  const lines: string[] = [];
  if (ctx.medicationNames?.length) {
    lines.push(`Their medication cards: ${ctx.medicationNames.join(", ")}`);
  }
  if (ctx.tagLabels?.length) lines.push(`Tags they already use: ${ctx.tagLabels.join(", ")}`);
  if (ctx.placementName || ctx.placementSetting) {
    lines.push(
      `Current placement: ${[ctx.placementName, ctx.placementSetting].filter(Boolean).join(" — ")}`,
    );
  }
  // NOTE: ProficiencyStatus is deliberately absent (P32). A classifier that knew which
  // statements were outstanding would rank evidence by what the student still NEEDS rather
  // than by what the note SHOWS, and this record ends up in front of the NMC.
  return lines.length ? lines.join("\n") : "(no personal context available)";
}

const SYSTEM = `You are filing a student nurse's handwritten placement notes into their records.

You are given the page's text, split into numbered regions by a vision model. Those regions are GUIDANCE about where the subject changes — often right, not always. The real blocks are semantic: a single block may span two or three regions, or one region may contain two different notes. Decide the real boundaries yourself.

For each block, decide:
- "kind": CLINICAL_SKILL | MEDICATION | REFLECTION | OBSERVATION | TODO | DATE_HEADER | DIAGRAM | UNKNOWN. Use UNKNOWN honestly when it is none of these (a phone number, a shopping list, an illegible fragment) — do not guess a kind to look decisive.
- "targetType": where it should be filed — REFLECTION | MED_LOG | PROFICIENCY_EVENT | SHIFT_NOTES.
- "candidateCodes": for clinical-skill or proficiency-evidence blocks, the 3–5 NMC statement codes it best evidences, RANKED best first. Use only codes from the list given. A medication note CAN evidence a platform statement about medicines management — do not restrict yourself by kind.
- "tags": short subject labels. Strongly prefer labels the student already uses.
- "medicationCandidate": for medication blocks, the drug name (match one of their existing cards if it is the same drug).
- "gibbs": REFLECTION blocks ONLY — split the text across DESCRIPTION, FEELINGS, EVALUATION, ANALYSIS, CONCLUSION, ACTION_PLAN. Omit stages the text does not cover. Do not invent content to fill a stage.
- "fromRegions": which region numbers this block drew from.
- "groupKey": shared by blocks that belong together.

Never merge separate notes into one block merely because they sit near each other or share a subject — a to-do line is always its own TODO block, wherever it is on the page.

If part of the page is a drawn structure — a mind map, flowchart, sketch or hand-drawn table — still classify its written labels as normal blocks like everything else, and ALSO name the drawing in two top-level fields beside "blocks": "diagramRegions" = the region numbers that form the drawing (the labels inside it only — never a margin note, header or to-do that merely sits nearby), and "diagramForm" = what it is (e.g. "mind map"). The app keeps the drawing itself with the photographed page. No drawing → "diagramRegions": [].

CRITICAL: "text" must use the SAME WORDS as the page text given to you, in the same order. You may split it, regroup it, and JOIN HARD-WRAPPED LINES back into flowing sentences and paragraphs so it reads naturally — handwritten notes wrap mid-sentence and that line structure is an artefact of the paper, not the meaning. You may NOT reword it, substitute synonyms, summarise it, or add to it.

Return ONLY JSON: {"blocks":[{...}],"diagramRegions":[],"diagramForm":null}`;

export interface ClassifyResult {
  blocks: ClassifiedBlock[];
  /** Blocks dropped because their text wasn't in the page — the invented-content guard. */
  droppedBlocks: number;
  /** Codes dropped because they aren't real NMC codes. */
  droppedCodes: number;
  /** The drawing nomination (P43) — region numbers, for `diagram.ts` to synthesise from. */
  diagramRegions: number[];
  diagramForm?: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  failed: boolean;
}

/** Whitespace-insensitive containment — the model reflows line breaks even when copying. */
function isFromPage(text: string, page: string): boolean {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return squash(page).includes(squash(text));
}

/**
 * The DIAGRAM relaxation of the same guard. A mind map's labels are scattered around the
 * page, so the vision model emits them in one order and a faithful diagram transcription
 * reads them in another — substring containment can never hold. Word-level containment
 * still holds the line that matters: every word must exist on the page, so the model can
 * reorder the student's words but not introduce any.
 */
function isTokensFromPage(text: string, page: string): boolean {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const pageWords = new Set(tokens(page));
  return tokens(text).every((t) => pageWords.has(t));
}

export async function classify(
  sanitisedText: string,
  regions: string[],
  ctx: StudentContext,
): Promise<ClassifyResult> {
  const numbered = regions.map((r, i) => `[r${i}] ${r}`).join("\n");
  const user = [
    "PAGE TEXT (regions are guidance, not boundaries):",
    numbered || sanitisedText,
    "",
    "ABOUT THIS STUDENT:",
    studentContextBlock(ctx),
    "",
    "NMC PROFICIENCY STATEMENTS (code|statement):",
    proficiencyContext(),
  ].join("\n");

  let res;
  try {
    res = await chat({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
  } catch (err) {
    // Degrades to a transcription tool: blocks fall back to the vision regions with no
    // targets, and the student routes them by hand (P35). Still useful.
    console.warn("classifier failed; falling back to unclassified regions", err);
    return {
      blocks: [],
      droppedBlocks: 0,
      droppedCodes: 0,
      diagramRegions: [],
      latencyMs: 0,
      failed: true,
    };
  }

  const failure = (): ClassifyResult => ({
    blocks: [],
    droppedBlocks: 0,
    droppedCodes: 0,
    diagramRegions: [],
    latencyMs: res.latencyMs,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    failed: true,
  });

  /**
   * What the log is allowed to say about a failure.
   *
   * Deliberately structural only — length, stop reason, token count, and the opening few
   * characters, which are the fence or the "Here is the JSON:" preamble and contain no note
   * content. The tail would be far more useful and is exactly what must not be written:
   * CloudWatch is not a place to put a student's clinical notes, and P2 already accepts that
   * those notes may contain more than they should. Everything here answers the only question
   * worth asking of a broken response — was it cut off, was it wrapped in prose, or was it
   * empty — without becoming a second copy of the page.
   */
  const shape = `chars=${res.text.length} finish=${res.finishReason ?? "?"} outTokens=${res.outputTokens ?? "?"} opens=${JSON.stringify(res.text.slice(0, 24))}`;

  const raw = parseModelJson(res.text);
  if (raw === null) {
    // Three different causes, one old message. `finish=length` means raise MAX_TOKENS;
    // `chars=0` means the model answered somewhere this code isn't reading; anything else is
    // a model that won't hold to the format and needs a prompt or a model change.
    console.warn(
      `classifier: response was not JSON (${shape}); falling back to unclassified regions`,
    );
    return failure();
  }
  const validated = classifyResponseSchema.safeParse(raw);
  if (!validated.success) {
    // Valid JSON of the wrong shape — a different bug from the one above, and the zod issue
    // paths say precisely which field, so this needs no content in the log at all.
    const issues = validated.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`)
      .join("; ");
    console.warn(
      `classifier: JSON did not match the contract [${issues}] (${shape}); falling back to unclassified regions`,
    );
    return failure();
  }

  if (validated.data.malformed > 0) {
    console.warn(`classifier: dropped ${validated.data.malformed} malformed block(s)`);
  }

  let droppedBlocks = 0;
  let droppedCodes = 0;
  const blocks: ClassifiedBlock[] = [];
  for (const b of validated.data.blocks) {
    // The structural guard (P26/P27): the classifier may re-split and regroup the student's
    // words, never introduce any. Same rule as the sanitiser's `from`-must-match. DIAGRAM
    // blocks legitimately reorder scattered labels, so they get the word-level form.
    const fromPage =
      b.kind === "DIAGRAM"
        ? isTokensFromPage(b.text, sanitisedText)
        : isFromPage(b.text, sanitisedText);
    if (!fromPage) {
      droppedBlocks++;
      continue;
    }
    const codes = b.candidateCodes.filter((c) => VALID_CODES.has(c));
    droppedCodes += b.candidateCodes.length - codes.length;
    blocks.push({ ...b, candidateCodes: codes });
  }
  if (droppedBlocks > 0) {
    console.warn(`classifier: dropped ${droppedBlocks} block(s) whose text was not on the page`);
  }

  return {
    blocks,
    droppedBlocks,
    droppedCodes,
    diagramRegions: validated.data.diagramRegions,
    diagramForm: validated.data.diagramForm,
    latencyMs: res.latencyMs,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    failed: false,
  };
}
