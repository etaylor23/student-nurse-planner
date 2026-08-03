import { CaptureFlowDiagram } from "student-nurse-planner";

const HUB = { label: "A shift", desc: "Every shift you work on placement.", href: "#planner" };

const REGISTRATION = {
  label: "Registration",
  sub: "your PAD",
  desc: "The NMC register — where it's all heading.",
  href: "#competencies",
};

const NODES = [
  {
    key: "skills",
    label: "Clinical skills",
    sub: "22 tracked",
    desc: "Your growing clinical-skills record.",
    href: "#skills",
    dot: "var(--color-primary-600)",
  },
  {
    key: "competencies",
    label: "NMC competencies",
    sub: "31 evidenced",
    desc: "Evidence building toward the NMC proficiencies.",
    href: "#competencies",
    dot: "var(--color-secondary-600)",
  },
  {
    key: "hours",
    label: "Practice hours",
    sub: "418 / 2,300 h",
    desc: "Hours counting toward your 2,300.",
    href: "#hours",
    dot: "var(--color-primary-500)",
  },
  {
    key: "reflections",
    label: "Reflections",
    sub: "6 written",
    desc: "Turning shifts into learning.",
    href: "#reflections",
    dot: "var(--color-accent-400)",
  },
];

const BAND =
  "rounded-2xl bg-gradient-to-br from-primary-50/70 to-secondary-50/40 p-6 ring-1 ring-primary-100";

/**
 * The four records a shift feeds, on the tinted band it lives on. Each node carries
 * the student's own live count, so the diagram explains the app and reports on it at
 * the same time.
 */
export function Default() {
  return (
    <div className={BAND}>
      <CaptureFlowDiagram nodes={NODES} hub={HUB} destination={REGISTRATION} />
    </div>
  );
}

/**
 * `compact` caps the height for the collapsed band — the state Home falls back to
 * once the first-steps checklist is done or hidden. The mindmap never disappears
 * entirely; it just gets quieter.
 */
export function Compact() {
  return (
    <div className={BAND}>
      <CaptureFlowDiagram nodes={NODES} hub={HUB} destination={REGISTRATION} compact />
    </div>
  );
}

/**
 * Day one, before anything has been captured. Zeroes are stated plainly — the flow
 * is still true, it just hasn't run yet.
 */
export function Empty() {
  return (
    <div className={BAND}>
      <CaptureFlowDiagram
        nodes={NODES.map((n) => ({ ...n, sub: n.key === "hours" ? "0 / 2,300 h" : "none yet" }))}
        hub={HUB}
        destination={REGISTRATION}
      />
    </div>
  );
}

/**
 * The row count isn't fixed — the set stays centred on the hub whichever nodes you
 * pass, and the viewBox grows for more than four.
 */
export function FewerNodes() {
  return (
    <div className={BAND}>
      <CaptureFlowDiagram nodes={NODES.slice(0, 2)} hub={HUB} destination={REGISTRATION} />
    </div>
  );
}
