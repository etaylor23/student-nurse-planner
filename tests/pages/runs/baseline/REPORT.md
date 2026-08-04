# Baseline run — 2026-08-04, pre-DIAGRAM pipeline

Run through the real UI (localhost dev SPA → deployed dev backend) as
ellis.taylor499@gmail.com; block records harvested from each page's cached `parse.json`
(P41). Judged against `../../expectations.md`.

## Verdicts

| Page | Verdict | Detail |
|---|---|---|
| real-shift-and-junk | **FAIL — classifier discarded** | Classifier returned `groupKey: null` on 3 blocks; zod contract rejects null, whole response thrown away, every block UNKNOWN. Transcription/consensus side all passed (date-as-written, `Ward 12` hint, `tea bags\|teabags` dispute). |
| real-mixed-resp | **FAIL — classifier discarded** | Same null idiom, this time `gibbs.<stage>: null` — the log shows the classifier HAD produced a Gibbs split before being discarded. Sanitiser also expanded `neb → nebuliser`, an abbreviation expansion the product promises never to make. Vision joined the cross-column peak-flow note into one region (P26 win). |
| real-mindmap-sepsis | **FAIL — must-hits** | Vision superb: all six spokes, both 90°-rotated margin notes, the upside-down BUFFALO line, `wardHint` correctly null. But the classifier's merged mind-map block failed the `isFromPage` containment guard (scattered text ≠ contiguous), was dropped, and coverage resurrected the map as 7 UNKNOWN fragments. The TODO (`ask about immunosuppression…`) was bundled into a margin CLINICAL_SKILL block → must-hit fail. No diagram concept exists yet. |
| real-medications | **PASS (2 misses)** | All four drug paragraphs MEDICATION → MED_LOG. Furosemide auto-linked to an existing card (P33). Misses: Co-amoxiclav's `medicationCandidate` came back `Amoxicillin` (constituent, not the drug); `wardHint: "Bay 4"` (a bay is not a ward). |
| real-haematology-meds | **PASS** | `Aciclovir` correct + `Aciclovir\|Acyclovir` dispute raised (the check model Americanised, exactly as designed). `Phenoxymethylpenicillin` intact, undisputed. `Filgrastim` corrupted by BOTH models but **disputed** (`Filgastrim\|Filgastim`) → flagged to the student, which is the designed outcome. |

## The systemic bug

`infra/lambda/parse/schema.ts` promises "malformed entries are dropped rather than failing
the whole parse" but `classifyResponseSchema.safeParse` fails the WHOLE response when any
block has `null` where an optional field is expected — and glm-5 routinely uses `null` for
"absent" (`groupKey: null`, `gibbs: {FEELINGS: null}`). 2 of 5 pages lost an entire good
classification to this. Fix: tolerate null on optional fields, drop null-valued gibbs
stages, and salvage per-block instead of per-response.

Log evidence (CloudWatch `/aws/lambda/nurse-planner-ai-parse-dev`):

```
WARN classifier: JSON did not match the contract [blocks.3.groupKey: invalid_type; …] falling back to unclassified regions
WARN classifier: JSON did not match the contract [blocks.1.gibbs.FEELINGS: invalid_type; …] falling back to unclassified regions
WARN classifier: dropped 1 block(s) whose text was not on the page   ← the mind-map merge
WARN coverage: recovered 7 region(s) the classifier dropped          ← the mind-map fragments
```
