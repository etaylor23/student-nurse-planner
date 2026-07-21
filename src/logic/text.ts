/**
 * Capitalise the first letter of a string, leaving the rest verbatim (sentence
 * case, not title case). Idempotent; tolerant of leading whitespace and of strings
 * that don't start with a letter. Used to present the NMC proficiency statements —
 * which are lower-cased in the source — as readable sentences across the app.
 */
export function sentenceCase(text: string): string {
  return text.replace(/^(\s*)(\p{L})/u, (_m, ws: string, ch: string) => ws + ch.toUpperCase());
}
