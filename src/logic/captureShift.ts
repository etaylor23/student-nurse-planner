import { SHIFT_TYPE_LABEL } from "../domain/types";
import type { Shift } from "../domain/types";

/**
 * Resolve which shift a photographed page belongs to (spec-note-capture.md P8/P9).
 *
 * **The app does this, not the model.** The vision model returns the date EXACTLY as written
 * (`"22/7"`) and nothing more, because it demonstrably invents the parts it cannot see: asked
 * for a normalised date it returned `2024-07-22` for a page that said only `22/7`, wrong by
 * two years. Given a page with no year, an invented one is worse than none — it would silently
 * attach a page of notes to a two-year-old shift.
 *
 * So the model reports, and this matches. Day/month is compared across **all years**, because
 * a student may be back-filling from last year, and candidates are ranked most-recent-first
 * because recent is likelier. One recommendation, alternates visible, never silent (P9).
 */

export type ShiftMatchConfidence = "DATE_MATCH" | "FALLBACK_RECENT" | "NONE";

export interface ShiftCandidate {
  shift: Shift;
  /** Why this is offered — the UI states a fallback plainly rather than implying a match. */
  confidence: ShiftMatchConfidence;
}

export interface ShiftResolution {
  /** Best guess, pre-selected in the UI. `undefined` when the student has no shifts at all. */
  suggested?: ShiftCandidate;
  /** Suggested first, then the alternates — what the picker lists. */
  candidates: ShiftCandidate[];
  /** True when no date could be read or matched, so the offer is "most recent" not "correct". */
  isFallback: boolean;
}

/**
 * Pull a day and month out of a date as a student actually writes one.
 *
 * Handles `22/7`, `22-07`, `22.7.26`, `22 July`, `Tues 22nd July`. Returns the year only when
 * the page actually stated one — inferring it is the caller's job, from real shifts.
 */
export function parseWrittenDate(
  raw: string | null | undefined,
): { day: number; month: number; year?: number } | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  // "22 July", "22nd July 2026", "Tues 22 Jul"
  const named = s.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,})\.?\s*(\d{2,4})?/);
  if (named) {
    const monthIdx = MONTHS.findIndex((m) => m.startsWith(named[2].slice(0, 3)));
    if (monthIdx >= 0) {
      return {
        day: Number(named[1]),
        month: monthIdx + 1,
        ...(named[3] ? { year: normaliseYear(Number(named[3])) } : {}),
      };
    }
  }

  // "22/7", "22-07-26", "22.7.2026" — day-first, which is how it's written in the UK.
  const numeric = s.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month, ...(numeric[3] ? { year: normaliseYear(Number(numeric[3])) } : {}) };
    }
  }
  return null;
}

/** `26` → 2026. Two-digit years are this century; a student isn't logging 1926. */
function normaliseYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Match a written date against the student's shifts.
 *
 * `shifts` may be in any order; `Shift.date` is the local ISO date the shift STARTS on, which
 * is what a page of notes from that shift would be dated.
 */
export function resolveShift(
  pageDateRaw: string | null | undefined,
  shifts: Shift[],
): ShiftResolution {
  const byRecency = [...shifts].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (byRecency.length === 0) return { candidates: [], isFallback: false };

  const parsed = parseWrittenDate(pageDateRaw);
  if (parsed) {
    const matches = byRecency.filter((sh) => {
      const [y, m, d] = sh.date.split("-").map(Number);
      if (d !== parsed.day || m !== parsed.month) return false;
      // A year on the page narrows it; without one, EVERY year is a candidate — a student
      // back-filling last year's notes is exactly the case that needs this.
      return parsed.year === undefined || y === parsed.year;
    });
    if (matches.length > 0) {
      const candidates = matches.map((shift) => ({
        shift,
        confidence: "DATE_MATCH" as const,
      }));
      return { suggested: candidates[0], candidates, isFallback: false };
    }
  }

  // No date, or a date matching no shift: offer the most recent, and say that's what it is.
  const candidates = byRecency.map((shift, i) => ({
    shift,
    confidence: (i === 0 ? "FALLBACK_RECENT" : "NONE") as ShiftMatchConfidence,
  }));
  return { suggested: candidates[0], candidates, isFallback: true };
}

/**
 * "Tue 22 Jul · Long day" — short enough for a chip, unambiguous about which shift it means.
 *
 * The type comes from `SHIFT_TYPE_LABEL`, not from lower-casing the enum: that produced
 * "long_day", with the underscore showing, and it was a second set of shift-type names competing
 * with the one the form, the calendar and the .ics feed all share.
 */
export function formatShiftLabel(shift: Shift): string {
  const d = new Date(`${shift.date}T00:00:00`);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${SHIFT_TYPE_LABEL[shift.shiftType]}`;
}
