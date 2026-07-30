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
- "kind": CLINICAL_SKILL | MEDICATION | REFLECTION | OBSERVATION | TODO | DATE_HEADER | UNKNOWN. Use UNKNOWN honestly when it is none of these (a phone number, a shopping list, an illegible fragment) — do not guess a kind to look decisive.
- "targetType": where it should be filed — REFLECTION | MED_LOG | PROFICIENCY_EVENT | SHIFT_NOTES.
- "candidateCodes": for clinical-skill or proficiency-evidence blocks, the 3–5 NMC statement codes it best evidences, RANKED best first. Use only codes from the list given. A medication note CAN evidence a platform statement about medicines management — do not restrict yourself by kind.
- "tags": short subject labels. Strongly prefer labels the student already uses.
- "medicationCandidate": for medication blocks, the drug name (match one of their existing cards if it is the same drug).
- "gibbs": REFLECTION blocks ONLY — split the text across DESCRIPTION, FEELINGS, EVALUATION, ANALYSIS, CONCLUSION, ACTION_PLAN. Omit stages the text does not cover. Do not invent content to fill a stage.
- "fromRegions": which region numbers this block drew from.
- "groupKey": shared by blocks that belong together.

CRITICAL: "text" must be copied from the page text given to you. You may split it and regroup it; you may NOT reword it, summarise it, or add to it.

Return ONLY JSON: {"blocks":[{...}]}`;

export interface ClassifyResult {
  blocks: ClassifiedBlock[];
  /** Blocks dropped because their text wasn't in the page — the invented-content guard. */
  droppedBlocks: number;
  /** Codes dropped because they aren't real NMC codes. */
  droppedCodes: number;
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
    return { blocks: [], droppedBlocks: 0, droppedCodes: 0, latencyMs: 0, failed: true };
  }

  const raw = parseModelJson(res.text);
  const validated = raw === null ? null : classifyResponseSchema.safeParse(raw);
  if (!validated || !validated.success) {
    console.warn("classifier returned unusable JSON; falling back to unclassified regions");
    return {
      blocks: [],
      droppedBlocks: 0,
      droppedCodes: 0,
      latencyMs: res.latencyMs,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      failed: true,
    };
  }

  let droppedBlocks = 0;
  let droppedCodes = 0;
  const blocks: ClassifiedBlock[] = [];
  for (const b of validated.data.blocks) {
    // The structural guard (P26/P27): the classifier may re-split and regroup the student's
    // words, never introduce any. Same rule as the sanitiser's `from`-must-match.
    if (!isFromPage(b.text, sanitisedText)) {
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
    latencyMs: res.latencyMs,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    failed: false,
  };
}
