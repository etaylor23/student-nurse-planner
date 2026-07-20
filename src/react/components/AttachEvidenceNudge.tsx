/**
 * A uniform, on-brand "attach this as evidence" prompt shown at the capture moment when a
 * skill or reflection isn't yet linked to any NMC proficiency. Replaces the easily-missed
 * grey "not linked yet" text so the path to the PAD reads as a real nudge — matching the
 * app's nudge visual language (see components/Nudge.tsx). The action stays the page's own
 * "Link to a proficiency" control, so this is message-only.
 */
export function AttachEvidenceNudge({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-primary-50/70 px-3.5 py-2.5 ring-1 ring-primary-100">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-primary-600"
        aria-hidden="true"
      >
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      </svg>
      <span className="text-sm text-slate-700">
        {message ??
          "Not linked to a proficiency yet — attach it as evidence to feed your PAD."}
      </span>
    </div>
  );
}
