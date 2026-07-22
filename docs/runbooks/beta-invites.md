# Runbook: beta user lifecycle (invite / remove)

Three scripts, run per email, all **dry-run by default** (add `--execute` to act). Run with
the `personal` AWS profile. They resolve the live table + Cognito pool from the
`NursePlanner-dev` stack automatically.

```bash
AWS_PROFILE=personal npx tsx scripts/<script>.ts <email> [--name First] [--execute]
```

## 1. Pre-welcome (warm intro — no account needed)

Sends the `welcome-beta` email (sets expectations: "your magic-link invite is coming in a
day or two"). Recipients do **not** need to be provisioned for this.

```bash
AWS_PROFILE=personal npx tsx scripts/send-pre-welcome-email.ts sam@example.com --name Sam           # preview
AWS_PROFILE=personal npx tsx scripts/send-pre-welcome-email.ts sam@example.com --name Sam --execute # send
```
`--name` fills the "Hey <name>," greeting (defaults to "there"). One recipient per run.
Nicola + Ellis (`nicolanightingale97@hotmail.co.uk`, `ellis@placemate.uk`) are **BCC'd by
default** so they keep a copy; override the whole list with `--bcc a@b,c@d` or drop it with
`--no-bcc`.

## 2. Invite (grant access + magic link)

When it's time to let someone in: provisions them in Cognito with the default invite
**suppressed** (no Cognito email — this is the "don't auto-send" behaviour), confirms them,
and sends the branded magic-link sign-in email. Idempotent — re-running just re-sends the
link.

```bash
AWS_PROFILE=personal npx tsx scripts/invite-user.ts sam@example.com            # dry-run
AWS_PROFILE=personal npx tsx scripts/invite-user.ts sam@example.com --execute  # provision + send
```
Tell them to check spam — new-sender mail can land there while the domain reputation warms
up (SPF/DKIM/DMARC all pass, so it's warmup, not misconfig).

## 3. Remove (delete account + all data)

Deletes the user's whole DynamoDB partition (incl. soft-delete tombstones) + the
share/mentorship counterparts in other partitions + the Cognito account. Also the GDPR
erasure tool — see [`erasure.md`](./erasure.md).

```bash
AWS_PROFILE=personal npx tsx scripts/delete-user.ts sam@example.com            # dry-run (lists what it'd delete)
AWS_PROFILE=personal npx tsx scripts/delete-user.ts sam@example.com --execute  # delete
```
Manual tail (printed by the script): remove the user's Sentry data + any hello@ emails.
PITR backups roll off within ~35 days.

## Notes

- Shared logic lives in [`scripts/lib/admin.ts`](../../scripts/lib/admin.ts); the deletion
  core is tested in [`tests/eraseUser.test.ts`](../../tests/eraseUser.test.ts) (dynalite).
- Override the target env with `--stack <name>` or `STACK_NAME=...` (default `NursePlanner-dev`).
- These only ever touch the single account you name.
