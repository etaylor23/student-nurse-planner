# Spec — Note Capture Implementation Guide (agent execution order + human-in-the-loop)

_The build playbook for [`spec-note-capture.md`](./spec-note-capture.md) (decisions
P1–P40). Turns the spec into an ordered sequence an implementing agent follows, with the
actions **you** (the human) must take called out inline. Read the spec first; this guide
assumes its vocabulary (structure/check models, disputed words, sanitisation, classifier,
semantic blocks, allocation)._

## How to use this

- Work **phase by phase, in order**. Each phase is independently verifiable; don't start a
  phase until the previous **GATE** is signed off.
- **The golden rule: prove the whole seam end-to-end on ONE real photo (Phase 2) before
  building breadth (review UI, allocation, lanes).** Depth before width. This is the same
  rule AI recall followed and it is why its Phase 1 was a curl-verified thin slice.
- Legend:
  - **[AGENT]** — implementing agent does this (code, tests, IaC, CLI checks).
  - **[YOU]** — human-only action (sign-offs, labelling, judgement). Agent **stops and asks**.
  - **[GATE]** — checkpoint before the next phase.
- Standing rules: all AWS ops use **`--profile personal`** (account 641364901830,
  eu-west-2 — never the corporate account); prettier on **touched files only**; note photos
  and their transcriptions stay gitignored (`IMG_*.jpg`, `evidence/`) because the repo is
  public.

## 0. What I need from you — front-loaded checklist

| When | Action | Why |
|---|---|---|
| ⏳ **Now** | **[YOU]** Photograph a **genuinely messy page** — notes scattered at different angles, the thing this feature was conceived for — and hand it over | Every layout claim (P26, P36) rests on a *synthetic* printed test image. One real chaotic page could invalidate the segmentation and ordering design before either is built. Cheap now, expensive later. |
| Phase 1 | **[YOU]** Confirm the S3 retention posture in writing (P13: no expiry, deleted only by erasure) and that the privacy policy will disclose photo storage + team review | You accepted this risk; the policy text is yours to sign off, and the bucket is built to match it. |
| Phase 3 | **[YOU]** Hand-label the expected proficiency codes per block for the test photo | Turns the classifier from unmeasured into measured. Roughly an hour. Gates launch, not the build. |
| Phase 5 | **[YOU]** Sign off all copy: the pre-camera PII warning, correction/disputed-word wording, cap and failure messages | Same posture as AI recall D19 — you are the sole copy gate. |
| Phase 5 | **[YOU]** Approve the erasure-runbook change before it ships | `scripts/delete-user.ts` currently reports success while leaving photos behind. That is a GDPR defect the moment Phase 1 lands. |

---

## Phase 0 — Ground truth before code

Goal: confirm the model layer still behaves, and settle the two model choices the spec
leaves open, **before** any infrastructure exists.

1. **[AGENT]** Re-run `scripts/eval-note-capture.ts` on the existing test photo to confirm
   nothing has drifted (the mantle catalogue is not versioned; model ids have moved once
   already — `qwen.qwen3-vl-235b-a22b` needed an `-instruct` suffix).
2. **[YOU]** Provide the messy multi-orientation page (checklist above).
3. **[AGENT]** Run the harness on it. Check specifically: does the structure model find the
   scattered regions, are the bboxes usable, does reading-order sorting (P36) produce
   sensible serialisation on a non-linear page? **If it does not, stop** — P26 and P36 need
   revisiting before anything is built on them.
4. **[AGENT]** Bake off the **sanitiser** model (P39) over ≥4 runs each, scored on the
   Appendix 3 criteria: does it fix real errors, and does it damage correct text? Candidates:
   `deepseek.v3.2`, `zai.glm-4.7`, `zai.glm-5`, `mistral.mistral-large-3-675b-instruct`.
   Use the **token-scoped** contract from P24, not the mis-scoped prose prompt.
5. **[AGENT]** Bake off the **classifier** model (P39) over ≥4 runs, scored on top-1 and
   top-3 code accuracy once Phase 3's labels exist — until then, score on whether output
   validates and whether block splits are stable across runs.
6. **[AGENT]** Probe whether the mantle `openai-compat` route supports **function calling**
   (one trivial tool definition). Record the answer in this file's appendix — P29's future
   agentic classifier depends on it.

**[GATE 0]** Handwriting confirmed on a messy page; sanitiser and classifier models chosen
with run counts recorded; tool-calling answer recorded. **No model chosen from a single
run** — that mistake is documented in Appendix 2 and must not repeat.

---

## Phase 1 — Storage seam (no AI)

Goal: a photo can be uploaded, retained and erased. Nothing intelligent yet.

1. **[AGENT]** CDK: private S3 bucket in the existing stack — no public access, encryption
   on, CORS restricted to `config.allowedOrigins`, **no lifecycle expiry** (P13).
2. **[AGENT]** `notes/presignCapture` on the existing router RPC: AVP gate, atomic `ADD` on
   `AI#<sub>` / `DAILY#PHOTO#<date>` with a limit of **10** (P17), then a presigned PUT
   (~5 min, content-length and content-type constrained). **The cap must gate the presign**,
   or uploads are uncapped even when parsing is.
3. **[AGENT]** `NoteCapture` + `NoteBlock` in `src/domain/types.ts`; `sourceType`/`sourceId`
   on `Reflection`, `MedicationLog`, `ProficiencyStatusEvent` (P5); register in `EntityMap`,
   `STORE_INDEXES` and a new `V7_ADDED_STORES` (`db.ts` tops out at `version(6)`); run
   `npm run gen:zod`. Storage discriminator is **`sType`**, never `entityType`.
4. **[AGENT]** Client: capture affordance, camera/file input, **2400px downscale at q85**
   (P24 set-by-default — 1600px demonstrably lost drug names), presign → PUT, `NoteCapture`
   row written locally with `piiAcknowledged`.
5. **[AGENT]** Erasure: extend `docs/runbooks/erasure.md` **and** `scripts/delete-user.ts`
   to delete the user's S3 prefix. Add a test that fails if the prefix survives.
6. **[YOU]** Confirm retention posture + privacy policy wording (checklist).

**[GATE 1]** A photo uploads from the app to S3 and `scripts/delete-user.ts --execute`
removes it. Prove the deletion by listing the prefix before and after. Cap proven by
attempting an 11th upload in a day.

---

## Phase 2 — Thin vertical slice: one photo, all four calls (depth first)

Goal: the whole model seam working end-to-end on one real photo, output inspected by eye.
**No review UI yet.**

1. **[AGENT]** `parseFn` in `infra/lib/constructs/ai.ts`, reusing `auth.ts`, `provider.ts`,
   `metrics.ts` and the existing Bedrock/mantle IAM. Own Function URL, 60s timeout,
   non-streaming. **No table access at all** (P32 — context arrives in the request).
2. **[AGENT]** Wire the new Function URL into **both** CORS and the CSP `connect-src` in
   `web.ts`. These are separate gates and the CSP one has bitten this project before.
3. **[AGENT]** The four calls: structure + check in parallel (P21), page-text diff with
   character-similarity word pairing (P23), sanitise (P24), classify (P27). Each stage
   degrades per the spec's table — only a structure-model failure fails the parse.
4. **[AGENT]** Zod-validate everything on return, including the structural guards:
   `bbox` normalised from the **0–1000 scale** the model actually returns; a correction whose
   `from` is not verbatim in `rawText` **discarded**; a block whose `text` is not a substring
   of the sanitised page **discarded**.
5. **[AGENT]** Its own tsconfig wired into `npm run typecheck`, exactly as
   `infra/lambda/ai/tsconfig.json` is — `infra/tsconfig.json` excludes `lambda/**`, so
   otherwise this Lambda is typechecked by nothing.
6. **[AGENT]** A curl-equivalent script that posts a real photo and dumps the full response,
   so the output is inspectable without any UI.

**[GATE 2]** One real photo → correct blocks, plausible targets, ranked code shortlists,
disputed words flagged, all shown in the terminal. Deployed to dev and proven from the
browser (not just locally) so CORS and CSP are both confirmed.

---

## Phase 3 — Measurement

Goal: know how good the classifier actually is before students rely on it.

1. **[YOU]** Hand-label the expected proficiency codes per block for the test photo.
2. **[AGENT]** Extend `scripts/eval-note-capture.ts` to score classification: top-1 and
   top-3 code accuracy, target-type accuracy, block-split stability across runs.
3. **[AGENT]** Run ≥4 trials. Record results in this file's appendix, including the
   false-flag rate for disputed words (measured at 2–3 per clean page today).
4. **[AGENT]** If top-3 accuracy is poor, **stop and report** — P28's shortlist design
   assumes the right code is usually in the list. A shortlist that usually misses is worse
   than no suggestion, because it teaches students to trust it.

**[GATE 3]** Classifier accuracy is a number in this document, not an assumption.

---

## Phase 4 — Review UI + allocation

Goal: the student can act on a parsed photo.

1. **[AGENT]** Staged response handling (P40): render blocks at ~20s with text editable and
   no targets, then reconcile the classifier's semantic blocks when they arrive. **Design the
   reconciliation before writing it** — the spec flags this as the fiddliest part of the build.
2. **[AGENT]** Mobile list view first (P35 — the primary path): blocks in reading order,
   editable text, type control, disputed words highlighted with both readings, corrections
   subtly marked with one-tap revert to `rawText`.
3. **[AGENT]** Shift bar: ranked candidates, top pre-selected, alternates one tap away,
   low-confidence fallback stated plainly (P9).
4. **[AGENT]** Taxonomy picker: top `candidateCode` pre-selected with its full statement,
   remaining candidates one tap away, full 219-item picker reachable (P28).
5. **[AGENT]** Allocation (P4): materialise the real row with `sourceType`/`sourceId` and
   inherited `shiftId`; Gibbs sections from the classifier for reflections; `Shift.notes`
   append recording `appendedTo` + `appendedText`; idempotent on `block.status`.
6. **[AGENT]** Un-allocation (P19): soft-delete the row, strip appended text **only if it
   still matches verbatim**, otherwise leave it and say so.
7. **[AGENT]** Medication create-offer pre-filled from block content (P33); tag suggestions
   with existing labels applied and new ones tickable (P37); `UNKNOWN` blocks retypeable.
8. **[AGENT]** Wide-screen lanes with drag (P35) — **after** the mobile list is good.
9. **[AGENT]** Component tests following `tests/askNotesPanel.test.tsx`: jsdom via
   `environmentMatchGlobs` on `*.test.tsx`, `AiClient`-style mock with captured handlers so
   tests drive the staged response by hand.

**[GATE 4]** A real photo becomes a real `Reflection` and a real `MedicationLog`, both
carrying provenance back to the S3 object, and un-allocating cleanly reverses both.

---

## Phase 5 — Corpus, observability, copy, launch

1. **[AGENT]** `corpus.ts`: unallocated blocks only (P14), `[NOTE_BLOCK:<id> · <date>]`;
   `NOTE_BLOCK` sentinel branch in `NoteCard.tsx`.
2. **[AGENT]** EMF metrics into `PlaceMate/AI` (P24/P28 set): `PhotosParsed`,
   `ParseLatencyMs`, `BlocksDetected`, `DisputedWords`, `Corrections`,
   `CorrectionsReverted`, `CodeShortlistAccepted`, `UnknownBlocks`, `CheckModelFailures`,
   `SanitiserFailures`, `ClassifierFailures`, `BlocksAllocated`, `ParseErrors`,
   `PhotoCapHits`. Alarms: `AiParseErrors`, `AiCheckModelDown`. Dimensions stay
   `[["Provider","Model"]]` so a new error code can't fan out cost.
3. **[YOU]** Copy sign-off (checklist).
4. **[AGENT]** Live smoke test on `app.placemate.uk`: capture → parse → review → allocate →
   un-allocate → cap → erasure.

**[GATE 5]** Live on the real domain, alarms proven to deliver (force one into ALARM — a
pending SNS subscription silently drops them, which happened during AI recall).

---

## Cross-phase cautions

- **Green CI ≠ deployed.** Deploys don't gate on CI, the backend deploy misses `src/**`
  Lambda code, and `VITE_*` values are GitHub Actions `vars`, not stack outputs. A missing
  var means the feature silently stays invisible.
- **`infra/lambda/**` is excluded from `infra/tsconfig.json`.** Only `infra/lambda/ai/` has
  its own project wired into `npm run typecheck`; `parseFn` needs the same or it is
  typechecked by nothing.
- **dynalite is not faithful to DynamoDB validation** — an empty `begins_with` passes
  locally and 400s on real AWS. Test destructive paths against real AWS.
- **`sType`, never `entityType`.** Sharing that attribute killed sync app-wide once.
- **Never choose a model from one run** (Appendix 2). Four runs minimum, and score damage to
  correct output, not just fixes to wrong output.
- **Self-reported confidence gates nothing** (P22). If a future contributor reintroduces a
  confidence threshold, the measurements in Appendix 2 are the argument against it.

## Appendix — to be filled in during the build

| Item | Phase | Answer |
|---|---|---|
| Messy-page handwriting result | 0 | _pending_ |
| Sanitiser model chosen + run count | 0 | _pending_ |
| Classifier model chosen + run count | 0 | _pending_ |
| Mantle route: function calling supported? | 0 | _pending_ |
| Classifier top-1 / top-3 accuracy | 3 | _pending_ |
| Disputed-word false-flag rate | 3 | _pending_ |
| Staged-response reconciliation approach | 4 | _pending_ |
