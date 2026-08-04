# Real-page corpus — expected block types

Five REAL handwritten pages (phone photos / scans of hand-copied versions of the generated
corpus in `scripts/make-note-pages.ts`, plus the original Gate-2 page). Real handwriting is
the only thing that exercises the two-model consensus (P21/P22) — see
`scripts/README-note-pages.md` for why the rendered `.jpg` corpus cannot.

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
