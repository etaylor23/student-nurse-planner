import "./observability/sentry"; // side effect: Sentry.init() — first, so bootstrap errors are captured
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./auth/passwordlessConfig"; // side effect: Passwordless.configure(...) — must run first
import { PasswordlessContextProvider } from "amazon-cognito-passwordless-auth/react";
import { App } from "./App";
import "./index.css";

// A deploy replaces content-hashed chunks; a tab left open across a deploy can then fail
// to fetch a lazily-loaded chunk. Reload once (guarded against a loop) to pull the fresh
// index.html and its new asset hashes. Dormant today (single bundle) — insurance for when
// we code-split. Vite dispatches `vite:preloadError` on a failed dynamic import.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const now = Date.now();
  const last = Number(sessionStorage.getItem("pm:chunkReloadAt") ?? 0);
  if (now - last > 10_000) {
    sessionStorage.setItem("pm:chunkReloadAt", String(now));
    window.location.reload();
  }
});

// Ask the browser to make our IndexedDB persistent (not evictable under storage pressure).
// For a guest, the local DB is the ONLY copy of their data, so eviction = total loss.
// Fire-and-forget: unsupported browsers and a declined request both just fall back to
// best-effort storage.
if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PasswordlessContextProvider>
      <App />
    </PasswordlessContextProvider>
  </StrictMode>,
);
