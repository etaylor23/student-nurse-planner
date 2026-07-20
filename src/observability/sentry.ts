import * as Sentry from "@sentry/react";

/**
 * Sentry — error monitoring + tracing + session replay (user feedback is wired
 * separately, see the feedback trigger in the app shell).
 *
 * Imported as the FIRST side effect in `main.tsx` so `Sentry.init` runs before
 * anything else and catches errors during app bootstrap. The DSN is public and
 * safe to commit; it points at Sentry's EU (`de`) ingest region, so data stays
 * in the EU.
 *
 * CLINICAL-DATA NOTE: this app holds medication notes, reflections and other
 * free text that can identify patients. Session Replay is therefore pinned to
 * MASK all text + inputs and BLOCK all media (these are the SDK defaults, set
 * explicitly here so replay can never regress to recording patient-identifiable
 * content). Feedback screenshots are a separate, user-initiated flow.
 */
Sentry.init({
  dsn: "https://2dc254674b90099e4de999c81e152df8@o4511766934781952.ingest.de.sentry.io/4511766945726544",
  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/react/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: []
  },
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      // Pinned for clinical safety — never record patient-identifiable content.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
    // User feedback (with screenshots). We mount our OWN trigger in the app
    // header (autoInject: false), so no default floating button. Screenshots are
    // NOT masked (product decision) — the message placeholder carries a firm
    // do-not-include-patient-data warning instead.
    Sentry.feedbackIntegration({
      autoInject: false,
      enableScreenshot: true,
      showBranding: false,
      colorScheme: "light",
      themeLight: {
        accentBackground: "#059669", // emerald — brand primary
        accentForeground: "#ffffff",
      },
      formTitle: "Send feedback",
      buttonLabel: "Feedback",
      submitButtonLabel: "Send feedback",
      messagePlaceholder:
        "What's working, what's broken, what would help? Please don't include any patient-identifiable information in your message or screenshot.",
    }),
  ],
  // Tracing — capture 100% of transactions. Fine at beta scale; dial back if the
  // free-tier transaction quota gets tight. `tracePropagationTargets` is left at
  // its default (same-origin only) — no trace headers on third-party requests.
  tracesSampleRate: 1.0,
  // Session Replay — 10% of sessions, and 100% of any session with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
