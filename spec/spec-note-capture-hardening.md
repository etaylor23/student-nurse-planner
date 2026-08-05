# Note capture — wrap-up & hardening spec  (Status: PHASE 2 (H1–H3) BUILT + verified; H4/H5 in flight elsewhere; H6–H12 next)

Locked with Ellis 2026-08-05, after P43–P45 (diagrams, mermaid rebuilds, sub-blocks)
shipped. Two jobs: **round off** what the diagram work opened, then **harden and speed up
the upload → parse path** for real ward conditions. Decisions numbered H1–H12; build order
at the end. Parent spec: `spec-note-capture.md` (P1–P45).

Explicitly OUT of scope, by decision: HEIC gallery picks (ignored for now), test-data
cleanup in dev accounts (ignored), model-latency work on the parse itself (deferred — the
degenerate-read retry already trades latency for reliability in the right direction), and
any captures browser beyond the shift surface below.

**Known gaps noted, not chased** (model-judgement quality, diminishing returns —
re-recorded here per Ellis so they aren't re-discovered): classifier under-coverage on
busy pages (whole regions drop to UNKNOWN via the coverage guard); lecture-page "ask
about X" typing as CLINICAL_SKILL rather than TODO; vision cluster membership sometimes
pulling a margin note into a drawing's block text (the mermaid rebuilds exclude them).

## Rounding off

| # | Decision |
|---|---|
| H1 | **A kept drawing lives on its shift, like every other block.** The shift modal is one tab per attached record type (Medications / Skills / Reflections / Evidence); kept drawings become a **fifth tab, "Drawings"**, hidden when the shift has none. Each entry renders the mermaid rebuild (fail-closed, as everywhere), the transcription, and its **nested sub-blocks with their state chips** — a sub-block may have been filed in its own right (say, a med log) and shows as such; absorbed ones show as stored-inside. View-only in v1: actions stay in review, which the Photo button resumes. Membership = `block.shiftId ?? capture.shiftId`. |
| H2 | **Keeping never requires a shift.** Lecture pages are real — the sepsis mind map that motivated P43 has no shift. An unanchored kept drawing is still recallable (`[DIAGRAM:id]`) and still resumable via its capture; it surfaces on a shift the moment one is attached (review's shift chip already does this). |
| H3 | **Recall quotes gain their link.** `NoteCard` DIAGRAM refs currently render linkless; once H1 exists, an anchored drawing links to its shift's Drawings tab. Unanchored drawings stay linkless — quoting the words is still the useful part. |
| H4 | **The missing-check fail-safe becomes real.** `vision.ts` promises that a missing check model means "everything treated as disputed"; `index.ts` actually produces ZERO disputes — the Aciclovir safety net silently absent, and gemma failed most runs on 2026-08-04. Fix: the blocks payload carries `checkMissing`; review shows a meta-chip ("We couldn't double-check this page — drug spellings are unverified") rather than fabricating a dispute on every word, which would make review unusable. Plus a bounded investigation of WHY gemma fails (the vision-rejection logging now says whether it's schema, truncation or throttle): if it's the longer P45 prompt, trim what the check model receives — it only ever needed the transcription instruction; if throttle, retry the check once. Correct the vision.ts comment to describe reality. |
| H5 | **The sanitiser may swap, never extend.** It expanded `neb → nebuliser` and inserted words in `PCP (pneumonia) → PCP (pneumocystis pneumonia)`, against the P24 promise printed in the UI. Structural guard on validated corrections: reject when `to` contains `from` as a substring, or when `to` has more words than `from`. Same-word-count substitutions (`Phenoxyethylpenicillin → Phenoxymethylpenicillin`, `Filgastrim → Filgrastim`) still pass; expansions and insertions cannot, whatever the prompt does. Regression tests beside the existing "KNOWN GAP: synonym swap" test, which stays a known gap. |
| H6 | **The CLI user gets `kms:Sign`** on the passwordless key (IAM policy on the user — the CDK key policy already delegates to IAM), making `scripts/parse-capture.ts` fully self-serve: mint token → upload → parse, no browser session borrowed. One-off op action, documented in `tests/pages/README.md`. |

## Hardening

| # | Decision |
|---|---|
| H7 | **Retry with backoff on the whole client path.** Presign, S3 PUT and the parse POST each retry ×3 with exponential backoff + jitter (≈1s/3s/9s) on network errors, 5xx and 429 — never on other 4xx. Safe by construction: keys are content-addressed and the parse cache overwrites, so a duplicate attempt cannot double anything. An expired presign URL is re-requested rather than retried. The progress UI says "retrying" instead of dying — ward WiFi (UCLH) is the design case. |
| H8 | **Fresh parses get their own daily counter.** Today the 10/day cap gates only presigns; "read again from scratch" and direct POSTs run four-plus model calls uncounted. New `DAILY#PARSE#<date>` counter (same atomic ADD + 48h TTL idiom), limit **30/day**, enforced in the parse handler after auth: retries and re-reads never eat the photo allowance, model spend is bounded, and cache hits stay free — P41's promise holds. Over-cap → the same friendly-tone error frame as the photo cap. |
| H9 | **Interrupted captures recover instead of rotting.** A capture left in `PARSING`: on resume (the Photo button already resurfaces it), any page whose image uploaded but whose blocks never persisted is re-parsed — usually a free cache hit, since the parse likely completed after the client vanished. Pages that never finished uploading are dropped from `imageKeys`; a capture with no uploaded pages at all offers "start again". No stuck states a student can't leave. |

## Performance

| # | Decision |
|---|---|
| H10 | **Multi-page captures pipeline.** Page N+1 uploads while page N parses; **parses stay sequential** on purpose (the SSE progress UI is per-page, and parallel parses double Bedrock throttle exposure). Wall-clock for a multi-page session ≈ first upload + sum of parses, instead of sum of both. |
| H11 | **Downscale moves off the main thread.** OffscreenCanvas + `createImageBitmap` in a module worker, falling back to the current main-thread path where unsupported (same `LONG_EDGE`/`JPEG_QUALITY` constants, shared). Kills the encode jank on older phones at exactly the moment the student is mid-flow. |
| H12 | **Next-page downscale warms early.** The "presign while downscaling" idea from planning is **impossible as stated** — the presign needs the SHA-256 of the *downscaled* bytes (P41 content addressing), so it cannot precede the downscale. The same second is won honestly: while page N uploads/parses, page N+1's decode+downscale (and then hash+presign) run ahead, folded into H10's pipeline. Recorded so nobody re-proposes the impossible version. |

> **H4 and H5 are IN FLIGHT in separate sessions** (Ellis started both task chips,
> 2026-08-05). This spec records their agreed shape as the acceptance bar; this phase's
> sessions must NOT build them — rebase on master and verify their gates instead.

## Build order

1. **Defects first** (H4, H5) — *running in their own sessions; here we only verify.* Gate: corpus page `real-haematology-meds` shows disputes again on a run where gemma succeeds, AND shows the unchecked chip on a run where it fails (forced via env); sanitiser guard regression tests green.
2. **Kept-drawing home** (H1–H3) — domain read paths only, no parse changes. Gate: keep the heart-failure flowchart against a shift → it renders in the shift's Drawings tab with sub-block states; recall quote links to it. **DONE 2026-08-05** — gate met in the browser on the real corpus (sepsis mindmap kept against Fri 7 Aug: rebuild + transcription + one sub-note `Filed as Shift notes` beside six `Stored in the drawing`; the recall card's "Open this shift's drawings" lands on the tab). It also surfaced a live defect: `subBlocksOf` compared region indices without scoping to the capture — invisible while review (one capture at a time) was the only caller, and enough to make a drawing swallow every other page's notes the moment a shift surface handed it the student's whole block list.
3. **Hardening** (H7, H8, H9). Gate: kill the network mid-upload and mid-parse in the browser → both recover; parse counter visible in DynamoDB and enforced.
4. **Performance** (H10–H12). Gate: a two-page capture's wall-clock beats sequential by roughly one upload+downscale; main thread stays responsive during downscale (no long tasks > 100ms from the encode).
5. **Tooling** (H6), any time — it's independent.

Each phase lands as its own commit(s) on master with tests; the corpus (`tests/pages/`) is the
regression net for anything touching the parse path.
