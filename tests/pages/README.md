# Real-page corpus

Five **real handwritten pages** for the note-capture pipeline — the committed counterpart to
the generated corpus (`scripts/make-note-pages.ts`, output gitignored under `evidence/`).
These are hand-copied-and-photographed versions of the generated pages, which makes them the
only corpus that exercises the two-model consensus: real handwriting is ambiguous, a font is
not (`scripts/README-note-pages.md`).

| File | Copies | Aims at |
|---|---|---|
| `real-shift-and-junk.png` | page-4 | SHIFT_NOTES + TODO + P42 junk (phone number, shopping list) |
| `real-mixed-resp.png` | page-6 | P26 semantic boundaries: drug-note-into-reflection, cross-column join |
| `real-mindmap-sepsis.png` | page-5 | The chaos page: mind-map (**DIAGRAM** block), sideways + upside-down text |
| `real-medications.png` | page-1 | MED_LOG routing, drug-card candidates, list-survives-reflow |
| `real-haematology-meds.jpg` | — | The original Gate-2 page (Appendix 2's numbers) — Aciclovir / Phenoxymethylpenicillin |

The four `.png` pages are 1086×1448 — **below** the 2400px long-edge the client targets, so
transcription here is a harder test than a phone photo, not an easier one.

## Running the corpus

Not wired into vitest on purpose: each page costs four model calls and the output is
nondeterministic. It is run by hand, judged against `expectations.md`, and the outputs
committed under `runs/` so future runs have something honest to diff against.

```bash
# per page: upload to the caller's own prefix, then parse via the deployed Function URL
AWS_PROFILE=personal npx tsx scripts/parse-capture.ts <email> --file tests/pages/real-medications.png
```

`expectations.md` defines what a pass is (acceptable kinds per content region + hard
must-hits). `runs/<label>/<page>.log` is the harness output for one run of one page.
