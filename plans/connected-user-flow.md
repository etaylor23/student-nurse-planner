# Investigation — Connected user flow & platform cohesiveness

**Status:** Open investigation (opened 2026-07-20) · Triggered by the first-run
example-flow review in [2026-07-20-home-example-flow.md](2026-07-20-home-example-flow.md)

## Why this exists

PlaceMate's value isn't any single tracker — it's that it's **one place where
capturing something once feeds everywhere it's needed**: a thing you log on a shift
should count toward your practice hours, build your clinical-skills record, contribute
competency evidence, and be there to reflect on — all pointing at one destination, **NMC
registration**.

The risk is that the app instead reads as a *bundle of separate mini-tools* ("a shifts
app + a meds app + a revision app + a self-care app") — a menu of features rather than
one coherent journey. This investigation asks: **does the platform hang together as a
connected flow, or does it silo?**

The trigger was our own onboarding: the example-flow review found that even the tour
presents features as a **checklist of discrete tasks**, not a connected flow — a small
symptom of the broader question.

## The thesis to test

> **Capture once → it counts everywhere → toward registration.**

A single act on placement (e.g. logging a clinical skill during a shift) should visibly:
(a) count toward practice hours, (b) build the clinical-skills record, (c) contribute
competency evidence, and (d) be available to reflect on. If students *perceive* these as
connected, the platform is cohesive. If each lives in its own silo, it isn't.

## Current state — the connective tissue that already exists

- **Home is explicitly "connective tissue"** ([spec-home.md](../spec/spec-home.md)) —
  it surfaces next shift, hours pace, skills in progress, top competency gaps and recent
  activity on one screen.
- **`prefillShiftId`** pins medication logs / skill updates to a shift — the universal
  "shift join".
- **TopGaps** surfaces due NMC proficiencies on both Home and the Hours log.
- **ActivityLog** is a unified, cross-entity history.
- **Evidence links** connect proficiencies ↔ evidence; **reflections ↔ tags**.

## Where it may silo (to investigate)

1. **Medications, revision and self-care** read as standalone tools with weak links back
   to the placement spine.
2. **Capture has no "so what?" feedback** — logging a skill doesn't visibly show its
   downstream effect (hours / competency / evidence). The value is invisible at the
   moment it's created.
3. **The destination is rarely present at capture time** — registration and the PAD
   (the official record this feeds) seldom show up where the work happens.
4. **Navigation is a flat menu of features** ([nav.ts](../src/react/nav.ts) sections),
   not a journey.
5. **Cross-links are mostly one-directional** (Home → feature); there are few
   feature → feature links and almost no "here's what this contributed" backlinks.

## Open questions

1. Do students understand that logging on a shift feeds multiple records? (comprehension)
2. At the moment of capture, do/should we surface the payoff ("+X toward hours / this now
   evidences proficiency Y")? (feedback loops)
3. Is there a single **spine** (the shift / placement) everything hangs off — and is it
   visible as one?
4. Which surfaces are genuinely part of the journey vs adjacent aids (revision,
   self-care)? Should they be framed differently rather than as peers in the menu?
5. Does the information architecture fight the narrative of one journey?

## Proposed workstreams / experiments

- **Cross-link audit.** Map every entity→entity reference in the data model and every UI
  deep-link into a graph; find the missing edges. (Read-only; produces the evidence base.)
- **"This counts" feedback.** After a capture, surface what it contributed (hours,
  competency evidence, skills record). Small, high-signal, directly tests the thesis.
- **Shift-as-spine.** From a shift, see/log everything that happened on it (meds, skills,
  reflection) and what it counted toward — making the join explicit.
- **Onboarding shows connection, not a checklist.** Per the example-flow review: render
  the core as a *loop*, add a purpose line, and hint the connection ("capture once — it
  counts toward hours, skills and competencies").
- **IA experiment.** Try grouping nav by the journey (before / during / after a shift;
  evidence toward registration) instead of by feature type.

## How we'll know it's cohesive (success criteria)

- A student can articulate: "when I log X, it also does Y and Z."
- Capture surfaces its downstream contribution at the moment it happens.
- There's a visible spine (shift / placement) tying activity together.
- Onboarding communicates a connected flow **and a destination**, not a task list.

## Related

- [2026-07-20-home-example-flow.md](2026-07-20-home-example-flow.md) — the review that
  triggered this
- [spec-home.md](../spec/spec-home.md) — "connective tissue"
- [spec-architecture.md](../spec/spec-architecture.md) — data reuse / cross-surfacing
