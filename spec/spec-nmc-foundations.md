# Spec — NMC Foundations (reference)

The domain facts the whole app is built on. These were established from the
NMC's published *Standards of proficiency for registered nurses* and the
programme standards. **When seeding the proficiency master list, pull the exact,
current statements from the official NMC document** rather than relying on this
summary — the structure is stable but the wording is the NMC's.

## Fields of nursing

Four fields: **adult**, mental health, learning disabilities, children's. This
app targets **adult** first; the model leaves room to extend (`NursingField`
enum).

## The seven platforms

The proficiencies are organised under seven platforms:

1. Being an accountable professional
2. Promoting health and preventing ill health
3. Assessing needs and planning care
4. Providing and evaluating care
5. Leading and managing nursing care and working in teams
6. Improving safety and quality of care
7. Coordinating care

Each platform contains numbered proficiency **statements** (e.g. 1.1, 1.2, …).
The app tracks at the **individual statement** level, not just platform level.

## The two annexes

- **Annexe A — Communication and relationship management skills.** The
  communication skills a nurse must demonstrate to understand people, meet care
  needs, and document accurately (active listening, breaking bad news,
  de-escalation, working with interpreters, etc.).
- **Annexe B — Nursing procedures.** Eleven nursing procedures a newly
  registered nurse must be able to perform. Two parts: **Part 1** — procedures
  for assessing needs for person-centred care (vital signs, ABCDE-type
  assessment, level of consciousness, etc.); **Part 2** — procedures for
  planning, providing and managing care (medicines management, wound care,
  nutrition and hydration, infection prevention, etc.).

**Design implication:** Annexe B is the national, university-agnostic baseline
for the clinical-skills list. Every university's "skills passport" is essentially
that baseline plus local extras — so the skills tracker seeds from Annexe B and
lets students add their own.

## Hours

A pre-registration programme requires a **minimum of 4,600 hours**, split as at
least **2,300 theory** and at least **2,300 practice** hours over three years.
**Up to 600** of the practice hours may be **simulated practice learning**.

**Design implications:**
- The hours log tracks **only the 2,300 practice** target (theory is out of
  scope per the decisions).
- Simulated hours are a **subset** of the 2,300 (not additional), separately
  flagged and tracked against the **600** cap.

## Programme "parts"

Programmes divide into a number of progression parts (commonly three for a
3-year BSc), and which proficiencies are due in which part is set **by each
university** — so an agnostic app cannot hardcode it. The model handles this by:

- shipping the full national proficiency list,
- letting the user set their **current part** (and **total parts**) on their
  profile,
- allowing an optional **target-part tag** per proficiency for sharper gap
  warnings,
- keeping a **status history** so a proficiency assessed in more than one part
  (e.g. developing → achieved) is preserved.

## Standing principle

The **PAD (Practice Assessment Document) / OAR remains the official signed
record.** This app is a personal study and organisation aid; its exports (e.g.
the placement timesheet) are for the student's own use and do not replace formal
sign-off.

## Integrations

None yet. (Reference document — informs other features rather than wiring to them.)
