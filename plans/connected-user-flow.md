# Investigation — Connected user flow & platform cohesiveness

**Status:** Investigated → planned (2026-07-20) · Triggered by the first-run
example-flow review in [2026-07-20-home-example-flow.md](2026-07-20-home-example-flow.md) ·
**Resulting plan:** [2026-07-20-elite-user-flow.md](2026-07-20-elite-user-flow.md)

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

## Decisions & ideas (2026-07-20 grill)

**Reframe from the grill:** the connective plumbing is already ~80% built (see "current
state" above). The elite move is to make it *felt everywhere* and wire the last gaps —
**not** to rebuild.

### North star

Turn the scattered, on-paper, out-of-order reality of placement into one connected,
signposted journey: capturing a note anywhere is easy, consistent and guided, and **every
note visibly counts toward NMC registration**.

### Locked decisions

| Branch | Decision |
|---|---|
| Elite lens | Blend: **amplify capture** + **signpost into a mindmap**, leveraging existing plumbing |
| Capture model | **Consistent per-feature capture + richer guided prompts.** Universal quick-capture **deferred** |
| Signposts | **All three:** inline contextual · animated mindmap · dynamic next-step nudges |
| Inline scope | **Surface the (already-wired) evidence triad pervasively** — capture-moment, list views, a persistent shift view; bidirectional |
| Mindmap data | **Illustrative concept first, live later** |
| Mindmap placement | **Onboarding band** — full-width between hero and dashboard, shown with the getting-started tour |
| Journey signposts | **Dynamic next-step nudges** (not a static ribbon) |
| Phasing | **Substance first, then show** |
| Success | **Comprehension + evidence density (behavioural) + connective completeness (coverage)** |

### Ideas bank (concrete)

**Capture (amplify note-taking):**
- One shared capture component/pattern reused across clinical skills, reflection and
  medications so they feel like one system.
- Standardise the guided templates: Gibbs (reflection), step-lists (skills), calc drills (meds).
- *(Later)* universal quick-capture: jot anywhere → tag (skill / reflection / competency /
  shift) → routes into the right record. Matches the "capture haphazardly first, structure
  after" paper reality.

**Inline signposts (the mindmap, woven in context):**
- The **REFLECTION** and **SKILL** evidence pickers are **already wired** (SkillDetailPage /
  ReflectionDetailPage "Link to a proficiency"; ProficiencyDetailPage handles all four
  types). The gap is **pervasiveness** — surface these links beyond the detail pages.
- On a capture: *"Evidences proficiency Y · on shift Z"* (links both ways).
- On a competency: *"Evidenced by N items across M shifts"* → list, each linking to source.
- On a shift: *"What this shift gave you"* — promote `ShiftDebrief`'s model into a
  persistent shift view (not just the debrief moment).
- One shared "link to a competency / shift" affordance across features.

**Animated mindmap (Home):**
- Illustrative animation — *a shift blooms into skills → competencies → hours → reflection*.
- Onboarding band, full-width between hero and dashboard, shown while the tour is active.
- Later: morph into the user's live graph.

**Next-step nudges:**
- Context-aware prompts that advance the flow: worked a shift → capture; captured → tag to
  a competency; evidence added → check your gaps.
- State-derived from existing hooks; placed where relevant; subtle + dismissible.

### Guardrails

- **Over-signposting** → keep signposts subtle and dismissible; clarity, not noise.
- **Home density** → the mindmap lives only in the onboarding zone (with the tour).
- **Evidence-link UX** must be genuinely low-friction — make-or-break for the density metric.
- **No schema/backend change expected** — surfacing rides existing `EvidenceLink` storage;
  self-owned records → no new authz.

### Definition of done

- **Comprehension:** a student can articulate *"when I log X, it also does Y and Z."*
- **Evidence density (behavioural):** share of captures linked to a competency climbs;
  reflections/skills actually evidence proficiencies (the wiring exists; the gap is
  discoverability + friction at the capture moment).
- **Connective completeness (coverage):** every capture type can evidence competencies ·
  every record shows connections both ways · every relevant screen has a next-step · the
  mindmap ships.

## Related

- [2026-07-20-elite-user-flow.md](2026-07-20-elite-user-flow.md) — the phased plan from these decisions
- [2026-07-20-home-example-flow.md](2026-07-20-home-example-flow.md) — the review that
  triggered this
- [spec-home.md](../spec/spec-home.md) — "connective tissue"
- [spec-architecture.md](../spec/spec-architecture.md) — data reuse / cross-surfacing
