# Post-DIAGRAM run — 2026-08-04, pipeline as of `master` (vision-nominated diagram synthesis)

Run via `scripts/parse-capture.ts` (session token) against the deployed dev stack, after the
P43 work landed: DIAGRAM kind + KEPT status, null-tolerant model contracts (both vision and
classifier), per-block salvage, and the DIAGRAM block **synthesised in code** from the vision
model's region nomination (`infra/lambda/parse/diagram.ts`).

## What changed on the way here (all found by this corpus)

1. **Classifier contract rejected null-for-absent** (`groupKey: null`, `gibbs: {FEELINGS: null}`)
   and discarded whole classifications — 2 of 5 baseline pages. Fixed: nullish coercion +
   per-block salvage.
2. **Prompt-level diagram extraction failed twice, in opposite directions** — one run merged
   the whole map + margins into one block; the next emitted only the diagram and normalised a
   misread word into invention (rightly dropped by the guard). Root cause found by direct
   probe: the classifier is text-only (P12) and answered `diagramRegions: []` — it cannot see
   arrows. **Vision now nominates** (per-region DIAGRAM hints + shared groupKey, largest
   cluster), classifier nomination unioned in, block built deterministically from region text.
3. **Vision contract had the same null bug**: mention groupKey in the prompt and qwen emits
   `"groupKey": null` → the whole page became PARSE_FAILED, silently. Fixed + vision schema
   rejections now logged (structural detail only).
4. Harness fixes: SSE consumption (P40), `--file` upload at the P41 key, valid captureId.

## Verdicts

| Page | Verdict | Detail |
|---|---|---|
| real-shift-and-junk | **PASS** | Date/ward as written; handover OBSERVATION; physio CLINICAL_SKILL; **MED CALC → TODO ✓**; phone + shopping list **UNKNOWN ✓** (junk never classified clinical); tilted bottom line OBSERVATION. |
| real-mixed-resp | **PASS** | Salbutamol paragraph MEDICATION + candidate + a 5-stage Gibbs split riding along; **peak-flow note joined across the column break ✓** (P26); Prednisolone MEDICATION ✓; spirometry **TODO ✓**. |
| real-medications | **PASS − 1** | Furosemide / **Co-amoxiclav (candidate now correct)** / Bisoprolol all MEDICATION ✓; side-effects list survives reflow un-flattened ✓. Miss: **Enoxaparin came back UNKNOWN** this run (classifier dropped the region, coverage recovered it — was MEDICATION at baseline). `wardHint: "Bay 4"` wart persists. |
| real-haematology-meds | **PASS − 2** | Aciclovir ✓ + dispute ✓; **Filgrastim transcribed correctly + disputed ✓**; Phenoxymethylpenicillin intact ✓. Misses: Co-trimoxazole and Phenoxymethylpenicillin blocks came back UNKNOWN this run (same under-coverage mode). New sanitiser wart: `PCP (pneumonia) → PCP (pneumocystis pneumonia)` — a clinical expansion inserting unwritten words (see the sanitiser follow-up task). |
| real-mindmap-sepsis | **PARTIAL** | **One DIAGRAM block synthesised ✓** — central node + spokes 3–6, union bbox, `diagram` tag, no target (keep/dismiss only). Content also present as its own blocks ✓; margin notes separate ✓; BUFFALO read correctly ✓. Misses: vision's membership left spokes 1–2 out and pulled the red-flag margin note in; the immunosuppression ask typed CLINICAL_SKILL, not TODO. **P44 addendum:** the final recorded run (post-Mermaid) also carries a guarded `mindmap` rebuild — central node as root, all six spokes as children — which rendered in the review card and survived the keep flow end-to-end. |

## Known gaps (recorded, not chased — the two-round iteration budget is spent)

1. **Vision DIAGRAM membership is approximate.** The set varies run to run; a margin note can
   be caught, a spoke missed. The synthesis is only as good as the nomination. The review
   screen's editable text + dismiss is the backstop. (A subsequent in-app run of the same
   page nominated the complete map — central node and all six spokes — and the keep flow was
   verified end-to-end there: DIAGRAM card → "Keep with this page" → `KEPT`, out of the
   pending walk, "Kept with the page" + Undo in the filed group.)
2. **Classifier under-coverage on busy pages.** Whole regions (Enoxaparin, Co-trimoxazole)
   drop to UNKNOWN via the coverage guard rather than being typed. Honest degraded state —
   the student retypes in one tap — but it regressed two baseline PASSes to warts.
3. **TODO vs CLINICAL_SKILL on lecture pages** — "ask about X" reads as skill knowledge to
   the classifier when the page is a lecture, not a shift.
4. **Check model (gemma) failed on most runs today** (`check.missing: true`), so dispute
   flagging was absent; and a missing check currently yields *zero* disputes rather than the
   fail-safe "treat everything as disputed" the vision module's comment promises. Worth its
   own look.
