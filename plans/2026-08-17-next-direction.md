# Next direction — opportunity map and three candidates

**Written:** 2026-08-17 · **Status:** for Ellis to react to. **Not a plan, not a spec, and
deliberately not one recommendation.**

Grounded in [`docs/research/student-nurse-domain-primer.md`](../docs/research/student-nurse-domain-primer.md)
and [`docs/research/student-nurse-pain-points.md`](../docs/research/student-nurse-pain-points.md).
Scored against the ethos in [`plans/2026-07-22-connected-spine.md`](2026-07-22-connected-spine.md).

---

## The three things this research changed in my head

**1. The official record is approver-gated and time-boxed, and students can't fix it later.**
The Pan London ePAD requires hours to be approved by a named staff member with their work
email, at the time, and says outright: "You cannot add hours outside of the placement
period." Students cannot amend their own entries at all. This is the single most
product-relevant fact I found, and none of our specs know it.

**2. The pain at sign-off is human, not clerical.** Students describe "having to push all
the time", assessors who set different bars for the same proficiency, and assessors who
don't know how to use the PAD. Nobody complains that typing is slow. A feature that makes
the PAD faster to fill in solves the wrong problem; a feature that makes the student arrive
at the meeting already holding the evidence solves the right one.

**3. The 2,300-hour target is under live consultation.** The NMC proposes 1,800 practice
hours (3,600 total), consultation closed 23 July 2026, transition of at least two years.
`spec-placement-hours-log.md` locks 2,300 as a constant.

---

## Read this before scoring anything: the elephant

**Beta engagement is zero and unattributable.** No beta student has a single row in
DynamoDB, and the auth Lambdas don't log who signs in, so we can't tell whether the seven
successful magic-link verifications were students or Ellis.

We are about to choose the next direction on the basis of no usage data whatsoever. Two
things follow, and they are not optional:

- **The induction calls are the input, not this document.** Do not pick a direction before
  three or four calls have happened. This document exists so those calls have something to
  argue with.
- **The observability fix is a prerequisite, not a candidate.** Logging email/sub in
  VerifyAuthChallenge plus a per-request user line in the router is small, and without it we
  cannot tell whether *anything* we ship next works. It is specced in memory and unbuilt.
  Build it before or alongside whatever wins.

One more no-brainer regardless of direction: **make the hours target a per-student value,
not the constant 2,300.** It is already wrong for recognised prior learning, and the NMC may
make it wrong for everyone. Cheap now, expensive to retrofit across two live cohort models.

---

## The opportunity map

Scored against the ethos. **✓✓** strongly serves · **✓** serves · **–** neutral · **✗**
fights it.

| # | Candidate | AI? | Capture-once → registration | Shift as spine | Payoff on capture | Encouraging, not nagging | "Your notes, not guidance" | Assessors not users | Bends |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Sign-off readiness pack** — assemble everything already captured into one brief per proficiency, to take to the assessor | no | ✓✓ | ✓ | ✓✓ | ✓ | ✓ | ✓ | nothing (extends B1) |
| 2 | **Hours-approval companion** — track approval state per shift, hold the approver, count down the grace period, export a reconciliation timesheet | no | ✓✓ | ✓✓ | ✓ | ⚠ | ✓ | ✓ | D7 pressure |
| 3 | **Evidence mapper** — captured notes suggest which proficiencies they could evidence; student confirms | yes | ✓✓ | ✓ | ✓✓ | ✓ | ⚠ | ✓ | D10 pressure |
| 4 | **Assessor-bar memory** — record what each assessor accepted, so the student learns the bar and can prepare for the next one | no | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | nothing |
| 5 | **TDAE travel claim export** — turn logged shifts into a receipts-and-mileage claim pack | no | – | ✓✓ | ✓✓ | ✓ | ✓ | ✓ | **D1** (off the registration spine) |
| 6 | **Placement prep pack** — before a new placement, what to expect, drawn from own notes plus the ward's basics | mixed | – | ✓✓ | – | ✓ | ✗ | ✓ | **D10** |
| 7 | **Widen "ask your notes"** — deeper recall over the growing corpus | yes | ✓ | – | – | ✓ | ✓ | ✓ | Phase 5 eval gate |
| 8 | **Medicines confidence layer** — practice calculations, own med notes as revision | yes/no | – | – | – | ✓ | ✗ | ✓ | **D10**, and safeMedicate owns it |
| 9 | **Share a read-only progress view with a mentor/assessor** | no | ✓ | – | – | ✓ | ✓ | ✗ | **D11** |

Reading the table: candidates 1–4 are all on the spine and bend nothing serious. 5 pays out
the most per unit of effort but is off the north star. 6 and 8 walk into "not clinical
guidance". 9 fights a locked decision outright.

Two notes on the ⚠ marks:

- **#2 and D7.** A grace-period countdown is, structurally, a deadline warning — the exact
  shape D7 forbids. It is also the one place where silence actively harms the user, because
  the loss is unrecoverable. Resolvable, but the copy has to be *protective* ("your ward's
  window closes Sunday — want to sort Tuesday's hours?"), never *deficit* ("you're behind on
  3 shifts"). Worth Ellis's judgement, not mine.
- **#3 and D10.** Suggesting *which proficiency your own note could evidence* is not clinical
  guidance. Suggesting *that you have achieved it* is close to an assessment claim. The
  language has to stay "you could evidence 3.4 with this" and never "this meets 3.4".

---

## Three candidate directions

Each names the pain it serves, the ethos principle it serves, and — honestly — how it could
be wrong.

### Direction A — "Arrive holding the evidence"

**Candidates 1 + 4, optionally 3.**

The student walks into the midpoint interview with a one-screen brief per proficiency: what
they did, when, on which shift, with whom, which captured notes and reflections back it, and
what this assessor (or the last one) asked for last time. Printable, shareable as a
read-only artefact they hand over — **not** an assessor login.

- **Pain served:** H1, the sign-off choke point. *"worry and confusion about us not having
  things signed off"*; *"some people say you can get it signed off through having a
  conversation… others say you can't"*; assessors who don't know the PAD.
- **Ethos served:** the capture-once→registration spine, and D8's "ready to take to your
  assessor", which is already half-specced in Phase B1 and never built.
- **Why it's strong:** it uses data the app already holds, needs no new capture behaviour,
  and turns three years of accumulated rows into a moment of visible leverage. It is the
  most direct expression of the north star we have not yet built.
- **How it could be wrong:** it pays off at midpoint and final interviews — a handful of
  moments per placement. If students only open PlaceMate three times a term, retention is
  weak and everything upstream (capture, hours) stays cold. It also assumes evidence *volume*
  is the problem; the research says the assessor's *availability* may matter more, and we
  can't fix that.

### Direction B — "Don't lose the hours"

**Candidate 2, with 5 as the adjacent bonus.**

PlaceMate becomes the thing that stops hours falling through the ePAD's window. Per shift:
was it approved in the official record, by whom, and is the window still open? Hold the
approver's name and work email (the student already needs it for the ePAD). Show what is
unapproved and how long is left. Export a reconciliation timesheet. And — because the same
shift data is already there — generate a TDAE-ready travel claim.

- **Pain served:** H2, the hours window (Pan London ePAD guide, verbatim), plus the
  70%-cited financial pain via TDAE.
- **Ethos served:** shift-as-spine (D2/D9) and payoff-on-capture (D3) — this is the most
  literal "you captured it, here's what it just bought you" in the whole map. TDAE turns a
  capture into actual money.
- **Why it's strong:** it is a genuine, unrecoverable loss that no other tool prevents, and
  it drives *daily* engagement rather than termly. It also gives PlaceMate a reason to exist
  that survives the NMC cutting the hours target, because the mechanism (approve daily or
  lose it) doesn't change.
- **How it could be wrong:** it is the direction most likely to feel like nagging, and D7 is
  a hard rule. It also depends on a fact I verified for the **Pan London** ePAD and have not
  verified for MYEPAD, Online PARE, Wales or paper systems — **confirm on the calls before
  committing.** And TDAE explicitly bends D1: it's a real payoff that is not on the
  registration spine.

### Direction C — "Confidence, before the shift"

**Candidate 6 and/or 8, done in an ethos-safe way.**

The second co-primary pillar (D1) is clinical confidence, and it is the one PlaceMate has
barely touched. The safe version is strictly *your own notes, surfaced when relevant*: going
to a shift on a ward where you previously logged catheter care and three med notes? Here's
what you wrote last time. First placement in a new setting? Here's your own kit, not our
advice.

- **Pain served:** H4 — medication fear (87.5% fear disciplinary action, 87.2% fear blame),
  numeracy anxiety, and the RCN's finding that first placements are decisive.
- **Ethos served:** D1's second pillar, and D5's "30 minutes before" notification, which is
  already specced and unbuilt.
- **Why it might be right:** it is the only direction that touches the pillar we've ignored,
  and "your own notes resurfaced at the right moment" is defensible under D10 in a way that
  generic content is not.
- **How it could be wrong:** it is the weakest-evidenced of the three for *our* reach.
  safeMedicate owns numeracy and universities buy it. Anything richer than "your own notes"
  walks straight into clinical guidance. And it depends on Phase D notification
  infrastructure, which is the biggest unbuilt lump in the plan.

---

## Where I'd put my thumb, and why you shouldn't take it as settled

If the calls confirm H2 — that students batch their hours and have been burned by the
window — **Direction B is the strongest thing in this document**, because it is a real loss,
prevented daily, that nobody else prevents, and it fits shift-as-spine perfectly.

If the calls instead say hours are fine and the sign-off chase is the misery, **Direction A**
is the right answer and B is busywork.

They are cheap to distinguish: two questions in section 3A of the
[induction call guide](../docs/research/induction-call-guide.md) separate them. That is the
whole reason the calls come first.

Direction C is the one I'd hold back regardless — not because it's wrong, but because it
costs the most (Phase D infrastructure) and has the least evidence behind it, and because
the AI-recall Phase 5 safety eval is still skipped and would need to land before anything
resembling clinical-adjacent content ships.

---

## Loose ends worth recording

- **Competition exists and is closer than expected.** [ReporticaAI](https://www.reporticaai.co.uk/for-student-nurses)
  sells AI-structured reflections, episodes of care and care plans to UK student nurses at
  £7 a document. Worth twenty minutes of your own time. Our differentiator is the
  longitudinal spine; theirs is instant gratification tonight.
- **Nobody owns the personal layer beside the PAD.** ePAD vendors sell to universities;
  everything else is generic study apps or revalidation tools for qualified nurses. The niche
  is genuinely open. It's also modest — roughly 26,315 UCAS acceptances in 2025.
- **Sonnet 5 has been live on Bedrock in this account since 2026-08-13** and the parse
  pipeline (qwen3-vl / gemma / deepseek / glm-5, four calls, 70–110s) predates it. A
  consolidation was never evaluated. That's an engineering question, not a direction — but if
  Direction A or C wins, a faster/simpler pipeline is worth pricing first.
- **Ask every beta student which PAD system they're on.** Half the specifics in this document
  are Pan London specifics. If none of our six are on Pan London, some of the reasoning above
  needs redoing.
