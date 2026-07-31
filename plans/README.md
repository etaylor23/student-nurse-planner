# Plans

Working implementation plans, grilled into shape before building. One file per piece
of work.

## 2026-07-31 — note capture review screen

- **[note-capture-review-redesign.md](2026-07-31-note-capture-review-redesign.md)** —
  **BUILT.** Re-layout of the photo-import review screen against
  [`spec/spec-note-capture.md`](../spec/spec-note-capture.md), no behaviour change. Three
  moves: the photo becomes the map (a sticky pane with each block outlined on the page,
  click-to-focus both ways), one note expanded and the rest one line each grouped
  `Needs you` / `Filed`, and destination as four tiles replacing both the `<select>` and
  the four permanent lanes — which cost half the width to say four words. Three banners
  collapse into one ~40px meta strip of chips; `LaneBoard` is gone and drag survives as a
  drop bar that only exists during a drag; `↑↓` `1–4` `⏎` throughout. Adds one piece of
  backend plumbing, `notes/presignPageImage`, so the review screen can actually show the
  photo P1 has been retaining all along.

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
   chips, lightweight synced "notify me". **Now being delivered by
   [2026-07-24-ai-recall-v1.md](2026-07-24-ai-recall-v1.md)** (round-1 decisions) —
   full build spec at [`spec/spec-ai-recall.md`](../spec/spec-ai-recall.md): Bedrock
   Sonnet 5 (credits-only), context-stuffed corpus + prompt caching, streaming
   Function URL, persistent multi-thread chat, teaser-becomes-real + global ask bar.

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
