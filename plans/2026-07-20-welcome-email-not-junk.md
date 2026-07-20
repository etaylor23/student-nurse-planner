# Plan — "Mark us as not junk" callout in the welcome email

**Status:** Planned (grilled 2026-07-20) · **Effort:** ~30 min (copy + 3 files)

## Goal

Improve deliverability of our emails (especially the follow-up magic-link invite) by
asking new beta users, in a warm way, to rescue us from spam. Framed around "our
domain is a youngster and the world is still learning about it."

## Decisions (locked in grilling)

- **Placement:** a **soft tinted callout near the end** of the email — after the CTA,
  around the "keep an eye on your inbox" line. Reads as a warm PS; keeps the opening
  about the student, not about us.
- **The ask:** **mark it "not junk" if it landed there AND add `hello@placemate.uk`
  to contacts / safe senders.** The add-to-contacts step is what actually rescues
  *future* emails (the magic-link invite especially), not just this one.
- **Scope:** the existing [`welcome-beta`](../emails/templates/welcome-beta/) template
  only. The magic-link invite is sent by Cognito and isn't a hand-edited template here.

## Files to change

- [`emails/templates/welcome-beta/body.html`](../emails/templates/welcome-beta/body.html)
- [`emails/templates/welcome-beta/body.txt`](../emails/templates/welcome-beta/body.txt)
- `emails/.preview-welcome-beta.html` (regenerate the preview)

No code change — `emails/send.sh` sends via SES unchanged.

## Draft copy (for sign-off)

**HTML** — insert as a tinted callout box between the "keep an eye on your inbox"
paragraph and the sign-off. Match the template's type stack + brand tokens
(emerald `#059669`, ink `#16212f`); box background `#ecfdf5`, border `#d1fae5`,
`border-radius:10px`, padding `16px 18px`:

> **One tiny favour** 🌱 — we're a new name, so inboxes are still learning to trust
> us. If this landed in spam or promotions, marking it **"Not junk"** and adding
> **hello@placemate.uk** to your contacts takes five seconds — and it's the best way
> to make sure your magic-link invite doesn't get lost. It genuinely helps us grow.

**Plain text** — equivalent block near the end:

```
One tiny favour: we're a new name, so inboxes are still learning to trust us.
If this landed in spam or promotions, marking it "Not junk" and adding
hello@placemate.uk to your contacts takes five seconds -- and it's the best way
to make sure your magic-link invite doesn't get lost. It genuinely helps us grow.
```

*(Wording is a draft — tweak freely before we ship.)*

## Acceptance criteria

- Callout renders correctly in `.preview-welcome-beta.html` and in a real inbox test.
- Both `body.html` and `body.txt` carry the same ask; footer/CTA untouched.
- Copy approved.

## Note

Per the marketing-website memory, the `emails/` library is currently uncommitted.
This change would be committed with it (git workflow = commit + push to master when
you ask).
