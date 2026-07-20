import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Placement, Shift, ShiftDraft } from "../../domain/types";
import { ShiftForm } from "./ShiftForm";
import { ShiftMedicationsTab } from "./shift/ShiftMedicationsTab";
import { ShiftSkillsTab } from "./shift/ShiftSkillsTab";
import { ShiftReflectionsTab } from "./shift/ShiftReflectionsTab";
import { ShiftEvidenceTab } from "./shift/ShiftEvidenceTab";

type NewShift = { date: string; startTime?: string; endTime?: string };

const TABS = [
  { key: "medications", label: "Medications" },
  { key: "skills", label: "Skills" },
  { key: "reflections", label: "Reflections" },
  { key: "evidence", label: "Competency evidence" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Selector for the elements the focus trap cycles through. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The shift editor as a near-full-width modal — the spine of the app. The core
 * shift fields (`ShiftForm`) sit locked at the top with the header actions
 * (Mark worked · Make a copy · Delete); the capture flow lives in inline tabs
 * (Medications · Skills · Reflections · Competency evidence) so a student never
 * leaves the shift they're working on.
 *
 * URL-driven from `PlannerPage` (`/planner/:shiftId` edit, `/planner/new` create);
 * Esc / backdrop / close all navigate back to `/planner`. Full-screen on mobile.
 *
 * A11y: `role="dialog"` + `aria-modal`, a focus trap, focus restore on close,
 * body scroll-lock, and Esc-to-close.
 */
export function ShiftModal({
  mode,
  shift,
  locked,
  placements,
  prefill,
  lastPlacementId,
  saved,
  onSubmit,
  onCancel,
  onDelete,
  onCopy,
  onMarkWorked,
  onUnlock,
  onClose,
}: {
  mode: "new" | "edit";
  shift: Shift | null;
  locked: boolean;
  placements: Placement[];
  prefill?: NewShift | null;
  lastPlacementId?: string;
  /** Bumped by the parent after a successful in-place save → shows a "Saved" flash. */
  saved: number;
  onSubmit: (draft: ShiftDraft) => void | Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onMarkWorked: () => void;
  onUnlock: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabKey>("medications");
  const [flash, setFlash] = useState(false);

  // Esc closes; Tab is trapped inside the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Scroll-lock the page behind the modal, and restore focus to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the panel so the trap + Esc work immediately, without stealing focus
    // from an autofocused field inside the form.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Show a brief "Saved" confirmation whenever the parent bumps `saved`.
  useEffect(() => {
    if (saved === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1800);
    return () => window.clearTimeout(t);
  }, [saved]);

  // Reset the tab scroll to the top when switching tabs, so the panel always
  // opens at its start (the captured list) rather than mid-scroll.
  const selectTab = (key: TabKey) => {
    setTab(key);
    tabScrollRef.current?.scrollTo({ top: 0 });
  };

  const title = mode === "edit" ? (locked ? "Locked shift" : "Edit shift") : "New shift";
  const subtitle =
    mode === "edit"
      ? locked
        ? "Counts toward your hours — unlock to make changes"
        : "The shift, and everything you captured on it"
      : "Fill in the details, then save to start capturing against it";

  const tabPanel: ReactNode = shift ? (
    tab === "medications" ? (
      <ShiftMedicationsTab shift={shift} />
    ) : tab === "skills" ? (
      <ShiftSkillsTab shift={shift} />
    ) : tab === "reflections" ? (
      <ShiftReflectionsTab shift={shift} />
    ) : (
      <ShiftEvidenceTab shift={shift} />
    )
  ) : null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex sm:items-center sm:justify-center sm:p-6">
      <button
        type="button"
        aria-label="Close shift editor"
        onClick={onClose}
        className="pm-modal-backdrop absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="pm-modal-panel relative z-10 flex h-full w-full flex-col bg-white shadow-2xl outline-none sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl"
      >
        {/* Header — title + core actions + close, always visible. */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/70 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {flash && (
              <span className="hidden items-center gap-1 text-xs font-medium text-emerald-600 sm:inline-flex">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
                Saved
              </span>
            )}
            {mode === "edit" && !locked && (
              <div className="hidden items-center gap-3 sm:flex">
                <button
                  type="button"
                  onClick={onMarkWorked}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Mark worked
                </button>
                <button
                  type="button"
                  onClick={onCopy}
                  title="Duplicate this shift — then drag the copy to another day"
                  className="text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Make a copy
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  title="Delete (Backspace)"
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Delete
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Locked core — the shift fields. Scrolls internally if it outgrows its
            share of the modal, so the tab bar + tab content stay reachable. */}
        <div className="shrink-0 overflow-y-auto border-b border-slate-200/70 px-5 py-5 sm:max-h-[46vh] sm:px-6">
          {/* Mobile-only action row (the header hides them under sm). */}
          {mode === "edit" && !locked && (
            <div className="mb-4 flex items-center gap-4 sm:hidden">
              <button
                type="button"
                onClick={onMarkWorked}
                className="text-xs font-medium text-emerald-600"
              >
                Mark worked
              </button>
              <button type="button" onClick={onCopy} className="text-xs font-medium text-slate-600">
                Make a copy
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="text-xs font-medium text-rose-600"
              >
                Delete
              </button>
            </div>
          )}
          <ShiftForm
            placements={placements}
            initial={shift ?? undefined}
            initialDate={shift ? undefined : prefill?.date}
            initialStartTime={shift ? undefined : prefill?.startTime}
            initialEndTime={shift ? undefined : prefill?.endTime}
            initialPlacementId={shift ? undefined : lastPlacementId}
            locked={locked}
            onSubmit={onSubmit}
            onCancel={onCancel}
            onUnlock={mode === "edit" ? onUnlock : undefined}
          />
        </div>

        {/* Capture tabs — only once the shift exists (a new shift has nothing to
            capture against until it's saved). */}
        {shift ? (
          <>
            <div className="shrink-0 border-b border-slate-200/70 px-5 sm:px-6">
              <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Shift capture">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => selectTab(t.key)}
                    aria-current={tab === t.key ? "page" : undefined}
                    className={
                      "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition " +
                      (tab === t.key
                        ? "border-primary-600 text-primary-700"
                        : "border-transparent text-slate-500 hover:text-slate-700")
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
            <div ref={tabScrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-6">
              {/* The existing per-shift components already carry their own heading;
                  the leading border/margin is trimmed by a negative top here. */}
              <div className="-mt-1">{tabPanel}</div>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
              Save this shift to start logging medications, skills, reflections and competency
              evidence against it — right here, without leaving.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
