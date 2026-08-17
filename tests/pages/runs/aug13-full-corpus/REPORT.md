# Run: full 12-page corpus regression (2026-08-13, judged 2026-08-17)

All twelve pages against the deployed pipeline at f02bfcc (salvage pass + prompt + contiguity
merge + case-only guard), parsed by key through the harness path — no presigns, so no photo
spend. The run's tab died before the results were read; every parse had already been cached
to S3 (P41), so the `*.parse.json` files here were recovered from the cache four days later.
Cluster provenance for each page is in CloudWatch (13:24–13:34 UTC, 2026-08-13).

Two suspect pages were re-read ×2 / ×1 on 2026-08-17 to separate variance from regression.

## Verdict: no regressions from the aug-10 fixes

Every gate that the fixes could have broken, held:

- **Junk stayed junk.** The biggest risk of the "don't use UNKNOWN for meaningful lines"
  prompt was typing `real-shift-and-junk`'s phone number and shopping list. Both came back
  UNKNOWN, the red box TODO, the date `Thurs 14/8` as written.
- **The dispute net is alive.** `real-haematology-meds` produced `Aciclovir|Acyclovir` (the
  founding case), `Filgrastim|Filgastim`, and the sanitiser's
  `Phenoxyethylpenicillin → Phenoxymethylpenicillin`. The Gate-2 page still does its job.
- **Contiguity merges behaved on all seven nomination pages**: diabetes shows the intended
  positive case (classifier's region 6 filled vision's interior hole:
  `vision=[[5,7,8..15]] classifier=[6..15] merged=[[5..15]]`), falls and heart-failure show
  the ≥2-cluster ignore keeping both two-drawing pages disjoint.
- **Salvage fired on 6 pages, zero hard drops.** P26 cross-column join held on mixed-resp;
  all 14 MED_LOG drugs across the four meds pages routed with the right candidates.

| Page | Blocks | UNKNOWN outside a drawing | Drawings | Verdict |
|---|---|---|---|---|
| `shift-and-junk` | 7 | 2 — the junk, as required | — | pass |
| `mixed-resp` | 6 | 0 | — | pass (column join ✓, TODO ✓) |
| `mindmap-sepsis` | 8 | 0 | **0 this run** | see variance |
| `medications` | 6 | 0 | — | pass |
| `haematology-meds` | 5 | 1 — the header ("any") | — | pass |
| `diabetes-meds` | 16 | 0 | 1, rebuilt | pass |
| `wound-dressing` | 5 | 0 | 1, rebuilt | pass |
| `reflection-sbar` | 7 | 4 incl. the prose | 1, no rebuild | see variance |
| `resp-inhalers` | 9 | 0 | 1 (the table), rebuilt | pass |
| `falls-handling` | 13 | 0 | 2 disjoint, rebuilt | pass — better than round 1 |
| `discharge-ttos` | 5 | 0 | 1, rebuilt (✓ items survive as blocks) | pass |
| `heart-failure` | 16 | 2 (both "any"/UNKNOWN-acceptable) | 2 disjoint, rebuilt | pass under its own table |

## Variance, tested by re-reading (2026-08-17)

- **`mindmap-sepsis` had NO drawing on the aug-13 run** — CloudWatch shows no provenance
  line, i.e. vision hinted nothing AND the classifier nominated nothing. Re-read twice: the
  mind map returned **both times, with a rebuild**. A one-in-three vision blip on the
  founding page, not a merge regression (the merge never saw a nomination to mishandle).
- **`reflection-sbar`'s aug-13 abstention** (prose UNKNOWN) also didn't reproduce: the
  re-read typed the prose REFLECTION with a TODO present. One-off.

## Standing gaps confirmed (none new to the aug-10 work)

1. **The SBAR mind map's Mermaid rebuild is absent THREE runs in a row** (round-1, aug-13,
   aug-17 re-read; the aug-10 baseline had it). No longer a wobble. Fail-closed, so the page
   costs a picture, never content — but diagnosing it needs the raw rejected mermaid, which
   is discarded. Same fix shape as cluster provenance: bounded logging of guardMermaid
   rejections (structure only). Not chased under the two-round rule; recorded.
2. **Lecture-page "ask about X" types CLINICAL_SKILL, not TODO** — sepsis's
   immunosuppression note, both re-reads. This is the recorded known gap from the spec,
   unchanged.
3. **Red "don't forget…" reminders wobble TODO↔OBSERVATION** (sbar's urine-output note:
   TODO in round-1, OBSERVATION since). The prompt's "caution or reminder → OBSERVATION or
   TODO" line feeds the ambiguity; if round 2 is ever spent, "a reminder to DO something is
   TODO" is the candidate line. Expectations keeps the must-hit; failing runs are recorded.
4. **Classifier under-coverage still appears on heart-failure** ("recovered 13 regions",
   13 UNKNOWNs — all acceptable kinds under that page's own table). The old known gap at its
   old severity; the new pages' prompt gains didn't transfer to this page on this run.
5. **Enoxaparin's side-effects list flattens to inline dashes** — identical in the aug-4
   baseline, so pre-existing reflow behaviour, not a regression. Items and dashes survive;
   line structure doesn't.

## H4/H5 evidence from this run (both still unlanded)

The aug-13 run **applied three expansion corrections**: `HSV → herpes simplex virus`,
`NBM → nil by mouth`, `co-trimox → co-trimoxazole`. All three are exactly what H5's
structural guard (reject `to` ⊃ `from`, reject more-words) exists to block, and they went
straight into block text against the P24 "never your wording" promise. H4's fail-safe is
also still absent: `checkMissing` reaches diagnostics, not the review UI, so a gemma failure
still silently drops the dispute net. Both remain the blockers they were.
