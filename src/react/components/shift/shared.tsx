import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shared furniture for the shift modal's capture tabs (Medications · Skills ·
 * Reflections · Competency evidence). Each tab is a captured list + an inline
 * form whose save stays in the modal, so these keep the four consistent: the
 * same heading row and the same "golden-moment" confirmation after a capture.
 */

/** A transient confirmation message for an in-tab capture (auto-clears). */
export function useCaptureFlash() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback((msg: string) => {
    setMessage(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { message, flash };
}

/** The heading row shared by every capture tab: a label (with count) + an action slot. */
export function TabHeading({
  label,
  count,
  action,
}: {
  label: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
        {count ? ` · ${count}` : ""}
      </p>
      {action}
    </div>
  );
}

/** The green success line shown the moment something is captured against the shift. */
export function CaptureConfirmation({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path d="m5 13 4 4L19 7" />
      </svg>
      {message}
    </div>
  );
}

/** The emerald text button that opens a tab's inline form. */
export const addBtnCls = "text-xs font-medium text-emerald-600 hover:text-emerald-700";
