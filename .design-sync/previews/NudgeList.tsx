import { NudgeList } from "student-nurse-planner";

/**
 * The three tones. `max` is raised to 3 here because the default cap is 2 —
 * see the Capped cell for the shipped default.
 */
export function AllTones() {
  return (
    <NudgeList
      max={3}
      nudges={[
        {
          id: "n1",
          tone: "primary",
          message: "You're on shift now — log what you did while it's fresh.",
          cta: "Open shift",
          href: "#shift",
        },
        {
          id: "n2",
          tone: "accent",
          message: "Three long days in a row. Worth a self-care check-in?",
          cta: "Check in",
          href: "#self-care",
        },
        {
          id: "n3",
          tone: "info",
          message: "2 reflections aren't linked to a proficiency yet.",
          cta: "Link them",
          href: "#reflections",
        },
      ]}
    />
  );
}

/** The common case — a single suggestion, not a wall of them. */
export function Single() {
  return (
    <NudgeList
      nudges={[
        {
          id: "n1",
          tone: "primary",
          message: "Your first placement has no shifts yet — add one to start counting hours.",
          cta: "Add a shift",
          href: "#shifts",
        },
      ]}
    />
  );
}

/**
 * `collapseAfter` turns the list into a queue — one suggestion visible, the rest
 * behind an "N more" toggle that starts closed. This is how a busy landing page
 * carries a full queue without ever looking like a to-do list.
 */
export function CollapsedQueue() {
  return (
    <NudgeList
      collapseAfter={1}
      max={4}
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
        {
          id: "n3",
          tone: "accent",
          message: "Three long days in a row. Worth a self-care check-in?",
          cta: "Check in",
          href: "#self-care",
        },
      ]}
    />
  );
}

/**
 * `demoteIds` sends a nudge to the back of the queue instead of hiding it — for when
 * another surface on the page is already saying the same thing. Here the placement
 * nudge is demoted, so the reflection one takes the visible slot.
 */
export function Demoted() {
  return (
    <NudgeList
      collapseAfter={1}
      max={4}
      demoteIds={["n1"]}
      nudges={[
        {
          id: "n1",
          tone: "primary",
          message: "Add your first placement — already step 1 of the first-steps checklist.",
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
  );
}

/** `max` caps how many show, so a busy week can't turn into a to-do list. */
export function Capped() {
  return (
    <NudgeList
      max={2}
      nudges={[
        {
          id: "n1",
          tone: "primary",
          message: "8 NMC proficiencies are due before this placement ends.",
          cta: "See gaps",
          href: "#gaps",
        },
        {
          id: "n2",
          tone: "info",
          message: "Your timesheet is ready to export for your practice assessor.",
          cta: "Export",
          href: "#timesheet",
        },
        {
          id: "n3",
          tone: "accent",
          message: "This one is capped out of view.",
          cta: "Hidden",
          href: "#hidden",
        },
      ]}
    />
  );
}
