# Spec — Note Capture: photos of handwritten notes  (Status: SPECCED, not built — handwriting gate PASSED 2026-07-28)

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
namespace, no second auth path. Grilled 2026-07-27, amended 2026-07-28 after the
handwriting gate test.

## Pipeline at a glance

```
 photo ──> presign + PUT to S3 ──────────────────────────────── P1, P17
              │
    ┌─────────┴──────────┐  in parallel
    │                    │
 structure (qwen3-vl)   check (gemma-3-27b)                          P21
 rawText, regions,      second transcription
 generic hints          (discarded after diffing)
    │                    │
    └─────────┬──────────┘
              ├─> page-text diff ──────> disputedWords per block      P22, P23
              │
              ├─> SANITISE (text) ─────> text + corrections           P24
              │                          medical spell-check only
              │
              └─> CLASSIFY (text) ─────> the real blocks              P26-P31
                    + 219 statements     semantic units, may span or
                    + student context      subdivide vision regions
                      (client-supplied)  kind · groupId · targetType
                                         ranked code shortlist
                                         tags · gibbs (reflections only)
                                  │
                    student reviews, retypes, regroups, picks a shift  P35, P9
                                  │
                    allocate ──> REAL domain row + sourceType/sourceId P4, P5
                                 Reflection · MedicationLog
                                 ProficiencyStatusEvent · Shift.notes
```

**Four model calls per photo:** two vision in parallel, then sanitise, then classify.
Sanitise must precede classify — matching against `Phenoxyethylpenicillin` finds nothing.
Nothing reaches the student's record without an explicit confirm.

## Decisions (locked — grilled 2026-07-27, amended 2026-07-28)

Numbered P1–P38 in decision order; P26–P38 were added after grilling the classification
stage. Two supersessions, both kept in place rather than
deleted so nobody reinstates them:

- **P16 → P22.** Confidence-based review gating, with the measurements that killed it.
- **P3's segmentation implication → P26.** Vision blocks were originally treated as the
  block boundaries; the classifier owns them instead.

| # | Decision |
|---|----------|
| P1 | **Photos are retained in S3.** Presign → direct PUT → parse. The image is a durable artefact, not a throwaway input: it is the terminal node of the evidence chain (P5) and the only ground truth for checking a transcription. Costs a new bucket, CORS, presign endpoint, lifecycle config and a new limb on the erasure runbook. |
| P2 | **Patient-identifiable data: warning + accepted risk.** A camera cannot self-censor the way a keyboard can, so photos will sometimes contain identifiers. Firm warning before the camera opens; acknowledgement recorded per capture as `piiAcknowledged`, mirroring `Reflection.piiAcknowledged`. No PII gate, no redaction pass. Follows the precedent set for Sentry screenshots (`plans/2026-07-20-sentry-feedback.md` D-Screenshots). **See Accepted risks.** |
| P3 | **Blocks are first-class persisted rows.** New `NoteCapture` + `NoteBlock` entities in the owner partition, registered in the Dexie/sync registry (unlike `AiThread`/`AiMessage`). A block carries its text, geometry, kind, grouping, target and shift link. Value lands at capture, before any filing work. **Amended by P26:** rows are created from the *classifier's* semantic units, not from the vision model's regions. |
| P4 | **Allocation materialises the real domain row.** Allocating a block creates a genuine `Reflection` (+ sections), `MedicationLog` or `ProficiencyStatusEvent`. The `NoteBlock` survives as provenance. Presentation is seamless **by construction** — the thing *is* a Reflection, so it appears in every list, export and corpus with **zero changes to any read path**. |
| P5 | **Provenance = discriminated pair on materialisable entities.** `sourceType?: SourceType` + `sourceId?: string` added to `Reflection`, `MedicationLog`, `ProficiencyStatusEvent`. Mirrors the existing `EvidenceLink { evidenceType, evidenceId }` idiom; keeps a meaningless column off the other ~20 entities; the discriminator absorbs future sources (voice, import) without a backfill. Optional fields need no Dexie migration. Chain: **domain row → `NoteBlock` → `NoteCapture` → S3 object**. |
| P6 | **`shiftId` on both capture and block.** The capture carries the suggested shift for the page; each block defaults to it but is individually overridable, since a pocket notebook page can legitimately span two shifts. Materialised rows inherit the block's `shiftId`. Uses the existing "universal capture join" — no new concept. |
| P7 | **Block text may be appended into `Shift.notes`.** `SHIFT_NOTES` is a valid allocation target: the transcribed text is appended to the shift's own notes field. Note the consequence — `Shift.notes` is a string on a pre-existing row, so P5's 1:1 provenance model **cannot express it**. Appended words carry no `sourceType`/`sourceId`. Mitigated by recording `appendedTo` + `appendedText` on the block for de-dupe and revert (P19). |
| P8 | **The app resolves the shift, not the model.** The model returns the date **exactly as written** (`"22/7"`) plus any other evidence (ward name, shift type). The client matches against the local shift list via the existing `[userId+date]` Dexie index. The model is never asked to supply a year it cannot see, and never returns an id. |
| P9 | **Ranked candidates, one recommendation, alternates visible.** Candidate shifts are day/month matches across **all years** (a student may be back-filling from last year), ranked most-recent-first. The top candidate is recommended and pre-selected; the rest are one tap away. No matching date at all → fall back to the most recent shift, flagged low confidence. Never silent. |
| P10 | **Linked blocks arbitrate into one suggested asset.** Blocks stay separate rows sharing a `groupId`; the **classifier** (P27) reasons across their combined content and proposes a **single** target. The student can edit any block's text and delink blocks freely. The UI aims to be as eloquent as possible at connecting to existing models, while making override trivial. Note the division of labour with P26: the classifier decides both where one block *ends* and which blocks *belong together* — splitting and grouping are the same judgement seen from two directions. |
| P11 | **Two text fields on one row: `rawText` frozen, `text` editable.** `rawText` is the vision model's verbatim transcription, frozen at parse and never overwritten. `text` is what the student works with — produced by the sanitisation pass (P24), then editable by hand. Three known states (verbatim → sanitised → student-edited), not an open-ended revision history, so **no SK version-control pattern**: that would multiply synced rows (`syncPull` scans the whole user partition) and break the one-row-per-entity assumption in `EntityMap`/`STORE_INDEXES`. The frozen `rawText` is what makes P24 safe to auto-apply. |
| P12 | **New `parseFn` Lambda inside the existing `Ai` construct.** Reuses `auth.ts`, `provider.ts`, `metrics.ts` and the Bedrock/mantle IAM already granted. Its own Function URL, own timeout and memory, **non-streaming** (four model calls, ~30s, returning one JSON object). Returns blocks as JSON; **the client writes them to Dexie** and the outbox syncs them. `parseFn` needs **no table access at all** — not even read — because the student's context arrives in the request body (P32) rather than being queried. |
| P13 | **Photos are kept for the life of the account.** No lifecycle expiry. A three-year degree means year-1 photos must still back year-3 PAD evidence. Deleted only by GDPR erasure. **See Accepted risks.** |
| P14 | **Unallocated blocks feed the AI recall corpus; allocated ones do not.** Photo content becomes askable immediately, and once allocated the materialised row already covers it — so the same words never appear twice and input-token count stays honest. Adds a `NOTE_BLOCK` sentinel type to `NoteCard.tsx`. |
| P15 | **Global capture entry point.** One affordance available anywhere; the app infers the shift (P8/P9). No shift-bound entry in v1. |
| P16 | ~~Low-confidence blocks are shown, flagged, never pre-selected.~~ **SUPERSEDED by P22 (2026-07-28) — self-reported confidence is measurably worthless.** Measured against ground truth on a real page: `gemma` wrote `Acyclovir` for `Aciclovir` at `confidence: 1.00`; `qwen` corrupted the longest drug name on the page while reporting `1.00` on every block; `ministral`'s *highest*-confidence block held its *worst* error while its 0.90 block held a harmless expansion — confidence ran **inversely** to severity. The original P16 would have caught none of these and pre-selected all of them. |
| P17 | **Own daily counter: `AI#<sub>` / `DAILY#PHOTO#<date>`, limit 10 photos/day.** Same atomic `ADD` + 48h TTL pattern as the question cap, separate key — photos and questions have different cost shapes and one should not consume the other. **The presign is issued inside the cap check**, or uploads stay uncapped even when parsing is capped. |
| P18 | **No eval harness.** Phase 5 of AI recall was skipped and is skipped again here. **See Accepted risks.** |
| P19 | **Un-allocating reverses the write.** The materialised row is soft-deleted (standard tombstone) and appended text is stripped back out of `Shift.notes`. Requires storing `appendedText` verbatim; if the student has since edited that text so it no longer matches, leave it in place and say so rather than guessing. |
| P20 | **Several photos per capture, uploaded one at a time.** A capture is a notebook session, not a single page. Photos upload and parse sequentially, each appending blocks to the same `NoteCapture`. Combined with P17 this is up to 10 photos/day across any number of captures. |
| P21 | **Two vision models per parse, called in parallel.** `qwen.qwen3-vl-235b-a22b-instruct` is the **structure** model — it owns blocks, kinds, groups, geometry and page fields, and its transcription is the one stored as `rawText`. `google.gemma-3-27b-it` is the **check** model, used only as a transcription cross-check; its output is never stored. gemma was chosen *because its bias differs*, not because it is more accurate — it reliably Americanises `Aciclovir` and drops the `r` in `Filgrastim`, which guarantees a flag on exactly the class of word that matters. A more accurate checker with *correlated* errors would be worse. Both ids are env config (`AI_VISION_MODEL_ID`, `AI_VISION_CHECK_MODEL_ID`). Full bake-off and the rejection of `mistral.ministral-3-14b-instruct` in Appendix 2. |
| P22 | **Review gating is by two-model disagreement, not confidence.** Both models transcribe; the app diffs their **whole-page text** and flags the individual words they disagree on, mapped back to the block containing them. A block with no disagreements is pre-selected; a block with any is shown with its disputed words called out and is not pre-selected. Self-reported `confidence` is still stored, for observability only — it must never gate anything. |
| P23 | **Consensus is page-level, never block-level.** Block-aligned diffing was built and abandoned: the same page came back as 5 blocks from the check model on one run and 28 on the next, so the models never reliably agree on where a block begins. Page text is stable; segmentation is not. Word pairing must also be **character-similarity based, not adjacency based** — a naive adjacency pass reported `"V)" vs "Phenoxymethylpenicillin"` and buried the actual finding, because the two models place the `(Penicillin V)` gloss differently. Naming the wrong word is worse than raising no flag: the student checks something that isn't the error. |
| P24 | **Sanitisation pass — an intelligent medical spell-checker.** A third, text-only call takes the whole page (so it has surrounding context) and corrects **tokens that are not valid terms in UK clinical English**: non-existent drug names, mangled clinical terms, transcription artefacts, and US spellings. Its scope is a spell-checker's scope, and the boundary is strict — **a synonym is not an error.** It must not reorder, restructure, add content, expand abbreviations, or correct the student's clinical reasoning. `preventative` stays (valid British English). `man made` stays. `co-trimox` stays. `bacterial and fungal` stays even where the model would prefer `protozoal` — that is the student's note, and correcting their pharmacology is a different feature. British English is the target lexicon, so `Acyclovir` → `Aciclovir` is orthography rather than judgement. The "intelligent" part is context: `blow methotrexate clearance` is caught not because `blow` isn't a word but because it isn't valid usage here. Writes to **`text` only** — `rawText` stays frozen (P11), so every correction is diffable and revertible. **Auto-applied**, because a spell-checker does not ask permission per word, with the corrections list surfaced in review so anything wrong is one tap to undo. |
| P25 | **The sanitiser and consensus are orthogonal, not alternatives.** Consensus (P22) catches *disagreement between two readings*; the sanitiser catches *tokens that aren't real*. A non-word both vision models agree on is caught **only** by the sanitiser. A plausible-but-wrong reading of a real word (`Aciclovir` → `Acyclovir`) is caught by either. A wrong-but-real word that both models agree on is caught by **neither** — that is the residual gap, and it is why the student still reviews. |
| P26 | **Vision blocks are guidance; the classifier owns the boundaries.** The vision model's regions are *evidence about where the subject changes* — often right, not always. The real blocks are semantic: serialised patterns of text that may appear as one vision region or span two or three. So a `NoteBlock` is a **semantic unit**, and its rows are created after classification, not from the vision output. Supersedes the implication in P3 that vision segmentation is final. |
| P27 | **Classification is its own call, on sanitised text.** The fourth model call. It is *not* folded into the sanitiser: Appendix 3 measured what happens when one model is handed two jobs, and it drifted into rewriting. It must run after P24 because matching depends on correct terms — `Phenoxyethylpenicillin` would match nothing. |
| P28 | **Match depth: target type plus a ranked shortlist.** For each block the classifier returns the target type *and* its top 3–5 candidate taxonomy codes, ranked, top one pre-selected. It never silently commits to one of 219 statements. The shortlist is also how uncertainty is expressed — see P31. |
| P29 | **The whole taxonomy is stuffed: all 219 statements, ~7.8k tokens.** Measured: code + statement is 31,237 chars. Sent once per photo, not per block. No vector store, consistent with AI recall's D3. **No pre-filtering by block kind** — a medication note must be able to evidence a Platform 4 statement about medicines management, and that cross-match is exactly what students need for PAD. Annexe B (84 items) doubles as the clinical-skills list via the existing 1:1 `skill_B2.1` ↔ `prof_B2.1` code mapping. Context is assembled as **discrete providers per context type** so each becomes a tool handler when the classifier goes agentic (see Open questions). |
| P30 | **One classifier call, conditional output per block.** Type-specific fields are emitted only for the types that need them: Gibbs stages on reflection blocks, medication candidates on medication blocks, taxonomy codes on skill blocks, nothing extra on observations. Gibbs therefore moves out of the vision contract, where it was both meaningless for most blocks and computed from unsanitised text. Vision hints stay **generic** — segmentation and tags only. |
| P31 | **No second classifier.** Transcription needed consensus because its errors are *invisible* — a wrong drug name reads as correct. A wrong classification is **visible**: it sits in a ranked list the student is already looking at, and swapping it is one tap. Asymmetric harm, asymmetric checking. Self-reported classifier confidence is not used to gate anything (P22 applies here too). |
| P32 | **The client supplies the student's context; `parseFn` keeps zero table access.** The request carries the student's `Medication` card names, `Tag` labels and current placement name/`settingType` — the app is local-first and already holds all of it in Dexie, so there is no query on the hot path and no new IAM. **`ProficiencyStatus` is deliberately withheld:** letting the classifier see which statements are `NOT_YET_ACHIEVED` would rank evidence by what the student still needs rather than by what the note actually shows, which is the wrong incentive in a record heading toward the NMC. |
| P33 | **Medication: link an existing card, else offer to create one.** Match against the student's own `Medication` cards (they are `UserOwned`). No card yet → the review screen offers to create one **pre-filled from the block's own content**, which for a page like the test photo already supplies class, indication and side effects. Never created silently. |
| P34 | **Unclassifiable blocks are kept as `UNKNOWN` and retypeable.** A shopping list, a phone number, an illegible fragment gets an honest `UNKNOWN` kind rather than a confident wrong guess, and the student moves it to the right type in the UI (P35). Nothing the student wrote is ever discarded, and the block still reaches the AI recall corpus under P14. |
| P35 | **Review layout: list on mobile, lanes on wider screens.** Narrow screens get blocks in reading order with a type control each; wider screens get lanes per target type with drag between them, so the whole page's routing is visible at a glance. **Mobile is the primary path** — students photograph notes on a phone — so the list must be the good experience and lanes are the enhancement. |
| P36 | **Deterministic serialisation.** Regions are sorted into reading order from their bbox (top-to-bottom by centre, left-to-right on ties) and handed over with **soft region markers** the classifier may cross. Determinism matters because model emission order is not stable — the check model returned 5 blocks on one run and 28 on the next — so without a sort the same photo could classify differently each time. |
| P37 | **Tags: reuse existing labels, propose new ones.** Matched against the student's own `Tag` labels first and applied silently; genuinely new tags are surfaced as suggestions to tick. `Tag` is unique per user+label and its whole value is pulling notes back later for essays and revalidation, so near-duplicate sprawl (`haematology` / `haem` / `haematology patients`) would destroy the index it exists to be. |
| P38 | **No deterministic lookup tables anywhere in the pipeline.** A BNF-derived lookup was prototyped and measurably worked — 2,589 keys, edit distance ≤2, it corrected every drug-name error observed in testing including the Americanisations, because BNF spelling is inherently British. **Rejected anyway**, and deliberately: the notes contain far more than drugs (`NG tube`, `pH 5.5`, `PAD sign off`, `OSCE`, procedures, conditions, equipment), so a table per domain does not generalise, goes stale, and turns one intelligent layer into a patchwork of special cases. Correction stays model-driven (P24). BNF data may still *pre-fill* a created medication card (P33) — that is linking, not correcting. |

**Set-by-default (veto on read):** nothing is written to the student's record without an
explicit confirm; parse output is zod-validated and invalid blocks are dropped silently
(fail closed, mirroring the sentinel parser); **client downscales to 2400px long edge,
JPEG q85** before upload — 1600px was tried and demonstrably cost drug names (see
Appendix), 2400px lands at ~700 KB; `max_tokens` 4096 on each parse call; the check
model's JSON is repaired-then-discarded, never stored; word-pair flagging ignores
case, punctuation and leading/trailing dashes (the models disagree endlessly about
whether a dash attaches left or right, and surfacing that is pure noise); Cedar reuses
the existing `List`/`SensitiveRecord` gate with `resourceId: "scope:ai-photo"` rather
than a new policy-store action; metrics extend the existing `PlaceMate/AI` EMF namespace.

## Models (P21)

Both on the mantle `openai-compat` route, the **same adapter, endpoint and signing** as
AI recall with image content parts added. Called **in parallel**; ids are env config
(`AI_VISION_MODEL_ID`, `AI_VISION_CHECK_MODEL_ID`).

| Role | Model | Job |
|---|---|---|
| **Structure** | `qwen.qwen3-vl-235b-a22b-instruct` | Owns blocks, kinds, groups, geometry, page fields. Its transcription is the one stored. |
| **Check** | `google.gemma-3-27b-it` | Transcription cross-check only. Its output is never stored — it exists to disagree. |

`gemma` is the check model **because its bias differs**, not because it's accurate. It
reliably Americanises `Aciclovir` → `Acyclovir` and drops the `r` in `Filgrastim`, which
guarantees a flag on exactly the class of word that matters. A more accurate model with
*correlated* errors would be a worse checker.

**Rejected: `mistral.ministral-3-14b-instruct`.** Fastest and briefly top of the
accuracy table on a single run, but: 3 of 6 runs emitted unparseable JSON (unquoted
property names); it paraphrases rather than transcribes (`preventative` → `Prophylactic`,
`chemo` → `chemotherapy`, `taking` → `on`); it emitted a stray Korean character into
"haematology patients"; and it returned the string `"null"` where JSON `null` belongs.
A model that rewrites a student's notes into its own words is disqualified regardless of
its score. **Single-run testing picked it as the winner** — only repeat trials exposed
the drift. Any future model swap must be evaluated over ≥4 runs.

Verified on real handwriting 2026-07-28 — see Appendix 2.

## Data model (single table; codegen via `gen:zod`)

Owner partition, standard bases. Unlike the AI recall entities, these **do** register in
the Dexie/sync registry: `EntityMap`, `STORE_INDEXES`, and `V7_ADDED_STORES`.

```ts
export type NoteCaptureStatus = "PARSING" | "REVIEW" | "DONE";

export type NoteBlockKind =
  | "CLINICAL_SKILL" | "MEDICATION" | "REFLECTION"
  | "OBSERVATION"    | "TODO"       | "DATE_HEADER"
  | "UNKNOWN";       // classifier couldn't type it — honest, retypeable (P34)

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
  rawText: string;          // vision model's verbatim transcription — frozen at parse (P11)
  text: string;             // sanitised (P24), then student-edited (P11)
  corrections?: string;     // comma-separated "from|to" pairs the sanitiser applied (P24),
                            // surfaced in review so any correction is one tap to revert
  candidateCodes?: string;  // comma-separated taxonomy codes, best first (P28) —
                            // e.g. "B2.1,B2.4,3.4". First is pre-selected; the rest are
                            // one tap away. Empty for kinds with no taxonomy target.
  suggestedTags?: string;   // comma-separated tag labels (P37). Labels already in the
                            // student's Tag list are applied; new ones need confirming.
  medicationCandidate?: string;  // matched Medication.id, or a name to offer creating (P33)
  kind: NoteBlockKind;      // suggested type (P3)
  confidence: number;       // 0–1 (P16)
  bboxX0: number; bboxY0: number; bboxX1: number; bboxY1: number;  // 0–1 fractions
  rotationDeg: number;
  disputedWords?: string;   // comma-separated "structureReading|checkReading" pairs (P22).
                            // Empty/absent = both models agreed = safe to pre-select.
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
| `POST {fnUrl}/parse` | new `parseFn` (JSON) | `{ captureId, imageKey, imageIndex }` → verify JWT → AVP gate → read object from S3 → **two vision calls in parallel** (structure + check, P21) → page-text diff (P23) → **sanitisation call** (P24) → validated `{ blocks[], pageDateRaw, wardHint }` with per-block `disputedWords[]` and `corrections[]`. Writes nothing. |

**Pipeline shape.** Three model calls: two vision calls in parallel, then one text call
that depends on the structure model's output.

```
             ┌─ structure (qwen3-vl) ──┐            (rawText, blocks, kinds, groups)
image ──────>┤                         ├─> diff ──> sanitise ──> blocks[]
             └─ check (gemma-3-27b) ───┘   (P23)      (P24)       rawText + text
                                                                 + disputedWords
                                                                 + corrections
```

Observed wall clock 12–22s for the vision pair, plus ~3–5s for the sanitiser, so budget
**~30s** and set the timeout to 60s. The review screen needs a real wait state.

**Degradation is per-stage, and never fails the parse:**

| Stage fails | Behaviour |
|---|---|
| Structure model | **Parse fails.** There is nothing to show. |
| Check model | Parse succeeds; every block is treated as disputed so nothing is pre-selected (fail safe). |
| Sanitiser | Parse succeeds; `text` falls back to `rawText` verbatim and no corrections are claimed. A missing spell-check is a degraded result, never a wrong one. |
| Classifier | Parse succeeds; blocks fall back to the vision model's regions with `kind: UNKNOWN` and no targets. The student routes them by hand (P35) — the feature degrades to a transcription tool, which is still useful. |
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
    "rawText": "…",             // verbatim — the ONLY text the vision model produces (P11)
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

**`bbox` needs normalising on receipt.** The contract asks for 0–1 fractions and the
structure model returns a **0–1000 scale** instead (observed consistently: the same block
came back as `[130,577,910,746]` across every run). Divide by 1000 on ingest and validate
the range, or overlays render in the wrong place. The values themselves are stable and
trustworthy — a crop taken from them landed exactly on the intended block.

### Sanitisation contract (P24)

A text-only call over the whole page's `rawText`. **The model is never handed prose it is
licensed to rewrite** — its output is a list of token corrections plus the corrected text,
and the scope boundary is enforced by the prompt, not by hope:

```jsonc
{
  "corrections": [
    { "from": "Phenoxyethylpenicillin", "to": "Phenoxymethylpenicillin",
      "reason": "not a real drug name" },
    { "from": "Acyclovir", "to": "Aciclovir", "reason": "US spelling" }
  ],
  "correctedText": "…"
}
```

The instruction set that matters, in priority order:

1. **British English / BNF conventions are the target lexicon** — `aciclovir` not
   `acyclovir`, `haematology` not `hematology`, `-ise` not `-ize`.
2. **Every drug name and clinical term must be real.** A name that does not exist as
   written is always a transcription error and must be corrected to the real term it is
   closest to.
3. **Correct invalid usage in context** — `blow methotrexate clearance` → `block`.
4. **A synonym is not an error.** Do not swap `preventative` → `prophylactic`, `man made`
   → `recombinant`, or expand `chemo` → `chemotherapy` or `co-trimox` → `co-trimoxazole`.
5. **Never reorder, restructure, add content, tidy grammar, or correct the student's
   clinical reasoning.** `bacterial and fungal` stays as written.

Every one of rules 4 and 5 exists because a model broke it in testing — see Appendix 3.
A correction whose `from` does not appear verbatim in `rawText` is **discarded**, which
mechanically blocks the whole class of invented edits.

### Classifier contract (P26–P37)

A text-only call, after sanitisation. **Input:**

1. The page's sanitised text in **deterministic reading order** with soft region markers
   (P36) — `[r1] … [r2] …`, boundaries the classifier may cross.
2. The vision model's **generic hints** — its own segmentation guess and any tags. Marked
   explicitly as guidance, not instruction.
3. **All 219 proficiency statements**, `code|statement`, ~7.8k tokens (P29).
4. **The student's context, supplied by the client** (P32): `Medication` card names, `Tag`
   labels, current placement name + `settingType`. Never `ProficiencyStatus`.

**Output** — the blocks as the app will store them, one entry per *semantic* unit:

```jsonc
{
  "blocks": [{
    "fromRegions": [2, 3],          // which vision regions this drew from (may be 1 or many)
    "text": "…",                    // the sanitised text belonging to this block
    "kind": "CLINICAL_SKILL",       // or UNKNOWN (P34)
    "groupKey": "a",                // shared with blocks that belong together (P10)
    "targetType": "PROFICIENCY_EVENT",
    "candidateCodes": ["B2.1", "B2.4", "3.4"],   // ranked, first pre-selected (P28)
    "tags": ["haematology", "drug safety"],       // existing labels reused (P37)
    "medicationCandidate": "Filgrastim",          // medication blocks only (P33)
    "gibbs": { "DESCRIPTION": "…", "FEELINGS": "…", "ACTION_PLAN": "…" }  // reflections only (P30)
  }]
}
```

The conditional fields matter: `gibbs` on a medication block or `candidateCodes` on an
observation are noise, and asking for them everywhere invites the model to invent them.

**Why the taxonomy is not pre-filtered by kind** (P29): a medication note evidencing a
Platform 4 statement on medicines management is precisely the cross-match a student needs
for PAD, and filtering by `kind` — itself only a hint at this point — would make it
unreachable.

**Zod-validated on return.** A `candidateCode` that isn't a real proficiency code is
dropped; a `medicationCandidate` that matches no card becomes a create-offer rather than a
link; a block whose `text` isn't a substring of the sanitised page is discarded entirely,
which is the same structural guard P24 uses against invented content.

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
| Review (mobile — primary) | Blocks in reading order, each with its sanitised `text` (editable), a type control, its group, and its shift. Blocks with `disputedWords` show those words highlighted inline with both readings offered and are unticked; blocks both models agreed on are ticked (P22). Expect **2–3 disputed words per page**. |
| Review (wide) | The same blocks arranged in lanes per target type — Reflections, Medications, Clinical skills, Shift notes, Unknown — draggable between lanes, so the page's whole routing is visible at once (P35). |
| Taxonomy pick | On a skill or proficiency block, the top `candidateCode` is pre-selected with its statement shown in full, and the remaining 2–4 candidates are one tap away. The full 219-item picker remains reachable for when none of them fit (P28). |
| Unknown blocks | Grouped last under an honest label. Moving one to a type is a drag on wide screens, a dropdown on mobile (P34). Never auto-filed, never discarded. |
| New medication | A medication block with no matching card offers "add Filgrastim to your medications?", pre-filled from the block's own content. Declining still files the `MedicationLog`, just unlinked (P33). |
| New tags | Tags the student already uses are applied silently; genuinely new ones appear as tickable suggestions (P37). |
| Corrections | Words the sanitiser changed (P24) are shown subtly marked, with the original from `rawText` on tap and a one-tap revert. Presented as "spell-checked", not as a decision the student must make — they are already applied. |
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
- **Nothing is written without confirmation** (P22) — there is no auto-file path.
- **Two independent readings gate review** (P22). This is the guardrail against the
  feature's worst failure mode, which is not garbled text but a **confident plausible
  substitution**: `Aciclovir` → `Acyclovir`, `Filgrastim` → `Filgastim`,
  `Phenoxymethylpenicillin` → `Phenoxyethylpenicillin`. These read as correct, sit at
  confidence 1.00, and would be silently filed by any single-model design.
- **`wardHint` must be written on the page, never inferred.** An early prompt let the
  check model return `wardHint: "Haematology"` from the prose "haematology patients" —
  which would have fed shift matching (P8/P9) and mislinked the capture. The instruction
  "only report wardHint if a ward or unit name is actually written on the page" fixed it.
- **`rawText` is frozen** (P11), so a sanitised or student-edited block can always be
  compared against what the vision model actually read.
- **The sanitiser is scope-limited by construction, not by instruction alone** (P24): a
  correction whose `from` string does not appear verbatim in `rawText` is discarded. This
  is the mechanical guard against a model that decides to improve the prose — and it is
  needed, because in testing three separate models rewrote clinical content while being
  explicitly told not to.
- **Fail closed on parse** — invalid blocks are dropped, never guessed at.
- **Idempotent allocation** — the guard against duplicate rows and double appends.
- **`SelfCareCheckin` is not an allocation target**, keeping the structural self-care
  exclusion (D4) intact.
- **The classifier never sees `ProficiencyStatus`** (P32). Withholding it is a deliberate
  integrity guard: a classifier that knows which statements are outstanding would rank
  evidence by what the student *needs* rather than by what the note *shows*, and this
  record ends up in front of the NMC.
- **A block whose text isn't a substring of the sanitised page is discarded** (P26/P27) —
  the same structural rule as P24's corrections, applied to segmentation. The classifier
  can re-split and regroup the student's words; it cannot introduce any.

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

- 10 photos/user/day (P17), each costing **four** model calls — two vision (P21), one text
  sanitiser (P24), one classifier (P27). Measured on the real page at 2400px: structure
  ~4,441 in / ~770 out tokens, check ~507 in / ~650 out, sanitiser ~800 in / ~400 out. The
  classifier is the largest text call at ~9k in (7.8k of that the taxonomy, P29) / ~800 out. Still
  comfortably under a penny per photo at open-weight mantle pricing — AI recall's measured
  comparator is ~$0.0064/question at ~13k input tokens. The daily cap counts **photos, not
  calls**, so a cap hit is explainable to a student.
- S3: ~400KB/photo downscaled. At the beta cohort this is rounding error; at scale it is
  the retention decision (P13), not the storage price, that matters.
- Existing AWS Budgets alerts (`$50/$150/$400`) already cover Bedrock spend; S3 is not
  Bedrock-filtered and will need watching separately if usage grows.

## Observability

Extends the existing `PlaceMate/AI` EMF namespace and the `alarms.ts` construct — same
dimension discipline (`[["Provider","Model"]]` only, so a new error code cannot fan out
cost).

New metrics: `PhotosParsed`, `ParseLatencyMs`, `BlocksDetected`, `DisputedWords`,
`DisputedBlocks`, `CheckModelFailures`, `Corrections`, `CorrectionsReverted`,
`SanitiserFailures`, `ClassifierFailures`, `UnknownBlocks`, `CodeShortlistAccepted`,
`BlocksAllocated`, `ParseErrors`, `PhotoCapHits`.
Properties: `ErrorCode`, `ImageBytes`, `BlockKinds`.

`CodeShortlistAccepted` — how often the student keeps the pre-selected top code rather than
picking a lower-ranked one or none — is the only measurement of classifier accuracy that
comes from real use, and the shortlist design (P28) rests on it being high. `UnknownBlocks`
rising means the classifier is giving up.

`CorrectionsReverted` / `Corrections` is the signal that tells you whether the sanitiser is
helping or meddling. A rising revert rate means it has started editing rather than
spell-checking, and it is the only feedback loop on P24 that comes from real students.

New alarms: `AiParseErrors` — `ParseErrors` Sum ≥3 / 5 min → the existing SNS topic. And
`AiCheckModelDown` — `CheckModelFailures` Sum ≥5 / 15 min, because a silently dead check
model degrades the feature to single-model parsing while still looking healthy (the same
class of silent failure as `AiCacheReadsZero` in AI recall, and the reason that alarm
exists).

Two signals worth watching by eye early on: `BlocksAllocated` vs `BlocksDetected` (a wide
gap means suggestions are wrong often enough to be ignored), and `DisputedWords` per photo
(measured at 2–3 on a clean page; a jump means the check model has drifted and is
generating noise rather than signal).

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

**Resolved 2026-07-28** by `scripts/eval-note-capture.ts` against a real page of
handwritten medication notes: handwriting is legible to these models (the gate is passed);
the downscale target is 2400px, not 1600px; confidence cannot gate review; one model is
not enough; and `wardHint` must be constrained to text on the page.

Still open:

- **~30s is now the wait after taking a photo**, across four calls (vision 12–22s parallel,
  sanitise ~4s, classify ~5–8s). That is a long spinner on a phone. The likely answer is to
  return blocks as soon as vision+sanitise finish and fill classification in progressively,
  but that changes `parseFn` from one JSON response to a staged one and is a real design
  decision, not a detail. **Decide this before building the review screen.**
- **Classifier accuracy is completely unmeasured.** Transcription has 8 runs of hard data;
  the classifier has none. The whole shortlist design (P28) assumes it is roughly right and
  the top candidate is usually correct. `scripts/eval-note-capture.ts` can be extended to
  score it — it needs the expected codes for the test page hand-labelled once. Until then
  `CodeShortlistAccepted` in production is the only evidence, which is late.
- **Tool-calling over the mantle `openai-compat` route is unverified.** SigV4 signing and
  image content parts are both proven; function calling is not. P29's future agentic
  classifier depends on it, so probe it cheaply before designing around it.
- **`kind` is now nearly redundant with `targetType`.** They map almost 1:1
  (`MEDICATION`→`MED_LOG`, `REFLECTION`→`REFLECTION`, `CLINICAL_SKILL`→`PROFICIENCY_EVENT`,
  the rest→`SHIFT_NOTES`). Both are kept because `kind` is what the vision model can hint
  at and `targetType` is the classifier's decision, but if that distinction stops earning
  its keep in the UI, collapse them.
- **Long-word corruption is the residual risk.** Across 7 runs the structure model
  corrupted `Phenoxymethylpenicillin` — the longest word on the page — in 3 of them, a
  different way each time (`Phenoxyethyl…`, `Phenoxymenthyl…`, and once split across
  tokens). Consensus caught two of the three cleanly. Worth measuring on more pages
  before deciding whether long clinical terms need special handling.
- **Words split across line breaks** defeat the word-level diff (run 5: the structure
  model emitted `methylpenicillin` as its own token, so only part of the error paired).
  Joining hyphen- and line-broken words before diffing would likely fix it.
- **False-flag rate** is 2–3 per clean page, and one run produced 6 when the check model
  had a bad pass. Acceptable now; needs a ceiling before wider release, or students will
  learn to tick through the flags without reading them — which would defeat the whole
  mechanism.
- Bucket encryption choice (S3-managed vs KMS) given P2.
- Whether the presign should constrain image dimensions as well as byte size.
- Only one real page has been tested. It is single-column and evenly lit — the scattered,
  rotated, multi-orientation page this feature was conceived for is **still unvalidated**
  on real handwriting.

## V2 notes (explicitly out of scope)

**Agentic classifier with tools** (P29): instead of stuffing all 219 statements, the
classifier fetches context on demand — `getProficiencyStatements(kind)`,
`getClinicalSkills()`, `getMedicationCards()`, `getShifts(dateRange)`. v1 is built with
context assembly split into **discrete providers per context type** precisely so each one
becomes a tool handler without restructuring the classifier. Blocked on verifying that the
mantle route supports function calling.

Re-parsing stored photos when the vision model improves (P1 makes this possible, but no
UI in v1); cross-page block grouping within a capture (P20 groups within a page only);
shift-bound capture entry (P15); a Textract hybrid for geometry if the VLM's bboxes prove
unreliable; PII detection/redaction (P2 revisit); lifecycle expiry for unallocated
captures (P13 revisit); an accuracy feedback loop from student edits back into prompt
tuning; `SKILL`/`SkillProgress` as an allocation target.

---

## Appendix 1 — first probe (printed text), 2026-07-27

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

**Two caveats from that first probe:**

- The test image was **printed text**, not handwriting.
- The page said `22/7`. The model returned `"pageDate": "2024-07-22"` — **it fabricated a
  year, and got it wrong by two.** This is the direct cause of P8 (model returns the date
  as written; the app resolves the year).

---

## Appendix 2 — real handwriting, 2026-07-28

Run via `scripts/eval-note-capture.ts` against a photographed page of handwritten
medication notes (3024×4032 iPhone original → 2400px / 696 KB upload). Ground truth was
transcribed by hand and scored on 13 terms where a misread is dangerous rather than
untidy. Logs in `evidence/note-capture/` (untracked — they contain the note text).

**Model bake-off, 4 trials each at 2400px:**

| Model | Clean runs | Errors observed | Failure character |
|---|---|---|---|
| `qwen.qwen3-vl-235b-a22b-instruct` | 3 / 4 | `Penicillin V` once | Occasional lapse, otherwise stable. Best segmentation and grouping. |
| `mistral.ministral-3-14b-instruct` | 1 / 4 | `Aciclovir`, then `neutropenia`, then `GCSF` | **Random drift**, different term each run. **3 of 6 runs unparseable JSON.** Paraphrases. Rejected. |
| `google.gemma-3-27b-it` | 0 / 2 | `Acyclovir`, `Filgastim` every time | **Systematic override** of the page from its own priors. Useless alone; ideal as a checker. |
| `writer.palmyra-vision-7b` | — | network failure | Untested. |

At **1600px** both leading models misread `Phenoxymethylpenicillin` (differently). At
2400px both read it. That single comparison is why the downscale default changed.

**Consensus, 7 runs of the page-level mechanism:** structure model perfect in 4; in the
other 3 it corrupted `Phenoxymethylpenicillin`. Consensus caught 2 cleanly and 1 partially.
Zero critical errors were missed once word pairing was similarity-based.

The cleanest demonstration, run 7 — the structure model wrote a wrong drug name at
confidence 1.00 and the checker caught it:

```
? "Phenoxymenthylpenicillin"  (check model read: "Phenoxymethylpenicillin")
errors caught by consensus : 1
errors missed by consensus : 0
```

**Why confidence was abandoned (P16 → P22).** Every flagged block in every run reported
`selfConf 1.00`. `gemma` wrote `Acyclovir` at 1.00. `ministral`'s highest-confidence block
held its worst error while its lowest-confidence block held a harmless expansion. There is
no threshold that separates the good runs from the bad ones.

**Method note worth keeping:** the first single-run bake-off ranked `ministral` first —
11/11 terms in 5s, three times faster than `qwen`. It took repeat trials to expose that its
errors merely moved around, and a sixth run to expose the unparseable JSON. **Never choose
a vision model from one run.**

**Textract** is reachable in eu-west-2 (`DetectDocumentText` answered
`InvalidParameterException` to empty bytes) and remains a V2 fallback for geometry, but
it supplies no semantics and would be a second service doing less than the one call this
spec already makes.

---

## Appendix 3 — how NOT to prompt the sanitiser, 2026-07-28

A first attempt at P24 was **mis-scoped, and the failure is instructive** because the
symptoms look like a capability limit when they are actually a scope leak. Recorded so the
mistake isn't repeated.

The bad prompt handed the model the **whole page as prose** together with two conflicting
instructions: "aggressively correct non-existent drug names" *and* "do not paraphrase,
expand or tidy anything". Given a licence to rewrite and a contradiction to resolve, all
three models tested resolved it by drifting into general copy-editing.

Measured over 8 stored runs containing 4 known corruptions of `Phenoxymethylpenicillin`:

| Judge model | Fixed (of 4) | Runs where it damaged correct text |
|---|---|---|
| `deepseek.v3.2` | 2 | 1 |
| `zai.glm-4.7` | 2 | 1 |
| `qwen.qwen3-235b-a22b-2507` | 0 | 6 of 8 |

What "damaged" meant in practice — every one of these is now an explicit prohibition in
the P24 contract:

- `deepseek` rewrote `"side effects - lower back pain"` → `"side effects - bone pain (e.g.,
  lower back)"`, **inventing clinical detail the student never wrote**, and swapped
  `preventative` → `prophylactic` and `man made` → `recombinant`. On that same pass it
  *failed* to fix the actual wrong drug name.
- `glm-4.7` decided the student's pharmacology was wrong and changed `bacterial and fungal`
  → `protozoal`. It also emitted hallucinated corrections where `from` equalled `to`,
  reasoning about a word not present in the text.
- `qwen3-235b` took a **correct** word and corrupted it: `block` → `blow`, with
  justification that argued the opposite of the change it made.

**The lesson is the prompt shape, not the models.** A sanitiser must be given a token-level
job with a token-level output, and corrections must be mechanically validated against
`rawText` (P24) so an invented edit cannot land regardless of what the model returns. The
`from`-must-appear-verbatim rule would have rejected every single damaging edit above.

This appendix records a *rejected implementation*, not a rejected decision. P24 stands.
