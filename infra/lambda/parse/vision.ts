import { chat } from "../ai/provider";
import { type VisionResponse, parseModelJson, visionResponseSchema } from "./schema";

/**
 * The two vision calls (spec-note-capture.md P21), run in parallel.
 *
 * `qwen3-vl` is the STRUCTURE model: its transcription is what gets stored, and it supplies
 * the regions, generic hints and page fields. `gemma-3-27b` is the CHECK model, whose output
 * is never stored — it exists only to disagree, and was chosen *because its bias differs*
 * (it reliably Americanises `Aciclovir` and drops the `r` in `Filgrastim`), which guarantees
 * a flag on exactly the class of word that matters. A more accurate checker with correlated
 * errors would be worse.
 *
 * `mistral.ministral-3-14b-instruct` is deliberately NOT an option here: 3 of 6 runs emitted
 * unparseable JSON and it paraphrases rather than transcribes. See Appendix 2.
 */

const STRUCTURE_MODEL = process.env.AI_VISION_MODEL_ID ?? "qwen.qwen3-vl-235b-a22b-instruct";
const CHECK_MODEL = process.env.AI_VISION_CHECK_MODEL_ID ?? "google.gemma-3-27b-it";
const MAX_TOKENS = 4000;

/**
 * Every instruction here was added because a model broke the rule in testing:
 *  - "do not Americanise" → gemma writing `Acyclovir` for `Aciclovir`
 *  - "date exactly as written" → a model inventing `2024` for a page saying `22/7` (P8)
 *  - "only report wardHint if written" → a model inferring `Haematology` from the prose,
 *    which would then have fed shift matching and mislinked the capture
 */
const PROMPT = `This is a photo of a student nurse's handwritten placement notes. Distinct notes may be scattered across the page at different angles.

Transcribe EXACTLY what is written. Do not correct, expand, Americanise or guess at words you cannot read. Use the surrounding prose to help you READ an ambiguous word, but never replace a written word with a different one you think is more likely. If a word remains unclear, transcribe your best reading and lower that block's confidence.

Only report wardHint if a ward or unit name is actually written on the page — never infer it from the prose.

A page may contain drawn structures — labels joined by arrows, lines or branches to a central node (a mind map), boxes in a flowchart, a labelled sketch. There may be more than one drawing on a page. For EVERY drawing: transcribe each written label as its own block, and give all of that drawing's labels the kind DIAGRAM and one groupKey unique to that drawing (a mind map's central node and all of its branch labels are ALL part of the drawing; a flowchart's decision answers like YES/NO are part of it too). Text that is merely near a drawing but not joined to it — a margin note, a heading — is NOT part of it.

ALSO fill the top-level "diagrams" field with one entry per drawing: its groupKey, what it is, and a Mermaid rebuild of its structure — "mindmap" syntax for a mind map (central node as root, one child per branch), "flowchart TD" for boxes and arrows (put written decision answers on the arrows: A -- YES --> B). Use EXACTLY the words written on the page as labels, nothing invented. No drawings → "diagrams": [].

Return ONLY JSON:
{"pageDateRaw":"<date exactly as written, or null>","wardHint":"<ward name written on the page, or null>","diagrams":[{"groupKey":"<the drawing's groupKey>","form":"mind map|flowchart|sketch","mermaid":"<mermaid source>"}],"blocks":[{"rawText":"<verbatim>","kind":"CLINICAL_SKILL|MEDICATION|REFLECTION|OBSERVATION|TODO|DATE_HEADER|DIAGRAM","confidence":0-1,"bbox":[x0,y0,x1,y1],"rotationDeg":<n>,"groupKey":"<shared by related blocks>","tags":["<subject>"]}]}`;

export interface VisionCallResult {
  model: string;
  parsed: VisionResponse | null;
  /** Whole-page text, blocks joined in emission order — the input to the consensus diff. */
  pageText: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

async function callVision(model: string, dataUri: string): Promise<VisionCallResult> {
  const res = await chat({
    model,
    maxTokens: MAX_TOKENS,
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
  const raw = parseModelJson(res.text);
  const validated = raw === null ? null : visionResponseSchema.safeParse(raw);
  const parsed = validated && validated.success ? validated.data : null;
  if (!parsed) {
    // Structural detail only, never content (same rule as the classifier's failure log).
    // Without this line a schema rejection was indistinguishable from a blurry photo.
    const issues =
      validated && !validated.success
        ? validated.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`)
            .join("; ")
        : "not JSON";
    console.warn(
      `vision ${model}: response rejected [${issues}] chars=${res.text.length} finish=${res.finishReason ?? "?"}`,
    );
  }
  return {
    model,
    parsed,
    pageText: (parsed?.blocks ?? []).map((b) => b.rawText).join("\n"),
    latencyMs: res.latencyMs,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
  };
}

export interface VisionPairResult {
  structure: VisionCallResult;
  /** `null` when the check model failed — the parse continues, treating everything as
   *  disputed so nothing is pre-selected (fail safe, not fail closed). */
  check: VisionCallResult | null;
}

/**
 * Run both models on the same image. A check-model failure is swallowed on purpose: losing
 * the second opinion degrades review quality, but failing the whole parse over it would
 * throw away a perfectly good transcription.
 */
export async function readPage(imageBase64: string, contentType: string): Promise<VisionPairResult> {
  const dataUri = `data:${contentType};base64,${imageBase64}`;
  const [structure, check] = await Promise.all([
    callVision(STRUCTURE_MODEL, dataUri),
    callVision(CHECK_MODEL, dataUri).catch((err: unknown) => {
      console.warn("check model failed; every block will be treated as disputed", err);
      return null;
    }),
  ]);
  return { structure, check };
}
