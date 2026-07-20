# Plan — In-app feedback + error capture (Sentry)

**Status:** Planned (grilled 2026-07-20) · **Effort:** ~half a day incl. CI

## Goal

Let beta users report feedback with a built-in screenshot, and passively capture
JS errors so we have a bug trail. Sentry chosen because the same account grows
into automated bug detection later. Free plan for now.

## Decisions (locked in grilling)

| Branch | Decision | Why |
|---|---|---|
| SDK | **`@sentry/react`** (not `@sentry/browser`) | React app; use the React ErrorBoundary + hooks |
| Scope now | **Feedback widget (with screenshots) + passive JS error capture.** No performance tracing, no Session Replay. | Both come from one init; errors are passive + free-tier-friendly. Replay would record clinical notes in the DOM — hard no. |
| Plan | Free tier | Beta scale; disable tracing/replay to protect quota |
| Screenshots | **ON, no masking.** Firm in-widget warning: *don't include patient-identifiable info.* | Accepted risk — see Risks. Screenshots stay maximally useful for UI bugs. |
| Identity | `Sentry.setUser({ id: sub, email, username: displayName })` once signed in; cleared on sign-out | Small invite beta — every report attributable + repliable |
| Consent | **Privacy-policy line naming Sentry as a processor + one line of small print in the widget** | Honest + friction-free; no hard gate |
| Source maps | **Set up now** via `@sentry/vite-plugin` + `SENTRY_AUTH_TOKEN` CI secret | Minified stack traces are near-useless; small one-off cost |
| Trigger UI | **Brand-styled "Feedback" pill in the top header, right-aligned**, signed-in only, with a **page-load attention animation** (respects `prefers-reduced-motion`, once per session) | Always visible, never covers content; the animation guarantees discovery |

Defaults also locked: init in [`src/main.tsx`](../src/main.tsx) **before render** and
**global** (so errors during the auth flow are caught too, even though the
*trigger* is signed-in only); DSN via `VITE_SENTRY_DSN` (public, safe client-side);
init **skipped on localhost** unless a DSN is set locally, so dev noise doesn't burn
quota; tag `environment` + `release` (git SHA / package version).

## Implementation

1. **Install:** `npm i @sentry/react` · `npm i -D @sentry/vite-plugin`
2. **`src/observability/sentry.ts`** — `initSentry()`:
   - Guard: no-op unless `import.meta.env.VITE_SENTRY_DSN` is set.
   - `Sentry.init({ dsn, environment, release, tracesSampleRate: 0, integrations: [Sentry.feedbackIntegration({ autoInject: false, enableScreenshot: true, colorScheme: "light", showBranding: false, formTitle, messagePlaceholder, submitButtonLabel })] })`.
   - Export a helper to attach the widget to our own button (`getFeedback()?.attachTo(el)` or `createForm()`).
3. **`main.tsx`** — call `initSentry()` at the very top, before `createRoot`. Optionally wrap `<App/>` in `Sentry.ErrorBoundary` with a minimal branded fallback.
4. **Identity** — in the auth/`RepositoryContext` layer, when the user resolves call `Sentry.setUser({ id, email, username })`; on sign-out `Sentry.setUser(null)`.
5. **Header trigger** — add `FeedbackButton` to the right of the logo in [`AppLayout.tsx`](../src/react/components/AppLayout.tsx) header (`h-14`, empty space today). Style from `ui.tsx` tokens (pill, emerald or ghost). Attach the Sentry feedback form on click. Add a one-time load animation (e.g. a short pulse + a self-dismissing tooltip), gated behind `matchMedia("(prefers-reduced-motion: reduce)")` and a `sessionStorage` "seen" flag.
6. **PII warning copy** — the widget has no dedicated disclaimer slot, so carry the warning in `messagePlaceholder` **and** a short line rendered just under the trigger/tooltip; keep it firm. *(If that's too weak, fall back to a small custom form calling `Sentry.captureFeedback()` — flagged, not default.)*
7. **Source maps** — `vite.config.ts`: add `sentryVitePlugin({ org, project, authToken: env.SENTRY_AUTH_TOKEN })`, set `build.sourcemap: "hidden"` for prod. Add `SENTRY_AUTH_TOKEN` to GitHub Actions secrets + pass to the build step.
8. **Privacy** — add the Sentry-processor line to the placemate privacy policy (**confirm a privacy page exists on `site/`** — flagged below).
9. **Verify** — temporary `throw` → appears under Issues; submit feedback + screenshot → appears under User Feedback with the user's email attached.

## Risks & accepted trade-offs

- **PII in screenshots (ACCEPTED, documented).** Screenshots can capture medication
  notes / reflections that name patients, which then sit in Sentry (US). Mitigation
  is a firm written warning only — no masking — per the product decision. Revisit if
  we leave beta or volume grows. A cheap future hardening: add `sentry-mask` to the
  handful of highest-risk free-text surfaces without masking everything.
- **Free-tier quota** — mitigated by disabling tracing + replay; error sample rate
  1.0 is fine at beta scale.
- **Widget disclaimer placement** — no first-class slot; see step 6.

## Open items to confirm

- Exact widget copy (title / placeholder / warning / submit label).
- Whether a privacy page exists on the marketing site to receive the processor line.
