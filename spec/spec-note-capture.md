# Spec — Note Capture: photos of handwritten notes  (Status: SPECCED, not built)

The second AI layer in PlaceMate. A student photographs a page of their own scribbled
placement notes; a vision model finds the **distinct blocks** on the page — however they
are scattered, rotated or interleaved — transcribes each one, **suggests what kind of
note it is** (clinical skill, medication, reflection…), **suggests which blocks belong
together**, and **suggests the shift** the page belongs to. The student reviews, edits,
and allocates. Allocating creates the **real domain row** — a genuine `Reflection`,
`MedicationLog` or `ProficiencyStatusEvent` — so captured notes are indistinguishable
from typed ones everywhere in the app, while keeping an evidence trail back to the
original image.

Runs on the **same Bedrock mantle endpoint and provider adapter** as
[`spec-ai-recall.md`](./spec-ai-recall.md) — no new AI infrastructure, no new IAM
namespace, no second auth path. Grilled 2026-07-27.

## Decisions (locked — grilled 2026-07-27)

| # | Decision |
|---|----------|
| P1 | **Photos are retained in S3.** Presign → direct PUT → parse. The image is a durable artefact, not a throwaway input: it is the terminal node of the evidence chain (P5) and the only ground truth for checking a transcription. Costs a new bucket, CORS, presign endpoint, lifecycle config and a new limb on the erasure runbook. |
| P2 | **Patient-identifiable data: warning + accepted risk.** A camera cannot self-censor the way a keyboard can, so photos will sometimes contain identifiers. Firm warning before the camera opens; acknowledgement recorded per capture as `piiAcknowledged`, mirroring `Reflection.piiAcknowledged`. No PII gate, no redaction pass. Follows the precedent set for Sentry screenshots (`plans/2026-07-20-sentry-feedback.md` D-Screenshots). **See Accepted risks.** |
| P3 | **Blocks are first-class persisted rows.** New `NoteCapture` + `NoteBlock` entities in the owner partition, registered in the Dexie/sync registry (unlike `AiThread`/`AiMessage`). A block carries its text, geometry, suggested kind, confidence, grouping and shift link. Value lands at capture, before any filing work. |
| P4 | **Allocation materialises the real domain row.** Allocating a block creates a genuine `Reflection` (+ sections), `MedicationLog` or `ProficiencyStatusEvent`. The `NoteBlock` survives as provenance. Presentation is seamless **by construction** — the thing *is* a Reflection, so it appears in every list, export and corpus with **zero changes to any read path**. |
| P5 | **Provenance = discriminated pair on materialisable entities.** `sourceType?: SourceType` + `sourceId?: string` added to `Reflection`, `MedicationLog`, `ProficiencyStatusEvent`. Mirrors the existing `EvidenceLink { evidenceType, evidenceId }` idiom; keeps a meaningless column off the other ~20 entities; the discriminator absorbs future sources (voice, import) without a backfill. Optional fields need no Dexie migration. Chain: **domain row → `NoteBlock` → `NoteCapture` → S3 object**. |
| P6 | **`shiftId` on both capture and block.** The capture carries the suggested shift for the page; each block defaults to it but is individually overridable, since a pocket notebook page can legitimately span two shifts. Materialised rows inherit the block's `shiftId`. Uses the existing "universal capture join" — no new concept. |
| P7 | **Block text may be appended into `Shift.notes`.** `SHIFT_NOTES` is a valid allocation target: the transcribed text is appended to the shift's own notes field. Note the consequence — `Shift.notes` is a string on a pre-existing row, so P5's 1:1 provenance model **cannot express it**. Appended words carry no `sourceType`/`sourceId`. Mitigated by recording `appendedTo` + `appendedText` on the block for de-dupe and revert (P19). |
| P8 | **The app resolves the shift, not the model.** The model returns the date **exactly as written** (`"22/7"`) plus any other evidence (ward name, shift type). The client matches against the local shift list via the existing `[userId+date]` Dexie index. The model is never asked to supply a year it cannot see, and never returns an id. |
| P9 | **Ranked candidates, one recommendation, alternates visible.** Candidate shifts are day/month matches across **all years** (a student may be back-filling from last year), ranked most-recent-first. The top candidate is recommended and pre-selected; the rest are one tap away. No matching date at all → fall back to the most recent shift, flagged low confidence. Never silent. |
| P10 | **Linked blocks arbitrate into one suggested asset.** Blocks stay separate rows sharing a `groupId`; the model reasons across their combined content and proposes a **single** target. The student can edit any block's text and delink blocks freely. The UI aims to be as eloquent as possible at connecting to existing models, while making override trivial. |
| P11 | **Two text fields on one row: `rawText` frozen, `text` editable.** The model is permitted to *polish* transcribed text so imports read well — but the verbatim transcription is frozen at parse time and never overwritten. Three known states (verbatim → AI-polished → student-edited), not an open-ended revision history, so **no SK version-control pattern**: that would multiply synced rows (`syncPull` scans the whole user partition) and break the one-row-per-entity assumption in `EntityMap`/`STORE_INDEXES`. |
| P12 | **New `parseFn` Lambda inside the existing `Ai` construct.** Reuses `auth.ts`, `provider.ts`, `metrics.ts` and the Bedrock/mantle IAM already granted. Its own Function URL, own timeout and memory, **non-streaming** (one ~8s call returning one JSON object). Returns blocks as JSON; **the client writes them to Dexie** and the outbox syncs them, so `parseFn` needs no table write access and the local-first pattern is untouched. |
| P13 | **Photos are kept for the life of the account.** No lifecycle expiry. A three-year degree means year-1 photos must still back year-3 PAD evidence. Deleted only by GDPR erasure. **See Accepted risks.** |
| P14 | **Unallocated blocks feed the AI recall corpus; allocated ones do not.** Photo content becomes askable immediately, and once allocated the materialised row already covers it — so the same words never appear twice and input-token count stays honest. Adds a `NOTE_BLOCK` sentinel type to `NoteCard.tsx`. |
| P15 | **Global capture entry point.** One affordance available anywhere; the app infers the shift (P8/P9). No shift-bound entry in v1. |
| P16 | **Low-confidence blocks are shown, flagged, and never pre-selected.** Nothing the model saw is hidden from the student, and nothing uncertain is filed by default. No confidence threshold, no silent drops. |
| P17 | **Own daily counter: `AI#<sub>` / `DAILY#PHOTO#<date>`, limit 10 photos/day.** Same atomic `ADD` + 48h TTL pattern as the question cap, separate key — photos and questions have different cost shapes and one should not consume the other. **The presign is issued inside the cap check**, or uploads stay uncapped even when parsing is capped. |
| P18 | **No eval harness.** Phase 5 of AI recall was skipped and is skipped again here. **See Accepted risks.** |
| P19 | **Un-allocating reverses the write.** The materialised row is soft-deleted (standard tombstone) and appended text is stripped back out of `Shift.notes`. Requires storing `appendedText` verbatim; if the student has since edited that text so it no longer matches, leave it in place and say so rather than guessing. |
| P20 | **Several photos per capture, uploaded one at a time.** A capture is a notebook session, not a single page. Photos upload and parse sequentially, each appending blocks to the same `NoteCapture`. Combined with P17 this is up to 10 photos/day across any number of captures. |

**Set-by-default (veto on read):** nothing is written to the student's record without an
explicit confirm; parse output is zod-validated and invalid blocks are dropped silently
(fail closed, mirroring the sentinel parser); client downscales to ~1600px long edge,
JPEG q0.8 before upload; `max_tokens` 2048 on the parse call; Cedar reuses the existing
`List`/`SensitiveRecord` gate with `resourceId: "scope:ai-photo"` rather than a new
policy-store action; metrics extend the existing `PlaceMate/AI` EMF namespace.

## Model

`qwen.qwen3-vl-235b-a22b-instruct` on the mantle `openai-compat` route — the **same
adapter, endpoint and signing** as AI recall, with image content parts added. Model id is
env config (`AI_VISION_MODEL_ID`), swappable without a deploy shape change.

Verified working end-to-end on 2026-07-27 — see Appendix. **Not yet verified on real
handwriting** (see Open questions).

## Data model (single table; codegen via `gen:zod`)

Owner partition, standard bases. Unlike the AI recall entities, these **do** register in
the Dexie/sync registry: `EntityMap`, `STORE_INDEXES`, and `V7_ADDED_STORES`.

```ts
export type NoteCaptureStatus = "PARSING" | "REVIEW" | "DONE";

export type NoteBlockKind =
  | "CLINICAL_SKILL" | "MEDICATION" | "REFLECTION"
  | "OBSERVATION"    | "TODO"       | "DATE_HEADER";

export type NoteBlockStatus = "PENDING" | "ALLOCATED" | "DISMISSED";
export type NoteBlockTarget = "REFLECTION" | "MED_LOG" | "PROFICIENCY_EVENT" | "SHIFT_NOTES";
export type SourceType = "NOTE_BLOCK";

interface NoteCapture extends Entity, UserOwned, Created, Updated {
  shiftId?: string;         // suggested shift for the page (P6/P9)
  pageDateRaw?: string;     // date exactly as written, e.g. "22/7" — never normalised (P8)
  imageKeys: string;        // comma-separated S3 keys in upload order (P20; same idiom
                            // as AiMessage.noteRefs — keys are generated, never contain commas)
  piiAcknowledged: boolean; // mirrors Reflection.piiAcknowledged (P2)
  status: NoteCaptureStatus;
}

interface NoteBlock extends Entity, UserOwned, Created, Updated {
  captureId: string;        // FK → NoteCapture
  imageIndex: number;       // which photo within the capture (P20)
  rawText: string;          // verbatim transcription — frozen at parse (P11)
  text: string;             // AI-polished, then student-edited (P11)
  kind: NoteBlockKind;      // suggested type (P3)
  confidence: number;       // 0–1 (P16)
  bboxX0: number; bboxY0: number; bboxX1: number; bboxY1: number;  // 0–1 fractions
  rotationDeg: number;
  groupId?: string;         // linked blocks share this (P10)
  shiftId?: string;         // defaults to the capture's, overridable (P6)
  status: NoteBlockStatus;
  targetType?: NoteBlockTarget;  // set on allocation (P4)
  targetId?: string;             // the row it created
  appendedTo?: string;      // Shift.id, when allocated to SHIFT_NOTES (P7)
  appendedText?: string;    // exactly what was appended, for de-dupe + revert (P19)
}

// Additions to existing entities (P5) — optional, so no Dexie migration:
//   Reflection             += sourceType?: SourceType; sourceId?: string
//   MedicationLog          += sourceType?: SourceType; sourceId?: string
//   ProficiencyStatusEvent += sourceType?: SourceType; sourceId?: string
```

Sort keys: `NOTECAP#<id>`, `NOTEBLOCK#<id>`. Storage discriminator goes in **`sType`**,
never `entityType` — see the 2026-07-26 sync breakage in `dynamoRepository.ts:198-205`.

## API surface

| Route | Where | Purpose |
|---|---|---|
| `notes/presignCapture` | existing router RPC | `{ captureId, imageIndex, contentType, bytes }` → atomic `ADD` on `DAILY#PHOTO#<date>`; over limit → `CAP`. Under limit → presigned PUT URL, ~5 min expiry, content-length and content-type constrained. **The cap lives here** (P17). |
| `POST {fnUrl}/parse` | new `parseFn` (JSON) | `{ captureId, imageKey, imageIndex }` → verify JWT → AVP gate → read object from S3 → one vision call → validated `{ blocks[], pageDateRaw }`. Writes nothing. |
| — | client | Creates `NoteCapture`/`NoteBlock` rows in Dexie; the outbox syncs them (P12). |

Auth on `parseFn` mirrors `askFn` exactly: `aws-jwt-verify` on the **ID** token, then the
AVP `IsAuthorized` gate, then work. Everything before the first byte of response returns
JSON and emits no metrics. CORS + CSP `connect-src` both need the new Function URL origin
— **they are separate gates**, and the CSP one has bitten this project before
(`infra/lib/constructs/web.ts:100`).

### Parse contract

The model is asked for one JSON object and nothing else:

```jsonc
{
  "pageDateRaw": "22/7",        // exactly as written, or null (P8)
  "wardHint": "Ward 9",         // any other shift evidence, or null
  "blocks": [{
    "rawText": "…",             // verbatim (P11)
    "text": "…",                // lightly polished (P11)
    "kind": "REFLECTION",
    "confidence": 0.94,
    "bbox": [0.07, 0.49, 0.46, 0.58],
    "rotationDeg": -2,
    "groupKey": "a",            // shared by blocks that belong together (P10)
    "gibbs": { "DESCRIPTION": "…", "FEELINGS": "…", "ACTION_PLAN": "…" }  // reflection only
  }]
}
```

`gibbs` matters: `ReflectionModel` is `"GIBBS"`-only and a `Reflection` needs one
`ReflectionSection` per stage, so the model does the decomposition at parse time rather
than making the student do it at 9pm after a late. Stages it cannot fill are omitted.

Response is zod-parsed. Blocks failing validation are **dropped silently**; a wholly
unparseable response is a `PARSE_FAILED` error, not a partial write.

## Shift resolution (P8/P9)

Runs client-side against the local Dexie shift list:

1. Extract `(day, month)` and optionally `year` from `pageDateRaw`.
2. Candidates = shifts whose `date` matches day+month, **any year**.
3. If the page stated a year, filter to it.
4. Rank most-recent-first. `wardHint` breaks ties only — it never overrides a date match.
5. No candidates → fall back to the most recent shift overall, confidence `LOW`.
6. No shifts at all → no suggestion; the student picks or skips.
7. Recommend `candidates[0]`, pre-selected; expose the rest in the review UI.

## Allocation semantics (P4)

| Target | What gets created | Fields the block cannot supply |
|---|---|---|
| `REFLECTION` | `Reflection` + one `ReflectionSection` per filled Gibbs stage | `model: "GIBBS"` (only value); `title` = first ~60 chars; `occurredOn` = shift date; `piiAcknowledged` inherited from the capture |
| `MED_LOG` | `MedicationLog` | `type` defaults to `OBSERVED`; `date` = shift date; `medicationId` linked only on an exact name match, else left unset |
| `PROFICIENCY_EVENT` | `ProficiencyStatusEvent` | `progressId`, `status` and `partIndex` **cannot be inferred** — the student must choose them; the block only pre-fills `note` |
| `SHIFT_NOTES` | Appends to `Shift.notes` | No row is created; `appendedTo` + `appendedText` recorded on the block (P7/P19) |

All created rows carry `sourceType: "NOTE_BLOCK"` + `sourceId: <block.id>` and inherit
`shiftId`. Allocation is idempotent on `block.status` — a block already `ALLOCATED` is a
no-op, which is what stops a retry duplicating a row or double-appending to a shift.

**Un-allocation (P19):** soft-delete the target row via the normal tombstone path; for
`SHIFT_NOTES`, remove `appendedText` from `Shift.notes` **only if it still matches
verbatim**, otherwise leave it and tell the student it was edited so they can remove it
themselves. Then clear `targetType`/`targetId`/`appendedTo`/`appendedText` and set the
block back to `PENDING`.

## UX states

| State | Behaviour |
|---|---|
| Pre-capture | Firm warning: don't photograph anything patient-identifiable. Acknowledgement recorded on the capture (P2). |
| Uploading / parsing | Per-photo progress; sequential (P20). Cancellable. |
| Review | Photo with block overlays drawn from the bboxes; each block shows its text (editable), suggested kind, suggested target, and its group. Low-confidence blocks are visibly flagged and unticked (P16). |
| Shift bar | "Looks like **Tue 22 Jul** — Ward 9 late" with a picker exposing the other candidates (P9). Low-confidence fallback says so plainly. |
| Grouped blocks | Rendered joined, with the single proposed asset named. One tap to delink (P10). |
| Allocate | Ticked blocks materialise; the review screen reports what was created and links to each. |
| Unallocated leftovers | Stay as blocks. They remain askable via AI recall (P14). Not nagged about. |
| Daily cap hit | Reuses the AI recall tone: "You've used today's photos — they reset tomorrow. 🌱" (P17). |
| Parse failure | "Couldn't read that one — try a straighter, brighter photo?" The photo and capture survive; retry does not consume a second slot. |
| Kill switch | Same SSM parameter as AI recall; capture entry hidden. |

## Guardrails

- **Image content is untrusted data.** The system prompt states that text inside the
  photo is a student's notes, never instructions. Blast radius is bounded by design: the
  output is structured JSON, zod-validated, and every block is reviewed before anything
  is written.
- **Nothing is written without confirmation** (P16) — there is no auto-file path.
- **`rawText` is frozen** (P11), so a polished or student-edited block can always be
  compared against what the page actually said.
- **Fail closed on parse** — invalid blocks are dropped, never guessed at.
- **Idempotent allocation** — the guard against duplicate rows and double appends.
- **`SelfCareCheckin` is not an allocation target**, keeping the structural self-care
  exclusion (D4) intact.

## Accepted risks

Recorded explicitly, decided by Ellis on 2026-07-27, to be revisited before any widening
beyond the current beta cohort.

1. **Patient-identifiable data will land in S3** (P2). The mitigation is a warning and a
   recorded acknowledgement, not a control. PlaceMate therefore operates a store of
   potentially patient-identifiable clinical imagery. This raises the bar on DPIA,
   breach-notification posture, and any future conversation with a university or trust.
2. **Photos are retained indefinitely** (P13), including abandoned uploads that never
   backed a record — pure risk surface with no evidence value. Bounded only by GDPR
   erasure.
3. **No eval harness** (P18). This is the second AI surface to ship unprobed, and unlike
   the first it **writes to the student's permanent record**. No regression net for
   prompt edits, no adversarial injection cases, no measured transcription accuracy.

## Cost & limits

- 10 photos/user/day (P17). Probe measurement: 1218 input + 447 output tokens on a
  923×1200 page. Comfortably under a penny per photo at open-weight mantle pricing —
  AI recall's measured comparator is ~$0.0064/question at ~13k input tokens.
- S3: ~400KB/photo downscaled. At the beta cohort this is rounding error; at scale it is
  the retention decision (P13), not the storage price, that matters.
- Existing AWS Budgets alerts (`$50/$150/$400`) already cover Bedrock spend; S3 is not
  Bedrock-filtered and will need watching separately if usage grows.

## Observability

Extends the existing `PlaceMate/AI` EMF namespace and the `alarms.ts` construct — same
dimension discipline (`[["Provider","Model"]]` only, so a new error code cannot fan out
cost).

New metrics: `PhotosParsed`, `ParseLatencyMs`, `BlocksDetected`, `LowConfidenceBlocks`,
`BlocksAllocated`, `ParseErrors`, `PhotoCapHits`. Properties: `ErrorCode`, `ImageBytes`,
`BlockKinds`.

New alarm: `AiParseErrors` — `ParseErrors` Sum ≥3 / 5 min → the existing SNS topic.
`BlocksAllocated` vs `BlocksDetected` is the health signal worth watching by eye early
on: a wide gap means the suggestions are wrong often enough that students ignore them.

Every allocation writes the standard audit-log entry
(`entityType: "NOTE_BLOCK"`, `action: "BLOCK_ALLOCATED"`).

## Obligations created by P1/P13

Not optional, and not "later":

1. **`docs/runbooks/erasure.md` + `scripts/delete-user.ts` must delete the S3 prefix.**
   Until they do, the GDPR erasure path silently leaves the user's photos behind while
   reporting success.
2. **The privacy policy must disclose** that photos are stored, retained for the life of
   the account, and may be reviewed by the PlaceMate team — matching the existing AI
   recall notice's honesty.
3. **The pre-capture warning copy** needs the same Ellis sign-off pass as the AI recall
   copy (D19).

## Open questions

- **Real handwriting is unvalidated.** The probe used printed text at odd angles. Biro on
  a creased page under ward lighting is a different difficulty class. **Test this before
  building anything** — if `qwen3-vl` cannot read it, the answer is a different model or
  no feature, not a different data model. Alternatives to try in order:
  `moonshotai.kimi-k2.5`, `google.gemma-3-27b-it`, `mistral.ministral-3-14b-instruct`.
- Bucket encryption choice (S3-managed vs KMS) given P2.
- Whether the presign should constrain image dimensions as well as byte size.
- Client downscale target — 1600px is a guess until tested against real handwriting.

## V2 notes (explicitly out of scope)

Re-parsing stored photos when the vision model improves (P1 makes this possible, but no
UI in v1); cross-page block grouping within a capture (P20 groups within a page only);
shift-bound capture entry (P15); a Textract hybrid for geometry if the VLM's bboxes prove
unreliable; PII detection/redaction (P2 revisit); lifecycle expiry for unallocated
captures (P13 revisit); an accuracy feedback loop from student edits back into prompt
tuning; `SKILL`/`SkillProgress` as an allocation target.

---

## Appendix — live verification, 2026-07-27

Everything below was executed against the real account (`personal`, 641364901830,
eu-west-2) before this spec was written.

**Bedrock direct access is dead for every model, not just Anthropic.** Both of these
return `ValidationException: Error 002: Access to Bedrock models is not allowed for this
account`:

```
aws bedrock-runtime converse --model-id anthropic.claude-haiku-4-5-20251001-v1:0
aws bedrock-runtime converse --model-id amazon.nova-2-lite-v1:0
```

> **`spec-ai-recall.md` D6a needs correcting.** It attributes the block to the Anthropic
> model agreement specifically. The account has no standard Bedrock model access at all,
> so "flip `AI_PROVIDER` to `anthropic` when the support case resolves" rests on a
> diagnosis that does not match the account's actual state.

**The mantle endpoint is the only working LLM path**, and it carries images.
`GET /v1/models` returns 38 open-weight models; the vision-capable ones are
`qwen.qwen3-vl-235b-a22b-instruct`, `moonshotai.kimi-k2.5`, `google.gemma-3-{4,12,27}b-it`,
`mistral.ministral-3-{3,8,14}b-instruct`, `nvidia.nemotron-nano-12b-v2` and
`writer.palmyra-vision-7b`. Note the id suffix: the Bedrock catalogue lists
`qwen.qwen3-vl-235b-a22b`, but the mantle route requires `-instruct` or returns
`not_found_error`.

**Parse probe** — same SigV4 signing as `infra/lambda/ai/provider.ts`, `image_url`
content part with a base64 data URI, 923×1200 JPEG (91,889 bytes):

```
HTTP 200 in 7804ms — prompt_tokens 1218, completion_tokens 447
```

It returned clean JSON with all five visible blocks, each correctly kinded
(`date_header`, `clinical_skill`, `medication`, `reflection`, `todo`), plausible 0–1
bboxes, and read the rotations (+15°, −10°).

**Two caveats that shaped this spec:**

- The test image was **printed text**, not handwriting. Layout, rotation, grouping and
  typing are proven; transcription of real scrawl is not.
- The page said `22/7`. The model returned `"pageDate": "2024-07-22"` — **it fabricated a
  year, and got it wrong by two.** This is the direct cause of P8 (model returns the date
  as written; the app resolves the year).

**Textract** is reachable in eu-west-2 (`DetectDocumentText` answered
`InvalidParameterException` to empty bytes) and remains a V2 fallback for geometry, but
it supplies no semantics and would be a second service doing less than the one call this
spec already makes.
