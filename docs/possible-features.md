# Possible features

A running list. Nothing here is committed, specced or scheduled. Add to it freely; move
things into `spec/` when they graduate.

Grounded in [`research/student-nurse-domain-primer.md`](research/student-nurse-domain-primer.md)
and [`research/student-nurse-pain-points.md`](research/student-nurse-pain-points.md).

---

## Logged 2026-08-17

### Hours target should be a per-student value, not the constant 2,300

`spec/spec-placement-hours-log.md` locks the target at 2,300 practice hours. That number is
already wrong for anyone entering with recognised prior learning, and the NMC has consulted
on replacing it with 1,800 (3,600 total, 50/50 theory and practice). The consultation closed
23 July 2026 with a transition of at least two years, so both models will be live at once
across overlapping cohorts.

Make the target a field on the student's profile, defaulting to 2,300, with the simulation
cap (currently 600) as a second field. Cheap now. Expensive once two cohort models are in
production and every hours calculation has to branch.

Related: the same profile probably wants field of nursing (adult / mental health / LD /
children's), programme part, and which PAD system the student is on, since none of those are
recorded and all of them change what the app should say.

---

## What ReporticaAI already sells

Worth knowing so we don't spend effort re-taking ground.

[ReporticaAI](https://www.reporticaai.co.uk/for-student-nurses) is a UK AI documentation
company covering 15+ regulated sectors (CQC packs, policy drafting, meeting notes). Student
nurses are one vertical among many. Their pitch: "Stop losing evenings to placement
reflections" and "Your clinical portfolio should not start from scratch." You paste rough
notes, they return a formatted artefact mapped to NMC Platforms 1 to 7. First document free,
then £7 each, no subscription. CV export £7. Revalidation pack £25. Five document types:
reflective account, episode of care, care plan, practice supervisor summary, medicine
management record. Plus a placement prep checklist and an SBAR handover formatter.

Three things follow from that shape.

They sell the evening after the shift. Everything they do assumes the student is at a laptop
with notes already written, doing paperwork. They have nothing during the shift and nothing
across a placement.

They sell one artefact at a time. There is no accumulating record, no hours, no sign-off
state, no sense of where you are against registration. "Portfolio Continuity" appears as a
feature name but the pricing (£7 per document, no subscription) tells you what the product
really is.

They write the words for you. PlaceMate deliberately does not. The sanitiser can swap a word
but never extend a note, and the framing is "your notes, not guidance". That constraint looks
like a handicap next to a £7 finished essay. It is also the only reason a student can put a
PlaceMate output in front of an assessor and defend it as their own.

So the ground they cannot take: anything that requires being there during the shift, anything
that requires three years of the student's own history, and anything that requires knowing
the specific humans on the specific ward.

---

## Blue sky

### The courier problem

The SSSA split supervision from assessment. A different registered nurse watches you each
shift, and a single practice assessor signs you off having barely seen you work. The student
carries evidence between them, from memory, weeks later. Nobody else in the system holds that
whole picture.

**Witness stamps.** Every capture optionally records who saw it. Name, role, date, shift. Six
weeks later the proficiency's evidence list reads "cannulation, 4 Aug, late shift, Sarah
Okafor watched" instead of "cannulation". That single field turns a private note into
something an assessor can act on, and it costs one tap at capture time. The app already
stores `supervisingRnName` on the shift, so half the plumbing exists.

**The assessor bar log.** Students report that the bar for "signed off" moves between
assessors: a conversation for one, independent performance for another, teach-it-back for a
third. After each sign-off, one tap records what this assessor wanted. Next time the student
knows how to prepare. Aggregate it across users later and the app can say what assessors on
this ward have typically asked for, which is knowledge no individual student can accumulate
and no vendor currently holds.

**The ask.** The hard part of a midpoint interview is not writing it up, it is the awkward
message: catching a busy nurse and asking for an hour. Draft that message, prefilled with
what the student wants signed and the evidence behind each item, ready to send on WhatsApp or
email. Small feature, genuinely nasty problem, and it sits in the gap between "I have the
evidence" and "it is in the PAD" where the app currently stops.

**One-shot witness requests.** After a shift, the supervisor gets a link and writes two lines
of feedback without creating an account. That feeds the "record of learning from others" form
which exists in every PAD family. This bends D11 (assessors and mentors are not users), so
flag it rather than assume it. A one-time responder is not a user in the way D11 meant, but
Ellis should be the one to decide that.

### The shift as an opportunity, not just a record

Right now a shift is something you log after it happens. It could be something you plan
against.

**Opportunity radar.** The app knows which proficiencies are outstanding, which set-piece
assessments are still needed (typically two episodes of care and one medicines management per
part), and who is on the shift. Before a long day it can say: you still need an episode of
care this part, today is twelve hours with your named assessor, worth asking. That is the
"next-action pull" bar from `spec/roadmap-usability.md` §0 applied to the thing students
actually optimise.

**Hours insurance.** The Pan London ePAD requires each hours entry to be approved by a named
staff member at the time, with their work email, and hours cannot be added after the
placement plus a university-set grace period. Students cannot amend their own entries. So a
shift that goes unapproved is money the student worked for and lost. PlaceMate could track
approval state per shift, hold the approver's details, and when the window is closing, offer
a ready-made message listing exactly which hours are outstanding and who needs to confirm
them. Verify the rule holds for MYEPAD, Online PARE and Wales before building.

**Spoke days.** Short attachments away from the base placement, often in a setting the
student will never see again, generating exactly the unusual evidence that gets forgotten.
Cheap to support, and it makes the app useful on the weirdest day of the placement rather
than the most routine.

### Belonging and the first day

52% of students who considered leaving cited an unwelcoming atmosphere. The RCN heard of
students being called "the student" rather than by name. First placements set the trajectory.

**Placement passport.** A one-page card the student shows the ward on day one: name, year,
field, what they are trying to achieve this placement, what they can already do unsupervised.
It gives a busy nurse something useful in ten seconds and gives the student a reason to be
introduced by name. No AI, no backend, and it addresses the pain that appears in the survey
data above every paperwork complaint.

**What the last student wished they'd known.** Opt-in, anonymised, ward-level notes from
PlaceMate users who were there before: where the linen is, who to ask, what the shift pattern
really is, what this ward is good for evidencing. Strong network effect, and nobody else can
build it because nobody else has students writing during placement. Also the riskiest idea
here: user-generated content about named NHS wards and by implication named staff. Would need
moderation and a clear line between "here is the ward routine" and "here is what I think of
the staff".

### The record outlives the student

**Qualification handover.** The day a student registers, everything they captured becomes the
opening balance of their revalidation: 450 practice hours every three years, 35 hours CPD,
five reflective accounts, five pieces of feedback. PlaceMate holds most of that shape already.
ReporticaAI charges £25 for a revalidation pack assembled from nothing. PlaceMate could hand
its users a head start for free, and stop being an app they delete when they qualify.

**What I can do now.** Signed-off skills and proficiencies are, in aggregate, a competence
record. At the end of Part 3 that is a job application, an interview brief, and the answer to
"tell me about a time you". The data is already there; the feature is presenting it as
something other than a progress bar.

### The anxiety of not knowing where you stand

The clearest finding in the qualitative research is "worry and confusion about us not having
things signed off". Students do not know whether they are behind, and there is no way to find
out except asking a peer.

**Honest projection.** Not a percentage bar. A date. At your current rate you reach 2,300 in
March, which is three weeks before your programme ends. Same data, different question
answered. Catches the student who is quietly 200 hours short while a bar shows 91%.

**Cohort context.** Anonymised: most Part 2 students have this many proficiencies evidenced
by this point in the year. This is the most direct answer to the biggest stated anxiety, and
it runs straight into D7 (encouraging by default, never nagging), because comparison is a
deficit frame by construction. Possibly resolvable by only ever showing it when the student
asks, and never in a feed. Flag for Ellis rather than assume.

### Things I considered and would leave

**Numeracy practice built on the student's own med notes.** Tempting, because the med log
already exists and drug calculations are genuinely feared. But safeMedicate owns this, is sold
to universities, and a drill that generates a wrong answer against a real drug the student
recorded on a real ward crosses the line D10 exists to hold.

**Anything that formats the reflection.** ReporticaAI does it for £7 and does it well enough.
Competing there means competing on writing quality against a product whose whole business is
writing quality, while giving up the one claim that makes PlaceMate defensible in front of an
assessor.

**An assessor-facing app.** D11 closed this. Worth noting that the ePAD already creates
assessor accounts automatically and students report assessors who do not know how to use
them, so the demand for another login is negative.
