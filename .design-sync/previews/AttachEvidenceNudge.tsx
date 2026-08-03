import { AttachEvidenceNudge, Panel, btnGhostSm } from "student-nurse-planner";

/** The default message — shown when a skill or reflection isn't yet linked. */
export function Default() {
  return <AttachEvidenceNudge />;
}

/** A caller-supplied message, for the same prompt in a different context. */
export function CustomMessage() {
  return (
    <div className="space-y-3">
      <AttachEvidenceNudge message="This medication log isn't attached to a proficiency yet." />
      <AttachEvidenceNudge message="Link this reflection to feed your PAD evidence." />
    </div>
  );
}

/**
 * In context — the prompt is message-only, so the action stays the page's own
 * "Link to a proficiency" control.
 */
export function InPanel() {
  return (
    <Panel
      title="Cannulation"
      hint="Logged on Ward 9 — Thu 18 Jun"
      action={<button className={btnGhostSm}>Link to a proficiency</button>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Second attempt supervised by Sam (RN). Felt much steadier than the first.
        </p>
        <AttachEvidenceNudge />
      </div>
    </Panel>
  );
}
