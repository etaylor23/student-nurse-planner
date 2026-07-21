/**
 * Device-local, in-progress form drafts (localStorage). Deliberately NOT domain data: a
 * draft never enters the repository, the outbox, or sync — it's crash/navigation insurance
 * for long forms (a Gibbs reflection is six free-text sections). Keys live under the
 * `pm:draft:` prefix so sign-out's "remove this device's data" wipes them (see AuthGate).
 */
const PREFIX = "pm:draft:";

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable / quota — a draft is best-effort */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
