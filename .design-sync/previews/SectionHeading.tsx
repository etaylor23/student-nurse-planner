import {
  CaptureFlowDiagram,
  LogList,
  MetricTile,
  NudgeList,
  Panel,
  SectionHeading,
  btnGhostSm,
  btnPrimary,
  card,
} from "student-nurse-planner";

/**
 * The three sizes, stacked as they appear on a page: one `page` h1, `section`
 * headings for the chapters under it, `panel` for a single widget.
 */
export function Sizes() {
  return (
    <div className="space-y-6">
      <div className={card}>
        <SectionHeading
          eyebrow="Today"
          title="Hi, Ellis"
          subtitle="Your day at a glance — pick up where you left off, and capture as you go."
          size="page"
        />
      </div>
      <div className={card}>
        <SectionHeading
          eyebrow="Your progress"
          eyebrowTone="secondary"
          title="You're in part 1 of 3"
          subtitle="Every shift you capture builds your hours, competency evidence and skills record — all heading for the NMC register."
        />
      </div>
      <div className={card}>
        <SectionHeading
          eyebrow="Your record"
          title="Activity"
          subtitle="Your most recent captures"
          size="panel"
        />
      </div>
    </div>
  );
}

/**
 * `eyebrowTone` picks the ramp: emerald for what's happening now, NHS blue for the
 * long arc toward registration.
 */
export function EyebrowTones() {
  return (
    <div className="space-y-6">
      <div className={card}>
        <SectionHeading eyebrow="How PlaceMate works" title="Capture once — feed everything" />
      </div>
      <div className={card}>
        <SectionHeading
          eyebrow="Toward registration"
          eyebrowTone="secondary"
          title="You're in part 2 of 3"
        />
      </div>
    </div>
  );
}

/** The action slot sits on the right; `align` decides how it lines up with the title. */
export function WithAction() {
  return (
    <div className="space-y-6">
      <div className={card}>
        <SectionHeading
          eyebrow="Your progress"
          eyebrowTone="secondary"
          title="You're in part 1 of 3"
          subtitle="Hours, evidence and skills, all heading for the register."
          action={
            <a href="#ready" className={btnGhostSm}>
              6 ready for your assessor
            </a>
          }
        />
      </div>
      <div className={card}>
        <SectionHeading
          eyebrow="How PlaceMate works"
          title="Capture once — feed everything"
          subtitle="Log something once on a shift and it flows to everything else."
          align="start"
          action={<button className={btnGhostSm}>Hide</button>}
        />
      </div>
    </div>
  );
}

const HOURS_NODE = {
  key: "hours",
  label: "Practice hours",
  sub: "5.5 / 2,300 h",
  desc: "Hours counting toward your 2,300.",
  href: "#hours",
  dot: "var(--color-primary-500)",
};

const FLOW_NODES = [
  {
    key: "skills",
    label: "Clinical skills",
    sub: "6 tracked",
    desc: "Your growing clinical-skills record.",
    href: "#skills",
    dot: "var(--color-primary-600)",
  },
  {
    key: "competencies",
    label: "NMC competencies",
    sub: "6 evidenced",
    desc: "Evidence building toward the NMC proficiencies.",
    href: "#competencies",
    dot: "var(--color-secondary-600)",
  },
  HOURS_NODE,
  {
    key: "reflections",
    label: "Reflections",
    sub: "0 written",
    desc: "Turning shifts into learning.",
    href: "#reflections",
    dot: "var(--color-accent-400)",
  },
];

const LOG = [
  [
    "1",
    "2026-07-22T15:14:00.000Z",
    "MED_LOGGED",
    "Observed it on Thu 23 Jul · 13:30–19:00",
    "Abacavir/lamivudine/zidovudine",
  ],
  [
    "2",
    "2026-07-22T15:14:00.000Z",
    "EVIDENCE_LINKED",
    "Linked a clinical skill as evidence for B2.4",
    "B2.4",
  ],
  ["3", "2026-07-22T15:13:00.000Z", "PROFICIENCY_SIGNED_OFF", "B2.4 signed off", "B2.4"],
  [
    "4",
    "2026-07-22T15:12:00.000Z",
    "SKILL_STAGE_CHANGED",
    "Skill stage moved to Performed under supervision",
    "Venepuncture and cannulation",
  ],
].map(([id, createdAt, action, summary, entityLabel]) => ({
  id,
  userId: "u1",
  createdAt,
  entityType: "SHIFT",
  entityId: `e-${id}`,
  entityLabel,
  action,
  summary,
}));

/**
 * The whole of Home, composed from nothing but this design system — the shape
 * `spec-home-redesign.md` specifies. Four chapters in a fixed order, each opened by
 * one of these headings, so the page reads as a story (today → progress → how it
 * works → your record) instead of a grid of unrelated cards.
 */
export function HomeChapters() {
  return (
    <div className="space-y-6">
      {/* 1 · TODAY — the greeting and the one next action. */}
      <section className={card} aria-label="Today">
        <SectionHeading
          eyebrow="Today"
          title="Hi, Ellis"
          subtitle="Your day at a glance — pick up where you left off, and capture as you go."
          size="page"
          align="center"
          gap="lg"
          action={
            <div className="flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 sm:min-w-[19rem]">
              <span className="text-xs font-medium text-slate-500">Next shift</span>
              <p className="mt-1 text-sm font-medium text-ink">Tomorrow, Tue 4 Aug</p>
              <p className="text-xs text-slate-400">Ward 9 — Acute Medical · 07:30–19:30</p>
              <a href="#planner" className={`${btnPrimary} mt-3 self-start`}>
                Open in planner
              </a>
            </div>
          }
        />
      </section>

      {/* One nudge visible, the queue behind a toggle. */}
      <NudgeList
        collapseAfter={1}
        max={3}
        nudges={[
          {
            id: "n1",
            tone: "primary",
            message: "Add your first placement — your hours, shifts and evidence all hang off it.",
            cta: "Add a placement",
            href: "#placements",
          },
          {
            id: "n2",
            tone: "info",
            message: "Turn a shift into learning with your first reflection.",
            cta: "New reflection",
            href: "#reflections",
          },
        ]}
      />

      {/* 2 · YOUR PROGRESS — the one progress story on the page. */}
      <section className={card} aria-label="Your progress">
        <SectionHeading
          eyebrow="Your progress"
          eyebrowTone="secondary"
          title="You're in part 1 of 3"
          subtitle="Every shift you capture builds your hours, competency evidence and skills record — all heading for the NMC register."
          action={
            <a href="#ready" className={btnGhostSm}>
              6 competencies ready to take to your assessor →
            </a>
          }
        />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricTile
            label="Practice hours"
            value="5.5 / 2,300 h"
            pct={0}
            caption="0% of the way there · ≈ 418 shifts to go"
            to="#hours"
          />
          <MetricTile
            label="NMC competencies"
            value="0 / 219 achieved"
            pct={0}
            caption="6 with evidence gathered"
            to="#competencies"
          />
          <MetricTile
            label="Clinical skills"
            value="6 / 84 signed off"
            pct={7}
            caption="a permanent record"
            to="#skills"
          />
        </div>
      </section>

      {/* 3 · HOW PLACEMATE WORKS — the mindmap is the centrepiece, not a sibling card. */}
      <section
        className="min-w-0 rounded-2xl bg-gradient-to-br from-primary-50/70 to-secondary-50/40 p-6 ring-1 ring-primary-100"
        aria-label="How PlaceMate works"
      >
        <SectionHeading
          eyebrow="How PlaceMate works"
          title="Capture once — feed everything"
          subtitle="Log something once on a shift and it flows to your skills, competency evidence, hours and reflections — all heading toward registration."
          align="start"
          action={<button className={btnGhostSm}>Hide</button>}
        />
        <div className="mt-5">
          <CaptureFlowDiagram
            nodes={FLOW_NODES}
            hub={{ label: "A shift", desc: "Every shift you work on placement.", href: "#planner" }}
            destination={{
              label: "Registration",
              sub: "your PAD",
              desc: "The NMC register — where it's all heading.",
              href: "#competencies",
            }}
            compact
          />
        </div>
      </section>

      {/* 4 · YOUR RECORD — a digest, with the full log one click away. */}
      <Panel
        eyebrow="Your record"
        title="Activity"
        hint="Your most recent captures"
        action={
          <a href="#audit" className={btnGhostSm}>
            See full audit log
          </a>
        }
      >
        <LogList items={LOG} showLabel />
      </Panel>
    </div>
  );
}
