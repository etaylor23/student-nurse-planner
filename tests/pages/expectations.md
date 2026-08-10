# Real-page corpus — expected block types

REAL handwritten pages (phone photos / scans of hand-copied versions of the generated
corpus in `scripts/make-note-pages.ts`, plus the original Gate-2 page; six more added
2026-08-10). Real handwriting is the only thing that exercises the two-model consensus
(P21/P22) — see `scripts/README-note-pages.md` for why the rendered `.jpg` corpus cannot.

## How to judge a run

Block **segmentation is known-unstable** (the same page has parsed as 5 blocks and as 28), so
a run is never judged block-by-block. It is judged per **content region**:

- every content region below must land in one of its **acceptable kinds**;
- every **must-hit** must hold exactly;
- nothing on the page may be missing from the union of blocks (the coverage guard should
  make misses impossible — a miss is a bug, not a model mood);
- no invented content (text not present on the page).

A defensible-but-different kind *inside the acceptable set* is a pass. A must-hit miss is a
fail. Fails get at most **two rounds of prompt iteration**, then are recorded here as known
gaps rather than chased.

**The UNKNOWN bar (set with Ellis 2026-08-10):** UNKNOWN is acceptable ONLY for P42 junk
(phone numbers, shopping lists) and for **fragments inside a nominated drawing's region set**
("YES", "Below 4?", a flowchart step — they nest under their drawing and are absorbed with
it). Any other UNKNOWN is a fail. This deliberately fails the 2026-08-10 baseline run
(82/110 UNKNOWN, `runs/aug10-new-pages/`) — it is the bar the classifier work is aimed at,
not a description of today.

**Boxed lists (decided 2026-08-10): a box drawn around plain text MAY be nominated as a
drawing.** The red infection-signs box and the ✓ discharge checklist both came through as
DIAGRAMs and render fine; suppressing them risks real checklist rebuilds. So a boxed list
arriving as a DIAGRAM is a pass, and so is the same list arriving as plain blocks — neither
direction is a fail.

Run the corpus with `scripts/parse-capture.ts` (see `tests/pages/README.md`). Outputs are
recorded in `tests/pages/runs/`.

---

## real-shift-and-junk.png (hand copy of `page-4-shift-and-junk`)

Ward-day page: handover, a boxed reminder, junk that must NOT be filed as clinical anything.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Thurs 14/8 — long day — Ward 12` | DATE_HEADER | `pageDateRaw` = `Thurs 14/8` (or the fuller line) **as written** — no invented year (P8). `wardHint` = `Ward 12`. |
| Handover: Bay 3 / Bay 4 / Waterlow 18 | OBSERVATION | Target SHIFT_NOTES. `NBM`, `TTOs`, `Waterlow 18` survive transcription. |
| Physio for bed 2 at 2pm, falls risk, bed rails | OBSERVATION, CLINICAL_SKILL | — |
| `ASK PA TO SIGN MY MED CALC BEFORE FRIDAY!!` (red box) | **TODO** | Must be TODO. |
| `Mum's mobile 07700 900123` | **UNKNOWN** | Must be UNKNOWN (dismissable junk, P42) — never MED_LOG/OBSERVATION. |
| Shopping list: milk / bread / teabags | **UNKNOWN** | Must be UNKNOWN — never clinical. |
| `Bed 4 discharged 16:10 … ate a sandwich.` (tilted, bottom) | OBSERVATION | Present at all (tilted text is the point). |

## real-mixed-resp.png (hand copy of `page-6-mixed-boundaries` intent)

The P26 page: one paragraph holding a drug note that turns into a reflection mid-stream, and
a note running across a column break.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Wed 20/8 — resp ward` | DATE_HEADER | `pageDateRaw` = `Wed 20/8` as written. |
| Salbutamol neb paragraph → Mrs in bed 5 upset → "I should have warned her BEFORE" | MEDICATION + REFLECTION (ideal split), or REFLECTION alone, or MEDICATION alone | If any MEDICATION block: `medicationCandidate` ≈ Salbutamol. If any REFLECTION block: gibbs has ≥2 stages. |
| Peak flow technique (spans the column break: "…coached bed 5 / through it and her numbers…") | CLINICAL_SKILL, OBSERVATION | The two column halves end up in ONE block (P26 cross-region join). |
| Prednisolone 30mg OD paragraph | **MEDICATION** | `medicationCandidate` ≈ Prednisolone. |
| Oxygen 88–92% COPD target | OBSERVATION, CLINICAL_SKILL, MEDICATION | `88–92%` survives. |
| `ask about a spirometry study day` | **TODO** | Must be TODO. |

## real-mindmap-sepsis.png (hand copy of `page-5-chaos-mindmap`)

The chaos page: a mind-map with six spokes, sideways notes up both margins, an upside-down
line. A **lecture** page — no shift, no ward.

### Baseline (pre-DIAGRAM)

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Sepsis lecture — wk 4` | DATE_HEADER, OBSERVATION, UNKNOWN | — |
| Mind-map: `SEPSIS SIX within 1 hour` + 6 numbered spokes | CLINICAL_SKILL, OBSERVATION | All six spokes present somewhere in the blocks (O2 sats 94–98% · cultures before abx · IV antibiotics · IV fluids 500ml · lactate+FBC · urine output). |
| `NEWS2 5 or more → think sepsis` (sideways, left margin) | CLINICAL_SKILL, OBSERVATION | Present at all. |
| `red flag: lactate over 2` (sideways, right margin, red box) | CLINICAL_SKILL, OBSERVATION | Present at all. |
| `ask about immunosuppression — chemo? steroids? splenectomy?` | **TODO** | Must be TODO. |
| `BUFFALO — the old mnemonic` (upside-down) | any | Presence alone is a win. |

### Post-DIAGRAM (after the schema work)

All of the above, **plus**:

- exactly one **DIAGRAM** block spanning the mind-map, `text` = full transcription of the
  central node and all six spokes, tagged so "mindmap" (or similar) appears in its tags;
- the map's textual content ALSO present as normal (non-DIAGRAM) blocks so it can be filed —
  the duplication is deliberate;
- the DIAGRAM block has no `targetType` (keep/dismiss only);
- `wardHint` null — nothing on the page names a ward.

## real-medications.png (hand copy of `page-1-medications`)

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Meds — Bay 4 drug round` | DATE_HEADER, UNKNOWN, OBSERVATION, MEDICATION | — |
| Furosemide 40mg OD paragraph | **MEDICATION** | candidate ≈ Furosemide. |
| Co-amoxiclav 625mg TDS paragraph | **MEDICATION** | candidate ≈ Co-amoxiclav; the spelling `Co-amoxiclav` survives. |
| Bisoprolol 2.5mg OD paragraph | **MEDICATION** | candidate ≈ Bisoprolol. |
| Enoxaparin 40mg SC nocte + side-effects list | **MEDICATION** | candidate ≈ Enoxaparin; the bulleted side-effects list is NOT flattened into one sentence by reflow. |
| `ALL of these need a second checker on the round` (red box) | TODO, OBSERVATION | — |

## real-heart-failure.png (added 2026-08-04 — the first TWO-drawing page, P45)

A mind map (HEART FAILURE nursing checks, 6 spokes) on the top half and a branching
flowchart (Hypoglycaemia management, YES/NO decision) on the bottom, plus red margin boxes
and a sideways note. **This page found the degenerate-read failure mode:** 3 of its first
6 runs collapsed to ~2 regions / ~700 output tokens at the vision layer — hence the
check-model-volume retry in `vision.ts`.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| Mind map (hub + 6 spokes) | — | **One DIAGRAM block** tagged mind map, mermaid rebuild with the hub as root and all six spokes as children. Content also present as normal blocks. |
| Flowchart (10 boxes + YES/NO) | — | **A second DIAGRAM block** tagged flowchart, mermaid `flowchart` rebuild with the full decision tree and **YES/NO as edge labels**. |
| `red flag: acute pulmonary oedema` / `think fluid overload` / `never leave them alone` (red margin) | OBSERVATION, CLINICAL_SKILL, UNKNOWN | Not swallowed into either mermaid (cluster membership may still catch them in the block TEXT — recorded wart). |
| `Hypoglycaemia management` (heading) | any | — |
| Bullets (`listen for crackles`, `ask about orthopnoea`) | OBSERVATION, CLINICAL_SKILL | Present. |

## real-haematology-meds.jpg (the original Gate-2 page, IMG_8619)

The page every Appendix-2 number was measured on. Baseline behaviour is already recorded in
`evidence/note-capture/run-*.log` (gitignored); this pins it into the corpus.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Medication notes` header | any | — |
| Aciclovir paragraph | **MEDICATION** | Spelling stays `Aciclovir` — an Americanised `Acyclovir` in a block's final text is a fail (the check model exists precisely to flag this). |
| Co-trimoxazole paragraph (methotrexate contraindication) | **MEDICATION** | `methotrexate` survives. |
| Phenoxymethylpenicillin (Penicillin V) paragraph | **MEDICATION** | `Phenoxymethylpenicillin` intact or **disputed** — corrupted-and-undisputed is the historic failure mode and a fail. |
| Filgrastim (GCSF) paragraph | **MEDICATION** | `Filgrastim` intact or disputed. |

## real-diabetes-meds.png (added 2026-08-10)

Four drug paragraphs, a dated title, a hypo flowchart with YES/NO, and three red call-outs.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Fri 22/8 - diabetes meds` | DATE_HEADER | `pageDateRaw` = `Fri 22/8` as written — no invented year (P8). |
| Metformin 500mg BD paragraph | **MEDICATION** | candidate ≈ Metformin; `BD` keeps its case. |
| Gliclazide sulfonylurea paragraph | **MEDICATION** | candidate ≈ Gliclazide. |
| Insulin glargine OD paragraph | **MEDICATION** | `not for quick correction` survives. |
| Rapid acting insulin with meals | **MEDICATION** | — |
| `always check BM + prescription chart` (red box) | CLINICAL_SKILL, OBSERVATION, TODO | Typed — a red call-out is a note, not a fragment. |
| `never give insulin blind` (red, margin) | CLINICAL_SKILL, OBSERVATION | Typed. |
| `check if they are NBM` (red, margin) | CLINICAL_SKILL, OBSERVATION, TODO | Typed. |
| Hypo quick check flowchart (7 boxes + YES/NO) | — | **One DIAGRAM block** tagged flowchart, mermaid rebuild with **YES/NO as edge labels**. Step fragments (`Check BM`, `Below 4?`, `YES`…) may be UNKNOWN — they nest under the drawing. |

## real-wound-dressing.png (added 2026-08-10)

Seven ANTT skill bullets, a nine-step linear flowchart, a red boxed infection-signs list and
a one-line reflection. The list-heavy page the classifier abstained on in the baseline run.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Clinical skills learnt - woand dressing` (title) | DATE_HEADER, CLINICAL_SKILL, UNKNOWN | The sanitiser corrects `woand → wound` — a same-word-count swap, exactly what H5 permits. |
| The 7 ANTT bullets (aseptic technique … document wound appearance) | **CLINICAL_SKILL** (OBSERVATION acceptable) | All seven typed — these are the page's point, and every one was UNKNOWN in the baseline. |
| Simple dressing change flowchart (9 steps) | — | **One DIAGRAM block** tagged flowchart, all nine steps in order in the rebuild. Step fragments may be UNKNOWN. |
| `watch for signs of infection` red box (redness/heat/swelling/odour) | CLINICAL_SKILL, OBSERVATION — or a DIAGRAM (boxed list, accepted) | The four signs survive somewhere. |
| `Need to get quicker without breaking sterility.` | **REFLECTION** | — |

## real-reflection-sbar.png (added 2026-08-10)

A long prose reflection, an SBAR mind map with four spokes, and went-well / to-improve lists.
The page the classifier handled best in the baseline — this pins that it stays good.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Reflection - deteriorating patient` (title) | any | — |
| The prose paragraph (breathless patient, NEWS2, SBAR escalation) | **REFLECTION** | gibbs has ≥2 stages. |
| SBAR mind map (red hub + S/B/A/R spokes) | — | **One DIAGRAM block** tagged mind map, hub + all four spokes in the rebuild. Spokes may be UNKNOWN as fragments. |
| `don't forget urine output + temp` (red, margin) | **TODO** | Must be TODO. |
| `What went well` bullets | CLINICAL_SKILL, REFLECTION | Typed. |
| `To improve` bullets | CLINICAL_SKILL, REFLECTION, TODO | Typed. |
| — | — | `pageDateRaw` null, `wardHint` null — nothing on the page states either. |

## real-resp-inhalers.png (added 2026-08-10)

Two-column numbered drug notes (the reading-order page, P36), an inhaler-technique table,
and a red boxed O₂ caution.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Resp ward meds + inhalers` (title) | DATE_HEADER, any | — |
| ① Salbutamol / ② Ipratropium / ③ Prednisolone / ④ Amoxicillin-co-amoxiclav | **MEDICATION** ×4 | Each drug its own block, all four present (two-column reading order); `penicillin allergy EVERY time` survives; `OD` is not case-mangled by the sanitiser. |
| Inhaler technique table (3 cells) | DIAGRAM (boxed table, accepted) or CLINICAL_SKILL/OBSERVATION | If DIAGRAM with no renderable mermaid, words-only fail-closed is a pass (this is the baseline behaviour). |
| `Spacer helps if technique poor.` | CLINICAL_SKILL, OBSERVATION | Typed. |
| `O2 target for COPD may be 88-92% - check chart.` (red box) | CLINICAL_SKILL, OBSERVATION | `88-92%` survives. |
| `Explained side effects better today than last week.` | **REFLECTION** | — |

## real-falls-handling.png (added 2026-08-10 — the second TWO-drawing page)

A falls-prevention mind map (six spokes) and a dizziness flowchart with YES/NO. **This page
found the overlapping-cluster defect:** in the baseline run one cluster claimed regions 0–18
(the whole page, title and closing bullets included) while the other claimed 1–7, a subset.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Falls risk + moving & handling` (title) | any | In NEITHER drawing's transcription (the cluster-overlap gate). |
| Falls prevention mind map (hub + 6 spokes) | — | **One DIAGRAM block** tagged mind map, hub + all six spokes (call bell · clear clutter · non-slip footwear · glasses/hearing aids · toileting plan · low bed + brakes). |
| Dizziness flowchart (YES/NO, escalate → document) | — | **A second DIAGRAM block** tagged flowchart, YES/NO as edge labels. **The two DIAGRAMs' region sets are disjoint.** |
| `post-fall obs + neuro obs if indicated` (red, margin) | CLINICAL_SKILL, OBSERVATION | Typed. |
| `Need more practice using the hoist controls…` / `remember to use the right sling size` | TODO, REFLECTION, CLINICAL_SKILL | Typed, and in neither drawing's transcription. |

## real-discharge-ttos.png (added 2026-08-10)

Six TTO bullets, a five-step discharge flowchart, a ✓ checklist in a box, a closing
reflection and a red one-line caution.

| Content region | Acceptable kinds | Must-hits |
|---|---|---|
| `Discharge planning / TTOs` (title) | any | — |
| The 6 TTO bullets (`TTO = to take out meds` … `confirm pt understands red flags`) | CLINICAL_SKILL, OBSERVATION, TODO | All six typed — every one was UNKNOWN in the baseline. |
| Safe discharge check flowchart (5 steps) | — | **One DIAGRAM block** tagged flowchart, all five steps in order. |
| `before they leave` ✓ checklist (boxed) | DIAGRAM (boxed list, accepted) or plain blocks | The four ✓ items survive somewhere. |
| Reflection paragraph (`Saw how delayed TTOs…`) | **REFLECTION** | — |
| `never send without meds advice` (red box) | **TODO** (CLINICAL_SKILL acceptable) | Typed. |
