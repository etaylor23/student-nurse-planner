import { AllocateBar, card } from "student-nurse-planner";

const block = (status = "PARSED") => ({
  id: "b1",
  captureId: "cap-1",
  imageIndex: 0,
  rawText: "First time I led the handover.",
  text: "First time I led the handover.",
  kind: "REFLECTION",
  confidence: 0.9,
  bboxX0: 0,
  bboxY0: 0,
  bboxX1: 1,
  bboxY1: 0.2,
  rotationDeg: 0,
  status,
});

const ok = async () => ({ ok: true, label: "a reflection" });
const noop = async () => ({});

/** Wrapped in a card, the way it sits under a block in the review screen. */
const inCard = (children) => (
  <article className={`${card} !p-3`}>
    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Reflection</p>
    <p className="mt-1 text-sm leading-snug text-slate-700">
      First time I led the handover. Nervous but the structure helped — SBAR kept me on track.
    </p>
    {children}
  </article>
);

/** Ready to file: a destination is set, so the commit is offered. */
export function ReadyToFile() {
  return inCard(
    <AllocateBar
      block={block()}
      target="REFLECTION"
      tags={["handover", "communication"]}
      gibbs={{ DESCRIPTION: "Led the handover for the first time." }}
      onAllocate={ok}
      onUnallocate={noop}
    />,
  );
}

/**
 * Nothing routed this block. Filing refuses rather than quietly defaulting to
 * shift notes — that's how a reflection ends up buried in a shift.
 */
export function NoDestination() {
  return inCard(
    <AllocateBar
      block={block()}
      target=""
      tags={[]}
      onAllocate={ok}
      onUnallocate={noop}
    />,
  );
}

/**
 * Proficiency evidence with no confirmed code — the status and part index are
 * the student's judgement, so allocation waits rather than guessing.
 */
export function NeedsProficiency() {
  return inCard(
    <AllocateBar
      block={block()}
      target="PROFICIENCY_EVENT"
      tags={[]}
      onAllocate={ok}
      onUnallocate={noop}
    />,
  );
}

/** Already filed — the same control now offers the undo. */
export function Filed() {
  return inCard(
    <AllocateBar
      block={block("ALLOCATED")}
      target="REFLECTION"
      tags={["handover"]}
      onAllocate={ok}
      onUnallocate={noop}
    />,
  );
}
