import { useSyncExternalStore } from "react";

/**
 * The reflection lock — a **device-level** privacy gate for the PoC (the spec's
 * "lockable (PIN/biometric)"). Deliberately simple: an optional numeric PIN kept in
 * this browser's `localStorage`, and a session "unlocked" flag held in memory. It's a
 * shoulder-surf / shared-laptop convenience gate, NOT real security — reflections
 * stay in this browser and the PAD remains the official signed record. Real
 * per-student privacy (encrypted, private-per-user) arrives with the future login the
 * architecture is built toward.
 *
 * Kept out of `logic/` because it touches `localStorage` and in-memory state (not a
 * pure derivation); exports only functions/a hook, so no react-refresh boundary.
 */

const PIN_KEY = "snp.reflection.pin";

/** Set once the correct PIN is entered — held for the SPA session (survives navigation). */
let sessionUnlocked = false;
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readPin(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(PIN_KEY) : null;
  } catch {
    return null;
  }
}

/** Is a device PIN configured? */
export function reflectionPinSet(): boolean {
  return readPin() !== null;
}

/** Are locked reflections currently readable this session? */
export function reflectionsUnlocked(): boolean {
  return sessionUnlocked;
}

/**
 * Reveal locked reflections for this session WITHOUT a PIN. Only meaningful when no
 * PIN is set — then the lock is a soft "hidden until you tap reveal" gate. A no-op
 * once a PIN exists (callers must go through `tryUnlockReflections`).
 */
export function revealReflections(): void {
  if (reflectionPinSet()) return;
  sessionUnlocked = true;
  emit();
}

/** Set (or change) the device PIN; setting it also unlocks for this session. */
export function setReflectionPin(pin: string): void {
  try {
    localStorage.setItem(PIN_KEY, pin);
  } catch {
    /* storage unavailable — lock silently degrades to "no PIN" */
  }
  sessionUnlocked = true;
  emit();
}

/** Remove the device PIN entirely (nothing is locked afterwards). */
export function clearReflectionPin(): void {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
  sessionUnlocked = true;
  emit();
}

/** Try to unlock with a PIN; returns whether it matched. */
export function tryUnlockReflections(pin: string): boolean {
  const stored = readPin();
  if (stored !== null && stored === pin) {
    sessionUnlocked = true;
    emit();
    return true;
  }
  return false;
}

/** Re-lock for this session (e.g. a "Lock now" control). */
export function relockReflections(): void {
  sessionUnlocked = false;
  emit();
}

/**
 * Reactive view of the lock state for components. `pinSet` = a PIN is configured;
 * `unlocked` = locked content is readable right now.
 */
export function useReflectionLock() {
  const pinSet = useSyncExternalStore(subscribe, reflectionPinSet);
  const unlocked = useSyncExternalStore(subscribe, reflectionsUnlocked);
  return {
    pinSet,
    unlocked,
    setPin: setReflectionPin,
    clearPin: clearReflectionPin,
    tryUnlock: tryUnlockReflections,
    reveal: revealReflections,
    relock: relockReflections,
  };
}
