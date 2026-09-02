# PlaceMate emails

A small library of hand-sent (manual / low-volume) emails — welcome notes, beta
check-ins, announcements — rendered from templates and sent via **Amazon SES v2**.

This is deliberately separate from the app's automated magic-link mail (that's
owned by the CDK `Auth` construct). Use this for the human, one-off stuff.

## Layout

```
emails/
  send.sh                     # compose a template into the shell + send it via SES
  templates/
    _shell/                   # the brand chrome, written once
      body.html               # card, logo lockup, footer; slots {{title}} {{preheader}}
      body.txt                #   …{{content}} and {{footer_reason}}
    welcome-beta/             # one folder per email — content only, no chrome
      subject.txt             # subject line (one line)
      content.html            # HTML body copy — no <html>, no card, no footer
      content.txt             # plain-text body copy (hand-written, not derived)
      vars                    # key=value lines filling the shell's slots
      preview.html            # last --dry-run render — gitignored, open it in a browser
```

Emails hold **content only**. The card, logo lockup and footer live once in `_shell` and
are wrapped around the content at send time — so there is nothing to rebuild, no generated
files to keep in sync, and a change to the chrome lands in every email at once.

Every `{{placeholder}}` is substituted at send time, in precedence order: `--name` (sets
`{{first_name}}`), then `--var KEY=VALUE`, then the template's own `vars` file. **Any
placeholder left unfilled is a hard error** — template syntax must never reach an inbox.

`content.txt` is written by hand, not generated from the HTML. It reflows to ~70 columns
and turns CTA buttons into plain `label: https://…` lines; no converter does that well, and
the text part is what plenty of clients and every spam filter actually reads.

## Sending

```bash
# Preview — renders the HTML to templates/<name>/preview.html, sends nothing.
./emails/send.sh welcome-beta --to sarah@example.com --name Sarah --dry-run

# Send for real.
./emails/send.sh welcome-beta --to sarah@example.com --name Sarah
```

- `--name` fills `{{first_name}}` (defaults to `there` if omitted).
- `--var key=value` fills any other `{{key}}` — repeatable.
- `--from "Name <addr>"` overrides the sender.
- `--dry-run` renders + prints the summary but never calls SES.

### Config (env var overrides)

| Var                     | Default                          | What                    |
| ----------------------- | -------------------------------- | ----------------------- |
| `PLACEMATE_AWS_PROFILE` | `personal`                       | AWS CLI profile         |
| `PLACEMATE_SES_REGION`  | `eu-west-2`                      | SES region              |
| `PLACEMATE_FROM`        | `PlaceMate <hello@placemate.uk>` | From identity           |
| `PLACEMATE_REPLY_TO`    | `hello@placemate.uk`             | Reply-To                |

## SES status

Production access is **live** (confirmed 2026-07-18: `ProductionAccessEnabled: true`,
quota 50,000/day @ 14/s). Mail can go to **any** recipient — no per-address
verification needed. The `placemate.uk` domain is a verified, DKIM-signed sender,
so `hello@placemate.uk` works as the From address.

Check the account's sending status any time:

```bash
aws sesv2 get-account --profile personal --region eu-west-2 \
  | jq '{ProductionAccessEnabled, SendingEnabled, SendQuota}'
```

Use `--dry-run` for content review before a real send.

## Adding a new email

1. `cp -r emails/templates/welcome-beta emails/templates/<name>` — gives you the four
   files to edit. (Or create them by hand; `send.sh` tells you which are missing.)
2. Rewrite `content.html` / `content.txt`, set `subject.txt`, and fill `vars` with the
   template's `title`, `preheader` and `footer_reason`. The footer reason should say
   truthfully why *this* recipient is getting *this* email.
3. Reuse `{{first_name}}` and add any `{{other_vars}}` you need — put their values in
   `vars`, or pass `--var key=value` per send.
4. Keep the HTML email-client-safe: tables for layout, inline styles, absolute
   `https://` image URLs (assets live on `placemate.uk`, e.g.
   `https://placemate.uk/icon-512.png`). Don't touch `_shell` unless you mean to change
   every email.
5. `--dry-run` and open the preview file before sending to anyone real.

## Current templates

| Template              | Who it's for                                          |
| --------------------- | ----------------------------------------------------- |
| `welcome-beta`        | Recruited beta students — warm intro, magic link follows in a day or two. |
| `inbound`             | People who got in touch asking to use PlaceMate. Access is gated on an onboarding call, so it deliberately does **not** promise a magic link. |
| `inbound-consent`     | People who got in touch asking to use PlaceMate, where we'll add them straight away — no call, just a GDPR consent reply. Welcome email + sign-in link follow once they say yes. |
| `invite-sent`         | Consent-flow follow-up, sent right after `invite-user.ts`: invite confirmed (link valid a week), feedback via Instagram DMs, optional check-ins, "how did you find us?". Replaces the pre-welcome for this door. |
| `intelligence-recall` | Beta students — PlaceMate Intelligence email 1 of 2: ask-your-notes is live, photo import teased. |
| `intelligence-capture` | Beta students — PlaceMate Intelligence email 2 of 2: photo note capture is live. |
