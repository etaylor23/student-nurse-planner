import type { RevisionTopic } from "../domain/types";
import { isoAddDays } from "./calendar";

/**
 * Spaced-repetition + weak-area resurfacing for revision topics — pure, explainable
 * rules (deliberately simpler than SM-2, so a student can see why a topic came back).
 * The scheduling/derivation lives here, not in the components, and is unit-tested.
 */

/**
 * Days until a topic is next due, by confidence (1..5). Low confidence resurfaces
 * sooner: 1→1 day, 2→2, 3→4, 4→8, 5→16 (roughly doubling).
 */
const INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

/** Clamp/round a value into the 1..5 confidence scale. */
export function clampConfidence(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** The next-due date (ISO) for a topic reviewed on `reviewedOnIso` at `confidence`. */
export function nextDueFrom(confidence: number, reviewedOnIso: string): string {
  return isoAddDays(reviewedOnIso, INTERVAL_DAYS[clampConfidence(confidence)]);
}

/**
 * Whether a topic should resurface: its next-due date is today or past, OR its
 * confidence is low (≤ 2), OR it's never been reviewed (no `nextDue`). Pure — pass
 * today's ISO date. (Mirrors the spec's "nextDue ≤ now OR confidence ≤ 2", plus the
 * sensible "never reviewed ⇒ due".)
 */
export function isTopicDue(
  topic: Pick<RevisionTopic, "confidence" | "nextDue">,
  todayIso: string,
): boolean {
  if (topic.confidence <= 2) return true;
  if (!topic.nextDue) return true;
  return topic.nextDue <= todayIso;
}

/** Topics to resurface — weakest first, then most overdue (never-reviewed sorts first). */
export function resurfaceTopics<T extends Pick<RevisionTopic, "confidence" | "nextDue">>(
  topics: T[],
  todayIso: string,
): T[] {
  return topics
    .filter((t) => isTopicDue(t, todayIso))
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence - b.confidence; // weakest first
      const an = a.nextDue ?? ""; // never-reviewed ("") sorts before any date
      const bn = b.nextDue ?? "";
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
}

/** Whole calendar days from `todayIso` to `dateIso` (negative = in the past). Pure. */
export function daysUntil(dateIso: string, todayIso: string): number {
  const a = new Date(`${todayIso}T00:00:00`).getTime();
  const b = new Date(`${dateIso}T00:00:00`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
