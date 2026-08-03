import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import { pillBase, pillPrimary } from "./ui";

/**
 * Brand-styled trigger for the Sentry user-feedback dialog (screenshots on).
 * Lives in the app header, signed-in only. We attach Sentry's dialog to our own
 * button (feedbackIntegration is configured with autoInject: false) so the look
 * matches the app rather than Sentry's default floating button.
 *
 * On first load in a session it plays a one-time attention pulse so it can't be
 * missed — gated behind prefers-reduced-motion.
 *
 * Shares the header pill geometry with Photo and Synced (spec-home-redesign.md decision
 * 13); only the tone differs, which is what marks it as the one worth pressing.
 */
export function FeedbackButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [attention, setAttention] = useState(false);

  // Wire our button to the Sentry feedback dialog.
  useEffect(() => {
    const feedback = Sentry.getFeedback();
    if (!feedback || !ref.current) return;
    const detach = feedback.attachTo(ref.current);
    return () => {
      try {
        detach?.();
      } catch {
        /* integration already torn down — nothing to do */
      }
    };
  }, []);

  // One-time, motion-safe attention pulse the first time it's shown this session.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || sessionStorage.getItem("pm-feedback-seen")) return;
    sessionStorage.setItem("pm-feedback-seen", "1");
    setAttention(true);
    const t = window.setTimeout(() => setAttention(false), 4200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Send feedback"
      className={`relative ${pillBase} ${pillPrimary} active:scale-[.98] ${attention ? "pm-attention" : ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M7.5 8.5h9M7.5 12h5.5M21 11.5a8 8 0 0 1-11.2 7.3L4 20.5l1.7-3.7A8 8 0 1 1 21 11.5Z" />
      </svg>
      <span>Feedback</span>
    </button>
  );
}
