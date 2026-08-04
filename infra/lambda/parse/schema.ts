import { z } from "zod";

/**
 * Zod contracts for every model response in the parse pipeline
 * (spec-note-capture.md P12/P21/P24/P27).
 *
 * Models are treated as untrusted input, not as APIs. Every schema is permissive about
 * what it *accepts* and strict about what it *passes on*: unknown fields are stripped,
 * malformed entries are dropped rather than failing the whole parse, and anything that
 * can't be validated leaves the pipeline degraded rather than wrong.
 */

/** The vision model returns bbox on a 0–1000 scale despite the prompt asking for 0–1
 *  fractions — observed consistently (`[130,577,910,746]` on every run). Normalising here
 *  rather than at the call sites is what stops overlays rendering in the wrong place. */
export const BBOX_SCALE = 1000;

const bboxTuple = z.array(z.number()).length(4);

export const visionBlockSchema = z
  .object({
    rawText: z.string().min(1),
    kind: z.string().optional(),
    confidence: z.number().optional(),
    bbox: bboxTuple.optional(),
    rotationDeg: z.number().optional(),
    groupKey: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strip();

export const visionResponseSchema = z
  .object({
    /** Never normalised — the model must return the date AS WRITTEN (P8). */
    pageDateRaw: z.string().nullable().optional(),
    wardHint: z.string().nullable().optional(),
    blocks: z.array(visionBlockSchema),
  })
  .strip();

export type VisionResponse = z.infer<typeof visionResponseSchema>;
export type VisionBlock = z.infer<typeof visionBlockSchema>;

export const correctionSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    reason: z.string().optional(),
  })
  .strip();

export const sanitiseResponseSchema = z
  .object({
    corrections: z.array(correctionSchema).default([]),
    correctedText: z.string(),
  })
  .strip();

export type Correction = z.infer<typeof correctionSchema>;

export const GIBBS_STAGES = [
  "DESCRIPTION",
  "FEELINGS",
  "EVALUATION",
  "ANALYSIS",
  "CONCLUSION",
  "ACTION_PLAN",
] as const;

export const NOTE_BLOCK_KINDS = [
  "CLINICAL_SKILL",
  "MEDICATION",
  "REFLECTION",
  "OBSERVATION",
  "TODO",
  "DATE_HEADER",
  "DIAGRAM",
  "UNKNOWN",
] as const;

export const NOTE_BLOCK_TARGETS = [
  "REFLECTION",
  "MED_LOG",
  "PROFICIENCY_EVENT",
  "SHIFT_NOTES",
] as const;

/**
 * `null` means "absent" to the classifier model — it writes `"groupKey": null` and
 * `"gibbs": {"FEELINGS": null}` as a matter of idiom, and both are equivalent to omitting
 * the field. The first corpus baseline lost 2 of 5 pages' entire classifications to
 * treating that idiom as a contract breach. Absent and null are the same fact; accept both.
 */
const optionalString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

export const classifiedBlockSchema = z
  .object({
    /** Which vision regions this drew from — a semantic block may span several (P26). */
    fromRegions: z.array(z.number().int().nonnegative()).default([]),
    text: z.string().min(1),
    /** An unrecognised kind becomes UNKNOWN rather than failing: honest, and retypeable (P34). */
    kind: z.enum(NOTE_BLOCK_KINDS).catch("UNKNOWN"),
    groupKey: optionalString,
    targetType: z
      .enum(NOTE_BLOCK_TARGETS)
      .nullish()
      .transform((v) => v ?? undefined),
    /** Ranked, best first. Validated against the real taxonomy by the caller (P28). */
    candidateCodes: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    medicationCandidate: optionalString,
    /** Reflection blocks only (P30) — meaningless elsewhere, so optional not required.
     *  A null stage value means the model had nothing for that stage: drop the stage. */
    gibbs: z
      .record(z.enum(GIBBS_STAGES), z.string().nullish())
      .nullish()
      .transform((g) => {
        if (!g) return undefined;
        const entries = Object.entries(g).filter(
          (e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0,
        );
        return entries.length ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
      }),
  })
  .strip();

/** Declared as an interface (optional fields stay optional) rather than inferred — the
 *  nullish transforms above would otherwise type every optional as required-but-undefined,
 *  which every constructor of a fallback block would then have to spell out. */
export interface ClassifiedBlock {
  fromRegions: number[];
  text: string;
  kind: (typeof NOTE_BLOCK_KINDS)[number];
  groupKey?: string;
  targetType?: (typeof NOTE_BLOCK_TARGETS)[number];
  candidateCodes: string[];
  tags: string[];
  medicationCandidate?: string;
  gibbs?: Record<string, string>;
}

/**
 * One malformed block must cost that block, not the page (the module promise above).
 * Each entry is parsed independently; failures are dropped, with the count surfaced so
 * the caller can log it.
 */
export const classifyResponseSchema = z
  .object({
    blocks: z.array(z.unknown()).default([]),
  })
  .strip()
  .transform(({ blocks }) => {
    const parsed: ClassifiedBlock[] = [];
    let malformed = 0;
    for (const raw of blocks) {
      const result = classifiedBlockSchema.safeParse(raw);
      if (result.success) parsed.push(result.data);
      else malformed++;
    }
    return { blocks: parsed, malformed };
  });

/**
 * Parse a model's text output as JSON, tolerating the two malformations actually observed:
 * a markdown fence around it, and (from the rejected ministral) unquoted property names,
 * trailing commas and `//` comments.
 *
 * Returns `null` rather than throwing — every caller has a defined degraded path, and a
 * model returning rubbish should never take the whole parse down with it.
 */
export function parseModelJson(text: string): unknown | null {
  const stripped =
    text
      .replace(/^[\s\S]*?```(?:json)?\s*/, "")
      .replace(/```[\s\S]*$/, "")
      .trim() || text.trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const repaired = stripped
      .replace(/\/\/[^\n]*/g, "")
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

/** Normalise a model bbox to 0–1 fractions, clamped. Absent/malformed → a full-page box. */
export function normaliseBbox(bbox?: number[]): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  if (!bbox || bbox.length !== 4) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  // Values ≤1 are already fractions (a model that followed the prompt); anything larger is
  // on the 0–1000 scale it actually uses.
  const scale = bbox.some((n) => n > 1) ? BBOX_SCALE : 1;
  const [x0, y0, x1, y1] = bbox.map((n) => clamp(n / scale));
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}
