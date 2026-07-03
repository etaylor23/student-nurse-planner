/**
 * Foreground web-notification helpers for the PoC. This is the "simulate a check-in"
 * slice only — there's no service worker, scheduling or push yet, so notifications can
 * only fire while a tab is open and on demand. The fuller vision (a self-care daily
 * reminder, plus shift reminders 15 min before/after a shift ends) is captured in
 * `spec/notifications.md` and needs a backend/service worker. Exports functions only —
 * no component — so it's not a react-refresh boundary.
 */

export type NotifyState = NotificationPermission | "unsupported";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotifyState {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/** Ask for permission if it hasn't been decided yet; returns the resulting state. */
export async function requestNotificationPermission(): Promise<NotifyState> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Show a foreground notification. Clicking it focuses the tab and navigates to `url`
 * (an in-app path, resolved against the app base). Returns whether one was shown.
 */
export function showNotification(
  title: string,
  opts: { body?: string; url?: string } = {},
): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const n = new Notification(title, { body: opts.body });
  if (opts.url) {
    n.onclick = () => {
      window.focus();
      window.location.href = base + opts.url!;
    };
  }
  return true;
}

/**
 * Simulate the daily self-care check-in reminder (the Profile button). Requests
 * permission if needed, then shows a gentle notification that deep-links to /self-care.
 */
export async function simulateSelfCareReminder(): Promise<"shown" | "denied" | "unsupported"> {
  const perm = await requestNotificationPermission();
  if (perm === "unsupported") return "unsupported";
  if (perm !== "granted") return "denied";
  showNotification("Time for a self-care check-in 🌱", {
    body: "A quick, kind check-in — how are you doing today?",
    url: "/self-care",
  });
  return "shown";
}
