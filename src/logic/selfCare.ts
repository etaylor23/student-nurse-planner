import type { Shift } from "../domain/types";

/**
 * Self-care catalogue + derivations — pure, so they're unit-tested and shared. The
 * feature is deliberately gentle: no scores, no streaks. Ticked items are stored as a
 * comma-separated list of keys on `SelfCareCheckin.items` (like `Medication.routes`).
 */

export interface SelfCareDimension {
  key: string;
  label: string;
}

export interface SelfCareItem {
  key: string;
  label: string;
  dimension: string; // → SelfCareDimension.key
}

export const SELF_CARE_DIMENSIONS: SelfCareDimension[] = [
  { key: "physical", label: "Physical basics" },
  { key: "emotional", label: "Emotional & social" },
  { key: "practical", label: "Practical" },
];

/** The check-in items, grouped by dimension. Framed as kind prompts, not obligations. */
export const SELF_CARE_ITEMS: SelfCareItem[] = [
  { key: "sleep", label: "Got some proper rest / sleep", dimension: "physical" },
  { key: "food", label: "Ate and drank well", dimension: "physical" },
  { key: "move", label: "Moved or rested my body", dimension: "physical" },
  { key: "connect", label: "Connected with someone", dimension: "emotional" },
  { key: "debrief", label: "Talked through a tough moment", dimension: "emotional" },
  { key: "money", label: "On top of money / admin", dimension: "practical" },
  { key: "balance", label: "Protected some time for me", dimension: "practical" },
];

/** Energy at or below this (on the 1–5 scale) gently surfaces support signposting. */
export const LOW_ENERGY_THRESHOLD = 2;

export interface SupportLink {
  label: string;
  detail: string;
  href?: string; // omitted where it's a "look this up" pointer, not a direct link
}

/** Real, safe UK signposting. Always available; emphasised when energy is low. */
export const SUPPORT_LINKS: SupportLink[] = [
  {
    label: "Samaritans",
    detail: "Free, any time, day or night — call 116 123",
    href: "tel:116123",
  },
  {
    label: "Shout",
    detail: "Free 24/7 crisis text line — text SHOUT to 85258",
    href: "sms:85258",
  },
  {
    label: "NHS Practitioner Health",
    detail: "Confidential NHS service for healthcare professionals & students",
    href: "https://www.practitionerhealth.nhs.uk/",
  },
  {
    label: "Your university wellbeing team",
    detail: "Most universities have a free, confidential service — find it on your student portal",
  },
];

/** Split the stored comma-separated item keys into an array (empty-safe). */
export function parseItems(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Join item keys back into the stored comma-separated string (deduped, order kept). */
export function joinItems(keys: string[]): string {
  return [...new Set(keys.map((k) => k.trim()).filter((k) => k !== ""))].join(",");
}

/**
 * A "hard shift" worth a gentle post-shift check-in nudge: a night, a long day, or a
 * long counted span (~11h+). Pure — drives the shift modal's wellbeing prompt.
 */
export function isHardShift(shift: Pick<Shift, "shiftType" | "netHours">): boolean {
  return shift.shiftType === "NIGHT" || shift.shiftType === "LONG_DAY" || shift.netHours >= 11;
}
