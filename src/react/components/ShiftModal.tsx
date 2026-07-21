import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Placement, Shift, ShiftDraft } from "../../domain/types";
import { ShiftForm } from "./ShiftForm";
import { Tabs, type TabItem } from "./Tabs";
import { ShiftMedicationsTab } from "./shift/ShiftMedicationsTab";
import { ShiftSkillsTab } from "./shift/ShiftSkillsTab";
import { ShiftReflectionsTab } from "./shift/ShiftReflectionsTab";
import { ShiftEvidenceTab } from "./shift/ShiftEvidenceTab";
import { ShiftProgressBanner } from "./shift/ShiftProgressBanner";

type NewShift = { date: string; startTime?: string; endTime?: string };

/** Selector for the elements the focus trap cycles through. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The shift editor as a near-full-width modal — the spine of the app. It's a
 * URL-driven nested-route host: the shift's core fields are the first tab
 * (`/planner/:id`), and the capture flow lives in sibling tabs — Medications
 * (`/medications`), Skills (`/skills`), Reflections (`/reflection`), Competency
 * evidence (`/competencies`) — each deep-linkable and back-button friendly, so a
 * student never leaves the shift they're working on.
 *
 * The header (title · Mark worked · Make a copy · Delete · close) and the
 * mark-worked celebration band stay put across every tab. Full-screen on mobile.
 *
 * A11y: `role="dialog"` + `aria-modal`, a focus trap, focus restore on close,
 * body scroll-lock, and Esc-to-close.
 */
export function ShiftModal({
  mode,
  shift,
  locked,
  celebrate = false,
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
  /** True right after this shift was marked worked → show the celebratory band. */
  celebrate?: boolean;
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
  const location = useLocation();
  const [flash, setFlash] = useState(false);
  // The celebratory band shows once per mark-worked (the modal remounts on the
  // status change), then can be dismissed.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // The "Shift" tab's form reports unsaved edits here; only true while that tab is mounted.
  const [formDirty, setFormDirty] = useState(false);

  // Confirm before throwing away unsaved core-field edits. Returns true to proceed.
  const confirmDiscard = useCallback(
    () => !formDirty || window.confirm("Discard unsaved changes to this shift?"),
    [formDirty],
  );
  const guardedClose = useCallback(() => {
    if (confirmDiscard()) onClose();
  }, [confirmDiscard, onClose]);

  // Esc closes; Tab is trapped inside the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        guardedClose();
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
  }, [guardedClose]);

  // Scroll-lock the page behind the modal, and restore focus to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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

  const title = mode === "edit" ? (locked ? "Locked shift" : "Edit shift") : "New shift";
  const subtitle =
    mode === "edit"
      ? locked
        ? "Counts toward your hours — unlock to make changes"
        : "The shift, and everything you captured on it"
      : "Fill in the details, then save to start capturing against it";

  const base = shift ? `/planner/${shift.id}` : "";
  const tabItems: TabItem[] = [
    { to: base, label: "Shift", end: true },
    { to: `${base}/medications`, label: "Medications" },
    { to: `${base}/skills`, label: "Skills" },
    { to: `${base}/reflection`, label: "Reflections" },
    { to: `${base}/competencies`, label: "Competency evidence" },
  ];

  // The shift's core fields — the "Shift" tab (index route), and the whole body in
  // new mode (before there's anything to capture against).
  const shiftFormEl = (
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
      onDirtyChange={setFormDirty}
      onUnlock={mode === "edit" ? onUnlock : undefined}
    />
  );

  // Guard tab switches: capture the click BEFORE the NavLink navigates, so unsaved
  // core-field edits aren't silently unmounted. Skips clicks on the already-active tab.
  const onTabsClickCapture = (e: React.MouseEvent) => {
    if (!formDirty) return;
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (new URL(anchor.href).pathname === location.pathname) return; // same tab — no-op
    if (window.confirm("Discard unsaved changes to this shift?")) {
      setFormDirty(false);
    } else {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex sm:items-center sm:justify-center sm:p-6">
      <button
        type="button"
        aria-label="Close shift editor"
        onClick={guardedClose}
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
        {/* Header — title + core actions + close, always visible across tabs. */}
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
              <div className="flex items-center gap-3">
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
                  className="hidden text-xs font-medium text-slate-600 hover:text-slate-800 sm:inline"
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
              onClick={guardedClose}
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

        {/* Celebratory progress the instant a shift is marked worked — a band that
            stays visible whatever tab you're on. */}
        {celebrate && shift && !bannerDismissed && (
          <div className="shrink-0 border-b border-slate-200/70 px-5 pt-4 sm:px-6">
            <ShiftProgressBanner shift={shift} onDismiss={() => setBannerDismissed(true)} />
          </div>
        )}

        {/* Tab bar — only once the shift exists (a new shift has nothing to capture
            against until it's saved). */}
        {shift && (
          <div className="shrink-0 px-5 sm:px-6" onClickCapture={onTabsClickCapture}>
            <Tabs items={tabItems} ariaLabel="Shift capture" />
          </div>
        )}

        {/* Single full-height scroll region — the active tab (or the new-shift
            form) gets the whole space. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {shift ? (
            <Routes>
              <Route index element={shiftFormEl} />
              <Route path="medications/*" element={<ShiftMedicationsTab shift={shift} />} />
              <Route path="skills/*" element={<ShiftSkillsTab shift={shift} />} />
              <Route path="reflection/*" element={<ShiftReflectionsTab shift={shift} />} />
              <Route path="competencies" element={<ShiftEvidenceTab shift={shift} />} />
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          ) : (
            shiftFormEl
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
