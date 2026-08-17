# Where it actually hurts — student nurse pain points, and who else is building for them

**Written:** 2026-08-17 · **Status:** research, not a spec.
Companion to [`student-nurse-domain-primer.md`](student-nurse-domain-primer.md).
Read the primer first if you don't yet know what a PAD is.

## Method and its limits

Desk research against named sources: the RCN's 2025 policy report (which draws on a 2024
survey of 1,000+ students in England plus commissioned qualitative work), the
NMC-commissioned Nuffield Trust rapid review (Dec 2024), a 2025 peer-reviewed qualitative
study of third-year students, the RePAIR programme, and the ePAD vendors' own student
guides.

**What this cannot tell us:** none of it is *our* users. Reddit and student forums were not
reachable from this toolchain. The six beta students have generated **zero** rows of app
data. Everything below is a hypothesis to test on the induction calls — which is what
[`induction-call-guide.md`](induction-call-guide.md) is for.

---

## 1. The headline, stated honestly

**When students are asked why they might leave, paperwork is not what they say.**

RCN 2024 survey — reasons students gave for *considering withdrawal*
([Fixing the Leaking Pipeline, RCN, March 2025](https://www.rcn.org.uk/Professional-Development/publications/rcn-fixing-the-leaking-pipeline-uk-pub-012-012)):

| Reason | % |
|---|---|
| Financial difficulties | **70%** |
| Lack of teaching and supervision time from staff | **63%** |
| Stress and mental health concerns | **61%** |
| Affected by low morale and burnout among nursing staff | **58%** |
| Unwelcoming atmosphere during practice learning placements | **52%** |
| (of those considering withdrawing) need for more flexible placement scheduling | **52%** |

Attrition: the RCN calculates that on average **21% of nursing students leave without
qualifying**. Applications are down **21.4% since the 2021 peak**; three in five
universities have long-standing nurse educator vacancies. **[EVIDENCED]**

So: the biggest levers in this domain are money, staffing and belonging — none of which an
app can fix. **That is a finding, not a failure.** It means any honest product claim has to
be about the pains a personal tool *can* touch, and about not adding to the pile. It also
means "we reduced your admin" is a smaller promise than the sector's actual crisis, and we
should not oversell it.

What follows splits the ground into three, as the handoff asked.

---

## 2. Structural pain — real, large, mostly out of reach

Money, travel, rota chaos. Recorded here so we don't accidentally build against it.

- **Money.** Financial pressure is the number-one withdrawal reason (70%). The NHS
  [Learning Support Fund](https://www.nhsbsa.nhs.uk/nhs-learning-support-fund-lsf) exists,
  and [Travel and Dual Accommodation Expenses (TDAE)](https://www.nhsbsa.nhs.uk/nhs-learning-support-fund-lsf/travel-and-dual-accommodation-expenses-tdae)
  reimburses extra placement travel — **retrospectively, on receipts, within 6 months of the
  end of the placement period**. The Nuffield Trust found "current systems for claiming back
  expenses too complex to navigate". **[EVIDENCED]**
- **Travel and rota chaos.** From the RCN's focus groups: a second-year student describing
  a 5am wake-up for a 5.50 bus to be on shift for 7.30, with shifts overrunning to 9.30pm.
  Universities allocating placements "rely on Google maps… without considering public
  transport and the realities of parking". Placements and shift patterns "can be arranged
  with very little notice" — brutal for anyone with childcare. **[EVIDENCED]**
- **Supernumerary status breached.** The Nuffield Trust review found students "routinely
  denied supernumerary status and forced to fill rota gaps"; the RCN in May 2025 said the
  practice "must end". Hours worked as a healthcare assistant do not count toward
  registration. **[EVIDENCED]**
- **Hours as a poverty trap.** From the RCN report, a student: *"I can't work 16 hours a week
  to qualify for the free 30 hours a week to put my daughter in [child]care, even though I'm
  working 2,300 hours…"* **[EVIDENCED]**

**One narrow, real opening here.** TDAE is a retrospective, receipt-based, deadline-bound
claim, keyed to placement travel. PlaceMate already knows every shift, every placement and
every date. A TDAE-ready travel export is a small feature against a 70%-cited pain. It is
also *money in the student's pocket*, which is a payoff nothing else in the app can match.
Filed as a candidate, not a recommendation — see the direction note.

---

## 3. Paperwork and assessment pain — smaller in the surveys, sharper in the qualitative work

The survey instruments mostly don't ask about the PAD. The qualitative work does, and it is
unambiguous.

### The strongest single source

[Kiilu et al. (2025), *A Qualitative Exploration of the Practice Learning Experiences of
Third-Year Nursing Students*](https://pmc.ncbi.nlm.nih.gov/articles/PMC12681425/) —
hermeneutic phenomenology, **17 third-year students across three English universities**,
online focus groups Feb–Jun 2023, thematic analysis. Five themes: physical and emotional
impact; lack of confidence in the assessment process due to inconsistency; being prepared
for practice; the impact of the practice supervisor/assessor; and what might help.
**[EVIDENCED]**

Participant voices, verbatim:

> "worry and confusion about us not having things signed off"

> "you've got a really push for… getting some of your proficiencies signed off"

> "some people say you can get it signed off through having a conversation… others say you
> can't"

> "some staff won't be happy to sign it off unless… you can do that independently or even
> teach it"

> "They were just happy to sign it off, they didn't speak to anyone or verify it"

> "I feel like I have gone into year 3 drowning and I don't know anything… overwhelmed"

> "very very lonely, and it was scary" — and exhausted "from having to push all the time"

> "Sometimes… proficiencies can like take your focus away from just being present on the
> ward"

And on the assessors themselves: *"lack of preparation for PAs: she didn't know how to use
pad"*.

### What that decomposes into

Five distinct pains, worth separating because they have different fixes:

1. **The chase.** The student is the one who has to push, repeatedly, to get a busy
   registered nurse to sit down and sign. It is emotional labour, not admin, and it is
   described as exhausting and lonely.
2. **The inconsistency.** The bar for "signed off" varies by assessor — conversation vs
   observation vs independent performance vs teach-it-back. The student cannot know in
   advance what evidence will be accepted.
3. **The assessor's unfamiliarity.** Some assessors don't know the PAD. A student
   corroborated by the Bucks New University ePAD study (224 participants) reported "practice
   assessors were not always available… leading to delays in completing their assessments".
   **[EVIDENCED — abstract only; full text not retrieved]**
4. **The window.** The Pan London ePAD is explicit: hours may only be added during the
   placement and a university-set grace period, must be approved by a named staff member with
   their work email at the time, and cannot be amended by the student afterwards
   ([Guide for Students](https://plplg.uk/wp-content/uploads/2022/09/Pan_London_ePAD_Guide-Students_Sept_22_R1.pdf)).
   Fall behind and the record is not recoverable by the student alone.
5. **The displacement.** "Proficiencies can take your focus away from just being present on
   the ward." Chasing evidence competes with learning. This is the deepest one, and it is
   exactly what the ethos means by "take the weight off".

### What the paperwork pain is *not*

It is not primarily typing. The ePAD already has a mobile app with offline support. The
friction is **approval, availability and ambiguity** — three human problems wearing an
admin costume. Any feature premised on "the PAD is slow to fill in" will underperform;
features premised on "you arrive at the sign-off meeting already holding the evidence" will
not.

---

## 4. Confidence pain — the second co-primary pillar, and well evidenced

- **Medicines.** Students report "fear of making mistakes, a lack of pharmacology knowledge
  and low self-confidence in calculating drug dosages"
  ([Nurse Educ Pract 2024](https://www.sciencedirect.com/science/article/abs/pii/S1471595324002270)).
  Fear of reporting is worse than fear of erring: in one study **87.5%** feared disciplinary
  action and **87.2%** feared blame. **[EVIDENCED]**
- **Numeracy.** The classic finding: **92% of students and 89% of registered nurses failed**
  a drug calculation test, and those who failed were more anxious and less confident than
  those who passed. [safeMedicate](https://safemedicate.com/) is the standard remediation
  tool (330,000+ users); the RCN publishes maths-anxiety advice. **[EVIDENCED]**
- **Belongingness.** A whole literature, from Levett-Jones onward: belonging is described as
  a **prerequisite** for clinical learning; where it is absent, students show reduced
  motivation, confusion over the nurse role, adoption of poor practice to fit in, and
  increased anxiety
  ([Levett-Jones & Lathlean, 2008](https://pubmed.ncbi.nlm.nih.gov/18291327/);
  [BES-CPE scale, 2009](https://pubmed.ncbi.nlm.nih.gov/19831149/)). The RCN's finding that
  52% cite "an unwelcoming atmosphere" is the same phenomenon in survey form; so are its
  reports of students being called "the student" rather than by name, and being placed with
  supervisors who resented having them. **[EVIDENCED]**
- **The first placement is decisive.** The RCN found students "particularly vulnerable to
  the negative impacts of poor experiences when they happened on first placements", and that
  getting the first one right "can set the student up for a greater chance of success".
  **[EVIDENCED]**
- **And the good news that constrains us:** students are *most* satisfied with the actual
  nursing. **89%** satisfied with their interpersonal interactions with patients, **78%**
  with hands-on experience. The care is fine. The scaffolding around it is what breaks.
  **[EVIDENCED]**

---

## 5. The competitive landscape

### The incumbents are not competitors — they are the system of record

**ePAD vendors** (MyKnowledgeMap for Pan London, PebblePad for MYEPAD, Online PARE in the
North West) are sold to universities and consortia, not students. Students don't choose
them, can't leave them, and their data can't be exported into a personal tool. They own the
official record and will keep owning it. **Competing with them is not available to us; being
useful upstream of them is.**

### The one direct competitor found

**[ReporticaAI](https://www.reporticaai.co.uk/for-student-nurses)** — UK, aimed explicitly
at student nurses. Paste rough clinical notes; it produces NMC-aligned reflections, episodes
of care, care plans, practice-supervisor summaries and medication records, structured with
Gibbs/Driscoll/APIE, auto-mapped to Platforms 1–7. Also an SBAR handover tool, a placement
prep dashboard, a CV builder, and a separate revalidation product. Pricing: **first document
free, then £7 per document**, no subscription; revalidation pack £25. A "Reportica Pulse"
digital portfolio is in pre-pilot. **[EVIDENCED — from their own marketing; not verified in
use.]**

This is the closest thing to PlaceMate's capture layer that exists, and it is worth Ellis
looking at directly. Read across:

| | ReporticaAI | PlaceMate |
|---|---|---|
| Unit of value | A document, one at a time, £7 | A connected record over three years |
| Input | Paste text | Photograph handwritten notes; shift-linked capture |
| Output | A polished artefact to paste elsewhere | Hours, skills, proficiency evidence, sign-off readiness |
| Spine | None — each document is standalone | The shift, and the path to registration |
| Positioning risk | Writes the reflection *for* you | "Your notes, not guidance" |

The differentiator is the spine and the longitudinal record; the risk is that a student in a
hurry wants exactly one polished document tonight and will pay £7 for it. Note also that
their model — generate the reflective account — sits close to a line PlaceMate deliberately
does not cross.

### Everything else is generic

Searches for UK student-nurse hours/portfolio apps surface: Anki, Quizlet, Notion, My Study
Life, Toggl, MyDuty, Nursegrid, and US-market NCLEX products. The one adjacent UK-specific
app found is **[Revalidation Copilot](https://apps.apple.com/pl/app/revalidation-copilot/id6760566022)**
— CPD, reflections and practice hours for *registered* nurses at revalidation, not students.

**Conclusion: the UK student-nurse niche is genuinely open.** Nobody owns "the personal layer
beside the PAD". That is unusual and worth noting — but the scale is modest: ~26,315 UCAS
acceptances onto UK nursing courses in 2025, so roughly 70–80k students in the pipeline at
any time. **[EVIDENCED — acceptances figure; the pipeline estimate is mine.]**

---

## 6. What I'd bet on, and what I wouldn't

**Best-supported hypotheses** (evidence + a mechanism PlaceMate can act on):

- **H1. The sign-off conversation is the choke point, not the writing.** Students arrive at
  assessor meetings without evidence marshalled, and the assessor's bar is unknowable in
  advance. *Evidence: Kiilu themes 1–3; ePAD study delays.*
- **H2. The hours window is a silent trap.** Students who don't get hours approved daily
  cannot fix it later themselves. *Evidence: Pan London ePAD guide, verbatim.*
- **H3. Evidence-chasing displaces learning.** "Proficiencies can take your focus away from
  just being present on the ward." *Evidence: Kiilu theme 5.*
- **H4. Confidence pain concentrates on medicines and the first placement.** *Evidence:
  medication-error literature; RCN on first placements.*

**Weakly supported / would need the calls to confirm:**

- That students experience *duplication* between what they write and what the PAD wants.
  Plausible, widely assumed, and I found no direct evidence of it. **Test this on the calls
  before building for it.**
- That students want anything resembling revision content from us. Revision apps exist and
  the pain data doesn't point here.

**Would not bet on:**

- Anything requiring the assessor to log in (ethos D11, and the SSSA already gives them an
  ePAD account they resent).
- Anything positioned as reducing "admin burden" as the headline promise. Students' stated
  problems are money, supervision and belonging. Admin is a real irritant inside a much
  larger fire, and claiming otherwise reads as out of touch.

---

## Sources

- [RCN — Fixing the Leaking Pipeline (policy report, March 2025)](https://www.rcn.org.uk/Professional-Development/publications/rcn-fixing-the-leaking-pipeline-uk-pub-012-012) ([PDF](https://www.rcn.org.uk/-/media/Royal-College-Of-Nursing/Documents/Publications/2025/March/012-012.pdf))
- [Nuffield Trust / FNF — Practice learning in nursing and midwifery education: an independent rapid review (Dec 2024)](https://www.nuffieldtrust.org.uk/research/practice-learning-in-nursing-and-midwifery-education-an-independent-rapid-review)
- [Kiilu et al. (2025) — Practice learning experiences of third-year nursing students](https://pmc.ncbi.nlm.nih.gov/articles/PMC12681425/) · [journal version](https://onlinelibrary.wiley.com/doi/10.1155/nrp/1712974)
- [NHS England / HEE — RePAIR: Reducing Pre-registration Attrition and Improving Retention](https://www.hee.nhs.uk/our-work/reducing-pre-registration-attrition-improving-retention)
- [RCNi — Nursing student attrition rate remains unchanged for 2019, despite RePAIR project](https://rcni.com/nursing-standard/newsroom/news/student-attrition-why-do-nursing-students-leave-their-course-completion-169446)
- [RCN — Using nursing students to plug NHS staff shortages must end now (May 2025)](https://www.rcn.org.uk/news-and-events/news/uk-using-nursing-students-to-plug-nhs-staff-shortages-must-end-now-110525)
- [NHSBSA — NHS Learning Support Fund](https://www.nhsbsa.nhs.uk/nhs-learning-support-fund-lsf) · [Travel and Dual Accommodation Expenses](https://www.nhsbsa.nhs.uk/nhs-learning-support-fund-lsf/travel-and-dual-accommodation-expenses-tdae)
- [Pan London ePAD — Guide for Students (Sept 2022)](https://plplg.uk/wp-content/uploads/2022/09/Pan_London_ePAD_Guide-Students_Sept_22_R1.pdf)
- [Buckinghamshire New University — The use of ePADs on placement: experiences of nursing students](https://www.researchgate.net/publication/394683430_The_use_of_Electronic_Practice_Assessment_Documents_ePADs_on_placement_Experiences_of_Nursing_Students)
- [Levett-Jones & Lathlean — Belongingness: a prerequisite for nursing students' clinical learning](https://pubmed.ncbi.nlm.nih.gov/18291327/) · [Belongingness Scale–Clinical Placement Experience](https://pubmed.ncbi.nlm.nih.gov/19831149/)
- [Perceptions of undergraduate nursing students regarding their competency in administering medications (Nurse Educ Pract, 2024)](https://www.sciencedirect.com/science/article/abs/pii/S1471595324002270)
- [Medication errors by nursing students on clinical practice: an integrative review](https://www.sciencedirect.com/science/article/abs/pii/S0260691722000612)
- [safeMedicate](https://safemedicate.com/) · [RCN — Maths anxiety: 5 steps to overcome your fear](https://www.rcn.org.uk/magazines/Advice/2024/Jan/How-to-overcome-your-fear-of-maths)
- [ReporticaAI — for student nurses](https://www.reporticaai.co.uk/for-student-nurses)
- [Online PARE](https://onlinepare.net/) · [MyKnowledgeMap / Pan London Consortium](https://www.myknowledgemap.com/post/myprogress-and-pan-london-consortium) · [PebblePad / MYEPAD](https://yhtraininghubs.co.uk/resource/pebblepad-mye-pad-guide/)
- [Revalidation Copilot (App Store)](https://apps.apple.com/pl/app/revalidation-copilot/id6760566022)
- [NHS England — Student nursing numbers rise for first time since pandemic surge (Sept 2025)](https://www.england.nhs.uk/2025/09/student-nursing-numbers-rise-first-time-since-pandemic-surge/)
