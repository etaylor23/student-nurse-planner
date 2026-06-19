/**
 * Medication-list filters expressed as a shareable, path-based URL (no query
 * strings): `/medications/filter/<key>/<value>/<key>/<value>…`. Keys are `q`,
 * `class`, `system`, `condition`; values are URL-encoded (so free-text search with
 * spaces/slashes is safe). Pure + round-trippable so it's unit-testable.
 */
export interface MedFilters {
  q: string;
  drugClass: string;
  bodySystem: string;
  condition: string;
}

const EMPTY: MedFilters = { q: "", drugClass: "", bodySystem: "", condition: "" };

const KEY_TO_FIELD: Record<string, keyof MedFilters> = {
  q: "q",
  class: "drugClass",
  system: "bodySystem",
  condition: "condition",
};
// Path order kept stable so the same filters always produce the same URL.
const FIELD_ORDER: { field: keyof MedFilters; key: string }[] = [
  { field: "q", key: "q" },
  { field: "drugClass", key: "class" },
  { field: "bodySystem", key: "system" },
  { field: "condition", key: "condition" },
];

/** Parse the `filter/*` splat ("class/Antibiotic/q/amox") into filter values. */
export function parseMedFilters(splat?: string): MedFilters {
  const out: MedFilters = { ...EMPTY };
  if (!splat) return out;
  const parts = splat.split("/").filter(Boolean);
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const field = KEY_TO_FIELD[parts[i]];
    if (field) out[field] = decodeURIComponent(parts[i + 1]);
  }
  return out;
}

/** Build the path for a filter state — `/medications` when nothing is set. */
export function buildMedFilterPath(f: MedFilters): string {
  const segs: string[] = [];
  for (const { field, key } of FIELD_ORDER) {
    const v = f[field].trim();
    if (v) segs.push(key, encodeURIComponent(v));
  }
  return segs.length ? `/medications/filter/${segs.join("/")}` : "/medications";
}

export const isFiltered = (f: MedFilters): boolean =>
  !!(f.q || f.drugClass || f.bodySystem || f.condition);
