# Note-capture test pages

Regenerate with:

```bash
npx tsx scripts/make-note-pages.ts
```

Output lands in `evidence/note-capture/pages/` (gitignored by the `evidence/` rule, like the rest
of the note-capture test material). `--only <id>` builds one page; `--out DIR` puts them elsewhere.

## Two outputs, testing different halves of the pipeline

| File | What it's for |
|---|---|
| `<id>.jpg` | Imports straight away. Exercises everything **downstream of transcription** — region geometry, the classifier, the review overlay, the four destinations. Seconds per iteration. |
| `<id>.txt` | Copy it out **by hand** and photograph it. The only thing that exercises the two-model consensus. |

**The .jpg files cannot test P22.** The whole disagreement design rests on the two vision models
reading ambiguous handwriting differently — and they disagree *because handwriting is ambiguous*.
A font is not. A clean run on a rendered page is not evidence that the dispute path works; it is
evidence that everything after transcription works. Both are worth knowing, but don't confuse
them.

Renders are deterministic: jitter is seeded from the page id, so a page comes out identical every
time. A corpus you can't regenerate is one you can't trust a regression against.

## The pages, and what each one aims at

| Page | Aims at |
|---|---|
| `page-1-medications` | `MED_LOG` routing · P33 drug-card offers · P22-prone names (Furosemide/Frusemide, Co-amoxiclav, Enoxaparin) · a bulleted side-effects list the reflow must **not** flatten |
| `page-2-reflection` | `REFLECTION` routing · Gibbs stage splitting · P8 date-as-written (`Tues 12/8`) · whether naming morphine and midazolam wrongly drags a reflection into `MED_LOG` |
| `page-3-proficiency` | `PROFICIENCY_EVENT` routing · the code shortlist · P30 refusing to file without a code · UK skills vocabulary (ANTT, VIP, NEWS2, sepsis six, CSU) |
| `page-4-shift-and-junk` | `SHIFT_NOTES` + `DATE_HEADER` + `TODO` · **P42 dismissal** — a phone number and a shopping list that should be dismissable, not filed · handover lines surviving reflow |
| `page-5-chaos-mindmap` | **The page the spec says has never been tested.** A mind-map with six tilted spokes, sideways notes up both margins, an upside-down corner, freehand arrows. Aimed squarely at P26 ("regions are guidance, not boundaries") and P36. If anything in the layout design is wrong, this is where it shows. |
| `page-6-mixed-boundaries` | P26 semantic re-splitting: one paragraph holding **two** notes (a drug note that turns into a reflection mid-sentence), and one note running **across a column break**. The vision regions and the real blocks are designed to disagree. |

## Reading a run

Because the classifier degrades silently to unclassified regions, check *why* before concluding
anything about routing:

```bash
aws logs tail /aws/lambda/nurse-planner-ai-parse-dev --profile personal --since 15m --format short \
  | grep -iE 'classifier|sanitiser|coverage'
```

- `classifier: response was not JSON (…)` — the model didn't produce JSON. `finish=length` means
  raise `MAX_TOKENS`; `chars=0` means the answer arrived somewhere the code isn't reading.
- `classifier: JSON did not match the contract […]` — valid JSON, wrong shape. The issue paths
  name the field.
- `coverage: recovered N region(s)` — the classifier dropped part of the page and the guard put it
  back as `UNKNOWN`. Expected occasionally; a page where it recovers *everything* means
  classification failed outright.
- `sanitiser: discarded N correction(s)` — the `from`-must-appear guard rejected a proposed edit.

The stored parse for any page is readable directly, which is faster than inferring from the UI:

```bash
aws s3 ls s3://nurse-planner-captures-dev-641364901830/ --recursive --profile personal | grep parse.json
```

## Adding a page

Add an entry to `PAGES` in `scripts/make-note-pages.ts`. Positions are fractions of the page, so
they're resolution-independent. Set `targets` to the pipeline decisions the page is *for* — it goes
into the `.txt` header, and a test page whose purpose isn't written down stops being a test after a
fortnight. `note` on a block becomes a hand-writing instruction, which is what makes the layout
reproducible in ink.

## What is not in here

No patient-identifiable content, no real phone numbers (`07700 900xxx` is Ofcom's reserved drama
range), and no real clinical record. These are study notes of the kind a student writes for
themselves, which is what the importer is for.
