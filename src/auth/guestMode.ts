// "Continue on this device only" — the guest flag. Guests use the local DexieRepository
// (spec-auth §2.2); it's the only uninvited entry and hosts "Load demo data".
const KEY = "snp.guestMode";

export function isGuest(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setGuestMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private-mode / storage disabled — treat as non-guest */
  }
}
