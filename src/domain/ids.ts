/** Stable, collision-resistant id. Works in browsers and Node 19+. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for very old runtimes.
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}
