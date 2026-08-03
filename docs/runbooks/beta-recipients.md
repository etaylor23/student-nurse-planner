# Runbook: beta recipients (who's been emailed / invited)

The **source of truth** for who is in the PlaceMate beta. Maintain it by hand.

Amazon SES keeps **no per-recipient record** of what we send — `emails/send.sh` and the
magic-link Lambda both send without a configuration set / event destination, and SES
`SendEmail` isn't a CloudTrail data event. Aggregate counts (sends, bounces) are all AWS can
tell us. So if this file isn't kept current, the only way to reconstruct who was contacted is
digging through old session transcripts. Don't make future-us do that.

Update it whenever you run a [beta lifecycle script](./beta-invites.md):

- **any email sent** → append `` `template` date `` to that person's _Emails sent_ cell.
  That cell is the whole point of this file; if you only update one thing, update it.
- **invite** sent (`invite-user.ts --execute`) → also set _Invited_ and status `invited`,
  and append `magic-link` to _Emails sent_ (the script sends that email as well as
  provisioning the account).
- **removed** (`delete-user.ts --execute`) → set status `removed` (keep the row for history).

Dates are the day the email went out (Europe/London). Status: `inbound` (asked us for
access, awaiting their onboarding call) or `pre-welcomed` → `invited` → (`removed`).

**Provisioned ≠ active.** A Cognito account only becomes a row in DynamoDB once the person
signs in and the app syncs. Cross-check both (see below) before treating anyone as a live
user — an invite that was never opened looks identical to an active student in Cognito.

## Beta students

**Emails sent** is the per-person record: every email that address has received, oldest
first, named by the template that produced it. `magic-link` is the sign-in email from the
auth Lambda (sent by `invite-user.ts`, invite-copy variant), not one of the `emails/`
templates. **Invited** is the day they were provisioned in Cognito, which is a different
fact from an email landing.

| Name      | Email                        | Emails sent                                                                          | Invited    | Status  | Notes |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------ | ---------- | ------- | ----- |
| Francesca | `frxnyi@gmail.com`           | `welcome-beta` 2026-07-22 · `magic-link` 2026-07-24 · `intelligence-recall` 2026-08-03 | 2026-07-24 | invited | Gmail |
| Ruby      | `Rubyajames@live.co.uk`      | `welcome-beta` 2026-07-22 · `magic-link` 2026-07-24 · `intelligence-recall` 2026-08-03 | 2026-07-24 | invited | Live |
| Nicole    | `nicolewane@hotmail.co.uk`   | `welcome-beta` 2026-07-22 · `magic-link` 2026-07-24 · `intelligence-recall` 2026-08-03 | 2026-07-24 | invited | Hotmail |
| Darlene   | `Darlene.auguis@nhs.net`     | `welcome-beta` 2026-08-03 · `magic-link` 2026-08-03 · `intelligence-recall` 2026-08-03 | 2026-08-03 | invited | NHSmail. Three emails in one day, and Defender Safe Links rewrites URLs — if the sign-in link or the images misbehave, ask for a personal address |
| Regine    | `reginefouda@hotmail.com`    | `magic-link` 2026-08-03 · `intelligence-recall` 2026-08-03                             | 2026-08-03 | invited | Hotmail. Warmed up outside the scripts, so no `welcome-beta` — went straight to the magic link |
| Kyra      | `kyranicolesingh@icloud.com` | `inbound` 2026-08-03                                                                   | —          | inbound | iCloud. Got in touch asking for access, so `inbound` rather than `welcome-beta`. Awaiting reply with call times — **provision only after the call** |

## Announcements sent

Feature launches go to students, not to the team (who are BCC'd). Log them here: SES keeps
no per-recipient record, so this is the only durable answer to "did they already get this?"

| Date       | Template              | Sent to                                          |
| ---------- | --------------------- | ------------------------------------------------ |
| 2026-08-03 | `intelligence-recall` | Francesca, Ruby, Nicole, Darlene, Regine (bcc Ellis). Not Kyra, who has no account yet. |

## Team / test accounts

Not beta students — listed separately so the count above stays honest.

| Who                 | Email                              | Provisioned | Notes                                     |
| ------------------- | ---------------------------------- | ----------- | ----------------------------------------- |
| Nicola (co-founder) | `nicolanightingale97@hotmail.co.uk` | 2026-07-10  | Also BCC'd on every pre-welcome           |
| Ellis               | `ellis@placemate.uk`               | 2026-07-21  | Also BCC'd on every pre-welcome           |
| Ellis (test inbox)  | `ellis.taylor499@gmail.com`        | 2026-07-24  | Dogfood inbox — used to rehearse invites  |

## Cross-check against the live pool

Invited (provisioned) accounts should match Cognito. Pre-welcomed-but-not-yet-invited
recipients do **not** appear there (the pre-welcome doesn't provision) — for them, this file
is the only record.

```bash
# UserPoolId comes from the stack (the scripts resolve it automatically):
POOL=$(aws cloudformation describe-stacks --stack-name NursePlanner-dev --profile personal --region eu-west-2 \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

aws cognito-idp list-users --user-pool-id "$POOL" --profile personal --region eu-west-2 \
  --query "Users[].{email: Attributes[?Name=='email']|[0].Value, status: UserStatus, created: UserCreateDate}" \
  --output table
```
