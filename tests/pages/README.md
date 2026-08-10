# Real-page corpus

Twelve **real handwritten pages** for the note-capture pipeline — the committed counterpart to
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
| `real-heart-failure.png` | — | The first TWO-drawing page (P45): a mind map AND a branching flowchart — per-drawing DIAGRAM blocks, YES/NO edge labels, and the page that exposed the degenerate-read retry |

Six more added 2026-08-10. Between them they carry **eight drawings**, which makes them the
first real test of per-drawing synthesis (P45) at corpus scale rather than on one page:

| File | Aims at |
|---|---|
| `real-diabetes-meds.png` | MED_LOG ×4 (Metformin / Gliclazide / insulin glargine / rapid-acting) + a hypo **flowchart** with YES/NO branches + **a dated header** (`Fri 22/8`) for shift resolution (P8), and three red margin call-outs that are notes in their own right |
| `real-wound-dressing.png` | CLINICAL_SKILL bullets + a nine-step linear **flowchart** + a red boxed infection-signs list + a closing reflection line. Also the sanitiser's honest case: the page says **"woand dressing"**, a same-word-count fix the H5 guard permits |
| `real-reflection-sbar.png` | A long prose REFLECTION (Gibbs split) + an SBAR **mind map** whose hub is red and whose four spokes are separate notes + What-went-well / To-improve lists |
| `real-resp-inhalers.png` | **Two-column** numbered layout (reading order, P36) with four drug notes + an inhaler-technique **table** (three cells — not a flowchart; what vision nominates here is worth knowing) + a red boxed O₂-target caution |
| `real-falls-handling.png` | The second TWO-drawing page: a falls-prevention **mind map** (six spokes) AND a dizziness **flowchart** with YES/NO — plus two closing TODO-ish bullets |
| `real-discharge-ttos.png` | A five-step **flowchart** + a **tick-box checklist** in a box (does a ✓ list read as a drawing?) + bullets + a closing REFLECTION + a red one-line caution |

Every `.png` page is 1086×1448 — **below** the 2400px long-edge the client targets, so
transcription here is a harder test than a phone photo, not an easier one.

## Running the corpus

Not wired into vitest on purpose: each page costs four model calls and the output is
nondeterministic. It is run by hand, judged against `expectations.md`, and the outputs
committed under `runs/` so future runs have something honest to diff against.

```bash
# per page: upload to the caller's own prefix, then parse via the deployed Function URL
AWS_PROFILE=personal PARSE_REFRESH_TOKEN=… npx tsx scripts/parse-capture.ts <email> --file tests/pages/real-medications.png
```

`expectations.md` defines what a pass is (acceptable kinds per content region + hard
must-hits). `runs/<label>/<page>.log` is the harness output for one run of one page.

## Getting a token (hardening H6)

The parse endpoint needs a real Cognito ID token. Two ways, in the order to reach for them:

1. **`PARSE_REFRESH_TOKEN`** — the unattended path. Sign in once in the browser, then read
   `CognitoIdentityServiceProvider.<clientId>.<sub>.refreshToken` out of `localStorage` and
   export it. Good for the client's **30 days**, so it is a once-a-month chore rather than a
   per-run one. Treat it as a credential: it signs in as that student.
2. **`PARSE_ID_TOKEN`** — a token pasted from a browser session, for a single run. Expires in
   an hour.

**The script's own magic-link mint cannot work from a CLI, and this is deliberate.** H6
proposed giving the CLI user `kms:Sign` on the passwordless key via an IAM policy. That is not
possible: the `amazon-cognito-passwordless-auth` construct writes a key policy allowing the
account `NotAction: "kms:Sign"` — every action *except* signing — and grants `kms:Sign` to the
CreateAuthChallenge Lambda's role alone, conditioned on the key alias. A resource policy that
withholds an action cannot be overridden by an IAM policy, so even `AdministratorAccess` gets:

```
AccessDeniedException … not authorized to perform: kms:Sign … because no resource-based
policy allows the kms:Sign action
```

The signing key is what mints a magic link for *any* user, so exactly one role holding it is
the property worth keeping — which is why the harness gets a refresh token instead of the key.
Granting a human `kms:Sign` would mean editing the construct's key policy out-of-band (drifting
from CDK, and reverted by the next deploy) in exchange for weakening that boundary; if that
trade is ever wanted, it is a decision to take deliberately, not a convenience to add quietly.
