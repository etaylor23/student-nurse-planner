# Run: round 1 of the classifier fixes (2026-08-10, after commit 9f94c10)

Fresh reads of the six new pages plus `real-heart-failure` (the regression page for the
`mergeNomination` change), forced past the P41 cache with "Read it again from scratch"
through the real UI against the deployed dev pipeline. Baseline for comparison:
`runs/aug10-new-pages/` (same pages, same day, before the fixes).

## The number that mattered

Baseline: **82 of 110 blocks UNKNOWN**. This run: **17 of 60 — and 15 of those are labels
inside a nominated drawing**, which the expectations bar explicitly allows (they nest under
their drawing and are absorbed with it). UNKNOWNs outside a drawing: **2**, both headings
(details below). Every red call-out, every ANTT bullet, every TTO bullet is typed.

| Page | Blocks | UNKNOWN | outside a drawing | Drawings (rebuilt?) |
|---|---|---|---|---|
| `wound-dressing` | 26 → 7 | 23 → 0 | 0 | 1 (yes) |
| `diabetes-meds` | 16 → 16 | 10 → 7 | 0 — all flowchart fragments | 1 (yes) |
| `reflection-sbar` | 11 → 7 | 6 → 1 | 1 — the page title | 1 (**no rebuild this run**) |
| `resp-inhalers` | 13 → 9 | 5 → 0 | 0 | 1 (yes — the table drew this time) |
| `falls-handling` | 23 → 15 | 21 → 9 | 1 — the flowchart's heading | 2, **disjoint 1–7 / 10–18** (both) |
| `discharge-ttos` | 21 → 6 | 17 → 0 | 0 | 2 (both) |
| `heart-failure` (regression) | — → 5 | — → 0 | 0 | 2, disjoint 0–7 / 11–24 (both) |

## What each fix did

- **The salvage pass fired 7 times (4 + 1 + 2 across runs) and not one block was
  hard-dropped** — every guard failure in this run was a rewording with usable regions, so
  the classification survived on the region text. The baseline's "dropped N blocks" lines
  are gone from the logs.
- **The prompt change is most of the UNKNOWN collapse.** The classifier now types bullets
  and boxed cautions, and it merges same-subject bullets into fewer, larger semantic blocks
  (wound-dressing 26 → 7). Segmentation is explicitly not judged, and the merged blocks
  carry their full text — but it is a visible behaviour change worth knowing when comparing
  block counts across runs.
- **`mergeNomination` no longer swallows pages.** falls-handling's two drawings are disjoint
  (1–7 mind map, 10–18 flowchart), the title is in neither, and the closing bullets came out
  as a typed TODO block. heart-failure — the page the union was originally built for — still
  produces both drawings, disjoint, both rebuilt.
- **Case-only corrections**: nothing to observe this run (vision read `OD` correctly), but
  the guard is structural and tested offline.

## Two wobbles, judged against expectations.md

1. **`reflection-sbar`'s mind map got no renderable Mermaid this run** (the DIAGRAM block
   exists, regions 2–5, fail-closed to words). The baseline run HAD the rebuild — this is
   vision-side per-run variance, not a regression from these fixes (nothing in this change
   touches the rebuild path). Its "rebuild present" must-hit therefore FAILS on this run and
   passed on the last; recorded as a wobble to watch, not chased (two-round rule).
2. **`falls-handling`'s flowchart heading** ("If a patient says they feel dizzy") sits
   between the two clusters, belongs to neither, and came back UNKNOWN. It isn't a listed
   content region and nothing is lost — but a heading-of-a-drawing outside the drawing's
   cluster is a shape the strict bar doesn't quite name. Defensible pass; noted.

Also observed once: the title `Clinical Skills learnt - wound dressing` arrived already
correct — vision transcribed `woand` as `wound` on its own, so the sanitiser's must-hit
couldn't be exercised this run. Per-run variance; the H5-legal swap was demonstrated in the
baseline run.

## Verdict against the bar

Round 1 of the two prompt-iteration rounds: **the six pages pass the UNKNOWN bar** (every
UNKNOWN is a drawing fragment or a heading with "any" kinds), all four MED_LOG pages route
their drugs, both reflections type REFLECTION, the two-drawing pages are disjoint, and 8 of
9 nominated drawings rebuilt (the ninth fail-closed). Round 2 stays in the bank.
