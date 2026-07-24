import * as Sentry from "@sentry/react";

/**
 * Sentry — error monitoring + user feedback, PRODUCTION ONLY.
 *
 * Imported as the FIRST side effect in `main.tsx` so `Sentry.init` runs before anything
 * else and catches errors during app bootstrap. The DSN is public and safe to commit; it
 * points at Sentry's EU (`de`) ingest region, so data stays in the EU.
 *
 * Scope (deliberately narrow — see plans/2026-07-21-beta-hardening.md, decision D1):
 *   - Init only when the build is production. Local `npm run dev` sends NOTHING, so dev
 *     sessions never pollute the beta signal or burn quota.
 *   - No performance tracing (removed — it measured API latency we don't act on).
 *   - Session Replay only when an error occurs (`replaysSessionSampleRate: 0`), and even
 *     then MASKED: all text + inputs masked, all media blocked. This app holds medication
 *     notes, reflections and other free text that can identify patients, so replay must
 *     never be able to record patient-identifiable content.
 *   - `environment` + `release` are tagged so a beta bug report points at the exact
 *     deployed build (release = the deploying commit SHA; see __APP_RELEASE__).
 *
 * User identity (email + display name) is attached elsewhere (RepositoryContext) so reports
 * are attributable and repliable — disclosed in the privacy policy.
 */
if (import.meta.env.PROD) {
  Sentry.init({
    dsn: "https://2dc254674b90099e4de999c81e152df8@o4511766934781952.ingest.de.sentry.io/4511766945726544",
    environment: import.meta.env.MODE,
    release: __APP_RELEASE__,
    integrations: [
      Sentry.replayIntegration({
        // Pinned for clinical safety — never record patient-identifiable content.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
      // User feedback (with screenshots). We mount our OWN trigger in the app header
      // (autoInject: false), so no default floating button. Screenshots are NOT masked
      // (product decision) — the message placeholder carries a firm do-not-include-
      // patient-data warning instead.
      Sentry.feedbackIntegration({
        autoInject: false,
        enableScreenshot: true,
        showBranding: false,
        colorScheme: "light",
        themeLight: {
          accentBackground: "#047857", // emerald brand primary (mirror of --color-primary-600; the Sentry widget renders in a shadow DOM so it can't read the CSS var)
          accentForeground: "#ffffff",
        },
        formTitle: "Send feedback",
        buttonLabel: "Feedback",
        submitButtonLabel: "Send feedback",
        messagePlaceholder:
          "What's working, what's broken, what would help? Please don't include any patient-identifiable information in your message or screenshot.",
      }),
    ],
    // Session Replay — never sample plain sessions; capture only sessions that hit an error.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
