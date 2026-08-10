# Run: the six pages added 2026-08-10

First parse of `real-diabetes-meds`, `real-wound-dressing`, `real-reflection-sbar`,
`real-resp-inhalers`, `real-falls-handling`, `real-discharge-ttos`. Imported one page per
capture through the real capture UI on localhost against the **deployed** dev pipeline (so
this also exercises the H7–H12 client path), rather than via `scripts/parse-capture.ts` —
the UI is the only place the Mermaid rebuilds actually render, which was half the point.

Diagnostics quoted below are from the parse Lambda's own CloudWatch log group, not from the
harness, so `coverage recovered` / `classifier dropped` are the server's numbers.

## Per page

| Page | Blocks | Typed | UNKNOWN | Drawings | Disputes | Sanitiser |
|---|---|---|---|---|---|---|
| `real-diabetes-meds` | 16 | 6 | 10 | 1 flowchart, drawn (7 nodes) | 2 | — |
| `real-wound-dressing` | 26 | 3 | 23 | 2, both drawn | 0 | `woand → wound` |
| `real-reflection-sbar` | 11 | 5 | 6 | 1 mind map, drawn (5 nodes) | 0 | — |
| `real-resp-inhalers` | 13 | 8 | 5 | 1 nominated, **no source** (fail-closed) | 2 | `OD → od` |
| `real-falls-handling` | 23 | 2 | 21 | 2, both drawn | 0 | — |
| `real-discharge-ttos` | 21 | 4 | 17 | 2, both drawn | 0 | — |
| **total** | **110** | **28** | **82** | **9 nominated, 8 drawn** | **4** | **2** |

**What went right, page by page**

- **diabetes-meds** — all four drugs → MED_LOG; the dated header read as `Fri 22/8` and typed
  DATE_HEADER → SHIFT_NOTES; the hypo flowchart rebuilt exactly, YES/NO edge labels intact.
  Both disputes are the right words (`G-I|GI`, `sulfonylurea.|Sulphonylurea.`).
- **wound-dressing** — the nine-step dressing flowchart rebuilt in order. The sanitiser fixed
  the page's own `woand → wound`: a same-word-count swap, which is exactly what H5 permits.
- **reflection-sbar** — the best-classified page: prose → REFLECTION, both
  What-went-well / To-improve lists → CLINICAL_SKILL/PROFICIENCY_EVENT, the red margin note
  → TODO/SHIFT_NOTES, SBAR mind map rebuilt with hub + four spokes.
- **resp-inhalers** — two-column reading order held (P36): all four numbered drugs came out
  in order and routed to MED_LOG; the O₂-target caution → CLINICAL_SKILL.
- **falls-handling** — both drawings rebuilt: the six-spoke falls-prevention mind map and the
  dizziness flowchart with YES/NO and the escalate → document tail.
- **discharge-ttos** — the five-step discharge flowchart AND the ✓ checklist both rebuilt.

## Four findings

1. **The classifier is contributing very little on list-heavy pages — 82 of 110 blocks came
   back UNKNOWN (75%).** This is the recorded known gap, but at a severity worth naming: the
   server's own numbers are `coverage: recovered 10 / 23 / 6 / 5 / — / 17` regions per page,
   and `real-falls-handling` logged **no coverage line at all** with 21 UNKNOWNs, which is the
   degraded path (P27) — the classifier produced nothing usable for that page. Where the page
   is prose + a couple of lists (`reflection-sbar`, `resp-inhalers`) it does well; where the
   page is twenty short bullets and boxes it effectively abstains. A student photographing
   `real-wound-dressing` today gets 23 "Not sure yet" notes to retype by hand, and the seven
   ANTT skill bullets — the whole point of that page — are among them.
2. **A bordered list reads as a drawing.** `real-wound-dressing`'s red infection-signs box was
   nominated as a `sketch`, and `real-discharge-ttos`'s ✓ checklist as a `flowchart`. Both got
   Mermaid and both render, so nothing breaks — but the README's open question ("does a ✓ list
   read as a drawing?") is answered: yes. Cheap to live with, worth knowing before someone
   counts drawings as a metric.
3. **On `real-falls-handling` the two clusters overlap** — regions `0–18` and `1–7`, so one
   "drawing" is a superset of the other plus the page title and the closing bullets. The UI
   copes (two tabs, both correct) but the big block's transcription is 409 chars of the whole
   page, so *file whole* on it would append far more than the drawing. P45's cluster split
   worked cleanly on `real-heart-failure`; this page is the counter-example to look at first
   if cluster membership is ever revisited.
4. **The sanitiser lower-cased a dose abbreviation**: `OD → od` on `real-resp-inhalers`. Same
   word count, so the H5 guard allows it — correctly, since the guard is about expansion, not
   case. `OD` is the conventional form, so this is a small wrong-direction edit rather than a
   correction; one revert tap in review, and worth a prompt note if it recurs.

Nothing failed to import: six captures, six reviews, all blocks persisted, `PARSING` left
behind on none of them.
