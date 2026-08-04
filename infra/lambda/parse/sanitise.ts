import { chat } from "../ai/provider";
import { type Correction, parseModelJson, sanitiseResponseSchema } from "./schema";

/**
 * The sanitisation pass — an intelligent medical spell-checker (spec-note-capture.md P24).
 *
 * Scope is a spell-checker's scope, and the boundary is the whole decision: it corrects
 * **tokens that are not valid terms in UK clinical English** and nothing else. A synonym is
 * not an error. It must not paraphrase, expand abbreviations, tidy grammar, or correct the
 * student's clinical reasoning.
 *
 * Every prohibition below exists because a model broke it in testing (Appendix 3):
 *   deepseek rewrote "side effects - lower back pain" into "bone pain (e.g., lower back)",
 *   INVENTING clinical detail; glm decided "bacterial and fungal" should be "protozoal";
 *   qwen3-235b took the correct word "block" and corrupted it to "blow".
 *
 * The prompt is not the only defence, because prompts demonstrably weren't enough: a
 * correction whose `from` does not appear verbatim in the input is **discarded** in code.
 *
 * **Known limitation, stated plainly:** that guard catches INVENTED content — a phrase the
 * model made up, like "bone pain (e.g., lower back)" where the page said "lower back pain".
 * It does NOT catch a SYNONYM SWAP, where `from` really is on the page but `to` is a
 * different real word ("man made" -> "recombinant", "preventative" -> "prophylactic" — both
 * observed). Against those the prompt is the only defence, and the prompt is not reliable.
 * What contains the damage is P11: `rawText` is frozen, so every swap stays diffable and
 * one tap from reverting in review. If `CorrectionsReverted / Corrections` climbs in
 * production, this is the mechanism to suspect first.
 */

const MODEL = process.env.AI_SANITISE_MODEL_ID ?? "deepseek.v3.2";
const MAX_TOKENS = 3000;

const SYSTEM = `You are proof-reading a transcription of a UK student nurse's handwritten placement notes. The text came from a vision model reading handwriting, so it may contain misread words.

Rules:
- ALWAYS use British English and NHS/BNF conventions: "aciclovir" not "acyclovir", "haematology" not "hematology", "paediatric" not "pediatric", "-ise" not "-ize".
- MANDATORY: check every drug name and clinical term against real medicines and real terminology. If a drug name does not exist as written (a misspelling, a dropped or inserted syllable, a truncation), you MUST correct it to the real drug it is closest to. A non-existent drug name is always a transcription error and must never be left in place.
- Correct any word that makes no sense in the surrounding clinical context (e.g. "blow methotrexate clearance" should be "block").
- Use the surrounding prose as evidence for what an ambiguous word must be.
- A SYNONYM IS NOT AN ERROR. Do NOT paraphrase, do NOT expand abbreviations, do NOT change style or tense, do NOT tidy grammar, do NOT add content, do NOT correct the student's clinical reasoning. The student's own words and shorthand must survive exactly: "chemo" stays "chemo", "co-trimox" stays "co-trimox", "preventative" stays "preventative", "man made" stays "man made", "bacterial and fungal" stays as written.
- Leave ordinary words alone. Be conservative with everyday prose; be rigorous only with drug names and clinical terms.

Return ONLY JSON:
{"corrections":[{"from":"<original word>","to":"<corrected word>","reason":"<short>"}],"correctedText":"<the full text with corrections applied>"}`;

export interface SanitiseResult {
  /** The corrected page text. Falls back to the input verbatim on any failure. */
  text: string;
  /** Only corrections that survived validation. */
  corrections: Correction[];
  /** Corrections rejected because `from` wasn't in the input — the invented-edit guard. */
  rejected: Correction[];
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  failed: boolean;
}

/**
 * Apply the surviving corrections to the input ourselves rather than trusting
 * `correctedText`. The model's own rewrite is the thing that smuggled in invented content in
 * testing; replaying validated token swaps cannot introduce anything that wasn't approved.
 * Exported for the diagram synthesiser, which replays the same swaps onto region text.
 */
export function applyCorrections(input: string, corrections: Correction[]): string {
  let out = input;
  for (const c of corrections) {
    // Whole-word, all occurrences. A drug name misread once is usually misread throughout.
    const escaped = c.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, "g"), `$1${c.to}`);
  }
  return out;
}

export async function sanitise(pageText: string): Promise<SanitiseResult> {
  if (!pageText.trim()) {
    return { text: pageText, corrections: [], rejected: [], latencyMs: 0, failed: false };
  }
  let res;
  try {
    res = await chat({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: pageText },
      ],
    });
  } catch (err) {
    // A missing spell-check is a degraded result, never a wrong one (P24 degradation table).
    console.warn("sanitiser failed; falling back to the verbatim transcription", err);
    return { text: pageText, corrections: [], rejected: [], latencyMs: 0, failed: true };
  }

  const raw = parseModelJson(res.text);
  const validated = raw === null ? null : sanitiseResponseSchema.safeParse(raw);
  if (!validated || !validated.success) {
    console.warn("sanitiser returned unusable JSON; keeping the verbatim transcription");
    return {
      text: pageText,
      corrections: [],
      rejected: [],
      latencyMs: res.latencyMs,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      failed: true,
    };
  }

  // THE structural guard (P24). A correction whose `from` is not verbatim in the input is an
  // invention, not a correction — and this is what makes the pass safe to auto-apply.
  const corrections: Correction[] = [];
  const rejected: Correction[] = [];
  for (const c of validated.data.corrections) {
    const present = new RegExp(`(^|\\W)${c.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\W|$)`).test(
      pageText,
    );
    // A no-op "correction" is noise the models emit surprisingly often (`from` === `to`).
    if (present && c.from !== c.to) corrections.push(c);
    else rejected.push(c);
  }
  if (rejected.length > 0) {
    console.warn(`sanitiser: discarded ${rejected.length} correction(s) not present in the input`);
  }

  return {
    text: applyCorrections(pageText, corrections),
    corrections,
    rejected,
    latencyMs: res.latencyMs,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    failed: false,
  };
}
