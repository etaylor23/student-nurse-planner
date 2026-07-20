# Plans

Working implementation plans, grilled into shape before building. One file per piece
of work.

## 2026-07-20 — today's five

1. **[Sentry feedback + error capture](2026-07-20-sentry-feedback.md)** — `@sentry/react`
   feedback widget (with screenshots) + passive error capture, brand-styled header
   trigger, source maps via CI. Free plan; screenshots unmasked with a firm warning
   (accepted risk).
2. **[Welcome email "not junk" callout](2026-07-20-welcome-email-not-junk.md)** — warm
   end-of-email callout asking recipients to mark not-junk + add `hello@placemate.uk`
   to contacts. `welcome-beta` template only.
3. **[Home first-login example flow](2026-07-20-home-example-flow.md)** — a connected
   stepper (breadth tour, core-capture-first) with action-based completion derived from
   data, dismiss + replay synced to the profile.
4. **[Home AI recall explainer](2026-07-20-ai-recall-explainer.md)** — animated
   "coming soon" scripted demo of the upcoming AI recall feature, illustrative source
   chips, lightweight synced "notify me".

5. **[NHS/hospital WiFi access](2026-07-20-nhs-wifi-access.md)** — placemate.uk shows
   "network connection was lost" on UCLH WiFi. Investigate site + app (remote-only) and
   ship reversible hedges: drop IPv6, drop HSTS `preload`, submit for filter
   re-categorisation. Blocks the core placement audience.

> Plans 3 and 4 both add an optional field to the `User` type — batch them into one
> `npm run gen:zod` when implementing.

## Cohesiveness / elite user flow

- **[connected-user-flow.md](connected-user-flow.md)** — investigation into whether the
  platform reads as one connected journey or a bundle of siloed tools.
- **[2026-07-20-elite-user-flow.md](2026-07-20-elite-user-flow.md)** — the resulting
  phased plan: wire the evidence gaps + inline signposts (substance), then the animated
  mindmap, next-step nudges and capture polish (show). Note-first, signposted, "every
  note counts toward registration".
