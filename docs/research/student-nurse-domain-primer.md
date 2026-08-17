# Domain primer — what a UK student nurse actually lives inside

**Written:** 2026-08-17 · **Audience:** Ellis (non-nurse) · **Status:** research, not a spec.
Nothing here modifies app code.

Companion documents:
[`student-nurse-pain-points.md`](student-nurse-pain-points.md) (where it hurts, and who
else is building for it), [`induction-call-guide.md`](induction-call-guide.md) (what to ask
the beta students), and [`plans/2026-08-17-next-direction.md`](../../plans/2026-08-17-next-direction.md)
(what we might build).

## How to read this

Every substantive claim is linked to a source. Confidence markers:

- **[NMC]** — from the regulator's own published standards or news. Treat as fact.
- **[EVIDENCED]** — from a named report, peer-reviewed study or official guide.
- **[VARIES]** — true somewhere, but set locally by the university or region. Never
  hard-code it; ask the student.
- **[CHECK WITH NICOLA]** — I could not settle it from public sources, or the sources
  disagree.

The one rule to carry into every product conversation: **almost nothing about placement is
uniform across the UK.** The NMC sets outcomes; universities and regional consortia decide
the paperwork, the timetable and the rules. When a beta student says "we have to do X", the
right follow-up is always "is that your university or everyone?"

---

## 1. The sixty-second version

A UK student nurse spends three years (BSc) or two (MSc/postgraduate) alternating between
university and clinical placements. Roughly **half the course is placement**. To join the
register they must do three things at once:

1. **Accumulate hours** — currently 2,300 practice hours, recorded and signed off shift by
   shift.
2. **Be assessed as proficient** against the NMC's proficiency statements — observed,
   discussed, and signed off by a named registered nurse.
3. **Pass the academic side** — assignments, exams, numeracy tests, OSCEs.

All three are recorded in a **Practice Assessment Document (PAD)**, which is the official
artefact. When it is complete and signed, the university confirms to the NMC that the
student is fit to register. Then they qualify, get a PIN, and start **preceptorship**.

PlaceMate is a personal layer sitting *beside* all of that. It is not the PAD and cannot be
— which is a constraint, and, as section 5 argues, also the opportunity.

---

## 2. The regulator and the standards

The **Nursing and Midwifery Council (NMC)** regulates nurses, midwives and nursing
associates across the whole UK.

### The proficiencies

[*Future nurse: Standards of proficiency for registered nurses*](https://www.nmc.org.uk/standards/standards-for-nurses/standards-of-proficiency-for-registered-nurses/)
was published **17 May 2018** and refreshed on **30 April 2024** — the refresh changed
"language, structure and layout" only, with the NMC stating "we haven't included any new
content or additional regulatory expectations". **[NMC]** So the 2018 standards are still
the live ones, and the repo is right to have seeded from the 2024 edition
(`spec/spec-nmc-foundations.md`).

Structure:

- **Seven platforms** — 1 Being an accountable professional · 2 Promoting health and
  preventing ill health · 3 Assessing needs and planning care · 4 Providing and evaluating
  care · 5 Leading and managing nursing care and working in teams · 6 Improving safety and
  quality of care · 7 Coordinating care. **[NMC]**
- **Annexe A** — communication and relationship management skills.
- **Annexe B** — **eleven nursing procedures** a newly registered nurse must be able to
  perform, in two parts (assessment procedures, then care/treatment procedures). **[NMC]**

Each platform contains numbered statements (1.1, 1.2, …). The app already tracks at
statement level — 219 statements transcribed verbatim.

### The other standards documents

Students and educators talk about several NMC documents as if they were one thing. They
are not:

| Document | What it governs |
|---|---|
| *Future nurse: Standards of proficiency* | What a student must be able to do by registration |
| *Standards for pre-registration nursing programmes* | Programme shape — hours, parts, simulation cap |
| *Standards framework for nursing and midwifery education* | How universities and placement providers must run education |
| [*Standards for student supervision and assessment* (SSSA)](https://www.nmc.org.uk/standards-for-education-and-training/standards-for-student-supervision-and-assessment/) | Who supervises, who assesses, and how |

### Four fields

Nursing splits into four **fields**: adult, mental health, learning disabilities, and
children's. Students choose at application and stay in it. PlaceMate targets adult first.
This matters more than it looks: a mental health student's placement, proficiencies and
"typical shift" look very different, and three of the six beta students' fields are not
recorded anywhere I can find. **[CHECK WITH NICOLA / ask on the calls.]**

---

## 3. The programme shape, and the hours

### The current rule

A pre-registration nursing programme is a minimum of **4,600 hours: 2,300 theory + 2,300
practice**. **[NMC]** The 50/50 split and the 4,600 total are inherited from EU Directive
2005/36/EC, which is exactly why they are now under review.

Since **January 2023**, NMC Standard 3.4 permits **up to 600 of the 2,300 practice hours to
be simulated practice learning**, where the university has been approved to do so
([Nursing Times, Jan 2023](https://www.nursingtimes.net/education-and-training/nmc-approves-changes-to-pre-registration-education-standards-25-01-2023/)).
**[NMC]** The app already models this cap.

Programmes are divided into **Part 1 / Part 2 / Part 3**, roughly but not exactly the three
years. Progression from one part to the next requires the PAD for that part to be complete
and signed off. **[VARIES]** — some universities run four placements per part, some three.

### Supernumerary status

Students "must be supported to learn without being counted as part of the staffing required
for safe and effective care in that setting"
([NMC](https://www.nmc.org.uk/supporting-information-on-standards-for-student-supervision-and-assessment/student-empowerment/what-to-expect/supernumerary-protected-learning-time/)).
**[NMC]** In plain English: a student is an extra pair of hands *for their own learning*,
not a rostered member of staff. If a student works a shift as a healthcare assistant, those
hours **do not count** toward registration
([RCN](https://www.rcn.org.uk/Get-Help/RCN-advice/student-nurses)). **[EVIDENCED]**

This is one of the most-breached rules in the system — see the pain-points document.

### The live change that matters most to us

**The NMC is mid-way through rewriting the hours model.** On **30 April 2026** it opened a
consultation proposing:

- Dropping the 4,600-hour requirement and instead specifying **a minimum of 1,800 hours
  each of theory and practice — 3,600 total**, keeping the 50/50 balance
  ([NMC news](https://www.nmc.org.uk/news/news-and-updates/nmc-proposes-changes-to-standards-to-improve-practice-learning/)). **[NMC]**
- A **new requirement that every nursing student has a community-setting practice learning
  opportunity**. **[NMC]**
- Exploring a **maximum** on simulated practice learning, proportionate to the reduced
  hours. **[NMC]**

The consultation ran to **23 July 2026** and any change comes in "following a transition
period of at least two years"
([NHS Employers](https://www.nhsemployers.org/news/nmc-consultation-nursing-and-midwifery-practice-learning)).
**[EVIDENCED]** The RCN came out against it on **30 July 2026**, calling the cut
evidence-free — "risking the quality of education is the wrong response", per RCN Chief
Nursing Officer Professor Lynn Woolsey
([RCN press release](https://www.rcn.org.uk/news-and-events/Press-Releases/royal-college-of-nursing-warns-against-proposed-cuts-to-practice-learning-hours)).
**[EVIDENCED]**

The evidence base for the change came from the NMC-commissioned
[Nuffield Trust / Florence Nightingale Foundation rapid review (Dec 2024)](https://www.nuffieldtrust.org.uk/research/practice-learning-in-nursing-and-midwifery-education-an-independent-rapid-review),
which found **no clear evidence for the optimal number of practice hours** and that
stakeholders agreed "the quality of practice learning mattered more than its duration".
**[EVIDENCED]**

**Product consequence.** PlaceMate hard-codes 2,300 as *the* target
(`spec/spec-placement-hours-log.md`: "track **only** toward the **2,300 practice hours**").
That number is (a) already wrong for anyone with recognised prior learning, and (b) has a
credible path to becoming 1,800 for cohorts starting around 2028–29, with both models live
simultaneously during transition. This is not urgent, but "the hours target is a per-student
configurable, not a constant" is a cheap change to make now and an expensive one to retrofit.

---

## 4. Who's who on placement

The SSSA (2018) abolished the old single "mentor" and split the job three ways
([NMC](https://www.nmc.org.uk/standards-for-education-and-training/standards-for-student-supervision-and-assessment/)).
**[NMC]**

| Role | Who they are | What they do |
|---|---|---|
| **Practice supervisor** | Any registered health/social care professional on the placement | Day-to-day supervision and teaching; contributes written observations toward assessment. A student may have many, and often has a different one each shift. |
| **Practice assessor** | A registered nurse, nominated for the placement | Makes the actual assessment decision — signs off proficiencies and the placement — informed by supervisor feedback. One per placement. |
| **Academic assessor** | University academic, nominated per **part** of the programme | Confirms progression from part to part. Cannot be the same person in consecutive parts. |

Also on the ground, name-varying: **practice education facilitators (PEFs)**, **clinical
practice educators**, link lecturers, and a "nominated person" for raising concerns.
**[VARIES]**

Two consequences of the split that a non-nurse will not guess:

1. **The person who teaches you is usually not the person who signs you off.** The student is
   the courier between them — carrying evidence from supervisor observations to the assessor.
   The NMC also removed the old rule that students spend 40% of their time with their
   assessor, so the assessor may barely see them
   ([Diabetes on the Net summary](https://diabetesonthenet.com/journal-diabetes-nursing/new-nmc-standards-changes-student-supervision-and-assessment/)).
   **[EVIDENCED]**
2. **Nobody has to hold the student's whole picture except the student.** That is the gap
   PlaceMate lives in.

### Placement models you will hear named

- **Hub and spoke** — a base placement ("hub") plus short attachments to related services
  ("spokes"), typically following the patient journey. Reported benefits: richer learning, a
  heightened sense of belonging, better grasp of the whole pathway
  ([systematic scoping review, BJN 2023](https://pubmed.ncbi.nlm.nih.gov/36913336/)).
  **[EVIDENCED]**
- **CLiP (Collaborative Learning in Practice)** — coaching-based, students in groups
  coaching each other, a supervisor stepping back. Increases capacity and student
  confidence, but reduces the perceived quality of the student–supervisor relationship
  ([CLiP evaluation, Nurse Educ Pract 2019](https://pubmed.ncbi.nlm.nih.gov/31783268/)).
  **[EVIDENCED]** One of the students in the Kiilu study said CLiP "build[s] your confidence
  up a lot".

---

## 5. The PAD — the thing PlaceMate orbits

### It is not one document

There is **no single national PAD**. The NMC requires that students be assessed; it does not
publish the form. Regional consortia of universities do. The main families:

| Document | Region | Platform | Scale |
|---|---|---|---|
| **PLPAD 2.0 / Pan London ePAD** | London and the south east | MyKnowledgeMap | Consortium of ~14 universities, ~10,000 nursing students ([MyKnowledgeMap](https://www.myknowledgemap.com/post/myprogress-and-pan-london-consortium)); the 2022 student guide says 10 universities were live then |
| **MYEPAD** | Midlands, Yorkshire & East | PebblePad | Collaboration of 28 universities ([Y&H Training Hub](https://yhtraininghubs.co.uk/resource/pebblepad-mye-pad-guide/)) |
| **Online PARE** | North West and others | Online PARE (HEE-funded since 2013) | Institutional, multi-university ([onlinepare.net](https://onlinepare.net/)) |
| **All Wales PAD** | Wales | — | ([Bangor](https://nurse-mentors.bangor.ac.uk/documents/ALL%20WALES%20PRACTICE%20ASSESSMENT%20DOCUMENT.pdf)) |

**[EVIDENCED]** Some universities are still on paper. Nicola's students and our six betas
will be spread across at least two of these. **Ask every beta student which one they use** —
it changes what "the paperwork" means for them.

### What is in it

Consistent across the families
([PLPLG guides](https://plplg.uk/nursing/), [PLPAD 2.0 Part 3, KCL](https://www.kcl.ac.uk/nmpc/assets/practice-learning/nursing-plpad-msc-part-three.pdf)):

- Orientation to the placement
- **Initial, midpoint and final interviews** with the practice assessor — the three fixed
  milestones of every placement
- **Professional values** assessment
- **Proficiencies** — the NMC statements, assessed and signed
- **Episode of care** assessments — a holistic observed assessment of caring for someone
  through an episode. **[VARIES]** Plymouth's ePAD has two per part, plus a third in Part 3
- **Medicines management** assessment — **[VARIES]**, typically one per part
- **Record of learning from others** / additional professional feedback
- **Patient / service user / carer feedback**
- **Ongoing Achievement Record (OAR)** — travels across parts, signed by practice assessor
  and academic assessor at the end of each part
- **Practice hours**

### What filling it in actually involves

This is the part worth reading twice, because it is where PlaceMate's hours log meets
reality. From the
[Pan London ePAD *Guide for Students*](https://plplg.uk/wp-content/uploads/2022/09/Pan_London_ePAD_Guide-Students_Sept_22_R1.pdf)
**[EVIDENCED]**:

- **The student enters their own hours.** "You are responsible for adding your practice
  hours to your ePAD. During a placement, try to get your practice hours signed off daily."
- **Every entry needs a named approver, there and then.** Hours "can be signed off by any
  professional member of staff in the placement area who can verify your presence", using
  their **full name and work email address**. The guide warns: "You must not add practice
  hours assuming they are approved… must be made in the presence of the staff member or with
  their express permission."
- **There is an audit loop.** Approvers get a confirmation email **every Monday** listing the
  hours they approved in the previous seven days, and are told to contact the university if
  they don't recognise them.
- **There is a hard window.** Hours "can be added during the period of a placement and within
  a 'grace period' after the placement, which is set by your university. **You cannot add
  hours outside of the placement period.**"
- **Students cannot correct their own hours.** Only the practice supervisor or assessor can
  amend an entry, and only for the current placement; entries can never be deleted, only
  zeroed or re-dated. Upward adjustments need ePAD support plus assessor confirmation.
- Assessor and supervisor **accounts are created automatically** when the student submits an
  allocation form naming them. The student already holds their assessor's work email.
- There is a **mobile app with offline capability**, precisely because ward Wi-Fi is bad.

Read that list as a product brief and three things jump out:

1. The official record is **write-once, approver-gated, and time-boxed**. A student who
   falls behind cannot simply catch up later — the window closes.
2. The student is nonetheless the one who has to **remember what they did, when, and with
   whom**, days after the fact, from memory or scraps.
3. The ePAD's mobile app exists but the friction is the *approval*, not the typing.

PlaceMate's own spec already says the right thing — "The PAD remains the official signed
record" (`spec/spec-placement-hours-log.md`). The strategic question is whether PlaceMate is
a *parallel* record (which duplicates work) or a *feeder* record that makes the official one
faster and safer to complete. See the direction note.

---

## 6. The assessments students actually fear

- **Episode of care and medicines management assessments** — the observed set-pieces above.
  Students have to arrange them, which means catching an assessor on a shift when both are
  free and the right patient situation exists.
- **Numeracy / drug calculation tests.** Widely feared, often with a very high or 100% pass
  mark **[VARIES / CHECK WITH NICOLA — I could not confirm a universal pass mark]**. The
  standard tool is [safeMedicate](https://safemedicate.com/), 330,000+ users. Foundational
  research found **92% of students and 89% of registered nurses failed** a drug calculation
  test, and that those who failed "were more anxious and less confident" than those who
  passed. **[EVIDENCED]** The RCN publishes
  [maths-anxiety advice](https://www.rcn.org.uk/magazines/Advice/2024/Jan/How-to-overcome-your-fear-of-maths)
  for students, which tells you how common it is.
- **OSCEs (Objective Structured Clinical Examinations)** — timed circuits of practical
  stations at the university. **Important distinction:** the *NMC* OSCE is part of the Test
  of Competence for **internationally educated** nurses joining the register
  ([NMC](https://www.nmc.org.uk/registration/joining-the-register/toc/na-toc/osce/)). A UK
  student's OSCE is their **university's** exam, not the NMC's. Don't conflate them in copy.
- **Academic assignments and reflective writing.** **Gibbs' Reflective Cycle** (1988;
  describe → feelings → evaluate → analyse → conclude → action plan) is the default
  framework on UK practice-based courses, and maps onto the reflective accounts the NMC
  later wants at revalidation. **[EVIDENCED]** PlaceMate already builds on Gibbs.

---

## 7. What happens after they qualify

- **Preceptorship** — a structured, supported first period in the new role. The NMC's
  [principles of preceptorship](https://www.nmc.org.uk/standards/guidance/preceptorship/)
  cover organisational culture, quality and oversight, preceptee empowerment, preparing
  preceptors, and the programme itself. NHS England has a
  [national preceptorship framework for nursing](https://www.england.nhs.uk/long-read/national-preceptorship-framework-for-nursing/).
  It is explicitly *not* a re-test of registration competence. **[NMC]**
- **Revalidation** — every registered nurse revalidates every **three years**: 450 practice
  hours, 35 hours CPD (20 participatory), 5 pieces of practice-related feedback, 5 written
  reflective accounts, a reflective discussion with another registrant, health and character
  declaration, indemnity, and a confirmer. **[EVIDENCED]**

Revalidation matters commercially: it is the same shape of problem (log hours, log CPD,
write reflections, get a confirmation) for a much larger, salaried population, and there are
already paid products aimed at it. It is *not* the ethos's north star — but it is the
obvious "what happens to a PlaceMate user when they qualify?" question, and the RePAIR and
RCN evidence says the first two years post-registration are exactly where people leak out of
the profession.

---

## 8. Vocabulary cheat sheet

| Term | Means |
|---|---|
| **PAD / ePAD** | Practice Assessment Document — the official assessment record. Regional, not national. |
| **OAR** | Ongoing Achievement Record — the part of the PAD that travels between placements and parts. |
| **PS / PA / AA** | Practice supervisor / practice assessor / academic assessor. |
| **PEF** | Practice education facilitator — trust-side person who supports students across placements. |
| **Proficiency** | One numbered statement from the NMC standards that must be evidenced and signed. |
| **Platform** | One of the seven groupings of proficiencies. |
| **Annexe B** | The eleven nursing procedures. |
| **Supernumerary** | Not counted in the ward's staffing numbers. |
| **Part** | Programme stage (1/2/3), roughly a year; progression is gated on the PAD. |
| **Episode of care** | A holistic observed assessment of caring for a person through an episode. |
| **Spoke** | A short attachment away from the main placement. |
| **CLiP** | Collaborative Learning in Practice — coaching-based placement model. |
| **LSF / TDAE** | NHS Learning Support Fund / Travel and Dual Accommodation Expenses — the money. |
| **Preceptorship** | Structured support in the first post-registration year. |
| **Revalidation** | Three-yearly renewal of registration. |
| **Test of Competence / NMC OSCE** | The internationally-educated nurse route. Not a UK student's exam. |

---

## 9. Six things I got wrong before doing this research

Recorded because they are the same six a product decision could get wrong.

1. **"The PAD" is not one document.** It's three or four regional families on different
   software vendors. Any feature phrased as "your PAD" needs to survive that.
2. **Students can't back-fill hours.** The official record has a hard grace period and an
   approver-gated write path. "Catch up later" is not available to them in the system that
   counts.
3. **The assessor is often not the person who watched you.** The student is the evidence
   courier — which is why "capture once" is worth more here than in most domains.
4. **The 2,300-hour target is not permanent.** It is under live consultation, with 1,800
   proposed and a two-year-plus transition.
5. **The UK student OSCE is not the NMC OSCE.** Different exam, different population.
6. **Simulated hours are already a first-class part of the count** (up to 600), not an
   edge case — and the NMC may soon cap them explicitly.

---

## Sources

- [NMC — Standards of proficiency for registered nurses](https://www.nmc.org.uk/standards/standards-for-nurses/standards-of-proficiency-for-registered-nurses/)
- [NMC — Future nurse: Standards of proficiency (2018 PDF)](https://www.nmc.org.uk/globalassets/sitedocuments/education-standards/future-nurse-proficiencies-2018.pdf)
- [NMC — Standards for student supervision and assessment](https://www.nmc.org.uk/standards-for-education-and-training/standards-for-student-supervision-and-assessment/)
- [NMC — Supernumerary and protected learning time](https://www.nmc.org.uk/supporting-information-on-standards-for-student-supervision-and-assessment/student-empowerment/what-to-expect/supernumerary-protected-learning-time/)
- [NMC — Proposes changes to standards to improve practice learning (2026)](https://www.nmc.org.uk/news/news-and-updates/nmc-proposes-changes-to-standards-to-improve-practice-learning/)
- [NMC — Future standards / practice learning review](https://www.nmc.org.uk/standards/future-standards/)
- [NMC — Principles of preceptorship](https://www.nmc.org.uk/standards/guidance/preceptorship/)
- [NMC — OSCE (Test of Competence)](https://www.nmc.org.uk/registration/joining-the-register/toc/na-toc/osce/)
- [Nuffield Trust / FNF — Practice learning in nursing and midwifery education: an independent rapid review (Dec 2024)](https://www.nuffieldtrust.org.uk/research/practice-learning-in-nursing-and-midwifery-education-an-independent-rapid-review)
- [NHS Employers — NMC consultation on practice learning](https://www.nhsemployers.org/news/nmc-consultation-nursing-and-midwifery-practice-learning)
- [RCN — Warning against proposed cuts to practice learning hours (30 Jul 2026)](https://www.rcn.org.uk/news-and-events/Press-Releases/royal-college-of-nursing-warns-against-proposed-cuts-to-practice-learning-hours)
- [Nursing Times — NMC approves changes to pre-registration education standards (Jan 2023)](https://www.nursingtimes.net/education-and-training/nmc-approves-changes-to-pre-registration-education-standards-25-01-2023/)
- [Pan London Practice Learning Group — nursing ePAD resources](https://plplg.uk/nursing/)
- [Pan London ePAD — Guide for Students (Sept 2022)](https://plplg.uk/wp-content/uploads/2022/09/Pan_London_ePAD_Guide-Students_Sept_22_R1.pdf)
- [PLPAD 2.0 Master Part 3 (KCL)](https://www.kcl.ac.uk/nmpc/assets/practice-learning/nursing-plpad-msc-part-three.pdf)
- [MyKnowledgeMap — MyProgress and the Pan London Consortium](https://www.myknowledgemap.com/post/myprogress-and-pan-london-consortium)
- [Yorkshire & Humber Training Hub — PebblePad / MYEPAD guide](https://yhtraininghubs.co.uk/resource/pebblepad-mye-pad-guide/)
- [Online PARE](https://onlinepare.net/)
- [All Wales Practice Assessment Document](https://nurse-mentors.bangor.ac.uk/documents/ALL%20WALES%20PRACTICE%20ASSESSMENT%20DOCUMENT.pdf)
- [University of Plymouth — ePAD (episodes of care / medicines management counts)](https://www.plymouth.ac.uk/student-life/your-studies/academic-services/poppi/epad)
- [RCN — Student nurses advice guide](https://www.rcn.org.uk/Get-Help/RCN-advice/student-nurses)
- [RCN — Maths anxiety: 5 steps to overcome your fear](https://www.rcn.org.uk/magazines/Advice/2024/Jan/How-to-overcome-your-fear-of-maths)
- [safeMedicate](https://safemedicate.com/)
- [BJN — A systematic scoping review of undergraduate nursing hub-and-spoke placement models](https://pubmed.ncbi.nlm.nih.gov/36913336/)
- [CLiP: Evaluation of a new approach to clinical learning](https://pubmed.ncbi.nlm.nih.gov/31783268/)
- [Diabetes on the Net — The new NMC standards: changes to student supervision and assessment](https://diabetesonthenet.com/journal-diabetes-nursing/new-nmc-standards-changes-student-supervision-and-assessment/)
