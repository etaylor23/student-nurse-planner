# PlaceMate emails

A small library of hand-sent (manual / low-volume) emails — welcome notes, beta
check-ins, announcements — rendered from templates and sent via **Amazon SES v2**.

This is deliberately separate from the app's automated magic-link mail (that's
owned by the CDK `Auth` construct). Use this for the human, one-off stuff.

## Layout

```
emails/
  send.sh                     # render a template + send it via SES
  templates/
    welcome-beta/             # one folder per email
      subject.txt             # subject line (one line)
      body.html               # HTML part
      body.txt                # plain-text part (always ship one)
```

Every `{{placeholder}}` in the three files is substituted at send time.

## Sending

```bash
# Preview — renders the HTML to emails/.preview-<template>.html, sends nothing.
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

1. `mkdir emails/templates/<name>` and add `subject.txt`, `body.html`, `body.txt`.
2. Reuse `{{first_name}}` and add any `{{other_vars}}` you need.
3. Keep the HTML email-client-safe: tables for layout, inline styles, absolute
   `https://` image URLs (assets live on `placemate.uk`, e.g.
   `https://placemate.uk/icon-512.png`).
4. `--dry-run` and open the preview file before sending to anyone real.
