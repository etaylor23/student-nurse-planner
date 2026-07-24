# Runbook: beta recipients (who's been emailed / invited)

The **source of truth** for who is in the PlaceMate beta. Maintain it by hand.

Amazon SES keeps **no per-recipient record** of what we send — `emails/send.sh` and the
magic-link Lambda both send without a configuration set / event destination, and SES
`SendEmail` isn't a CloudTrail data event. Aggregate counts (sends, bounces) are all AWS can
tell us. So if this file isn't kept current, the only way to reconstruct who was contacted is
digging through old session transcripts. Don't make future-us do that.

Update it whenever you run a [beta lifecycle script](./beta-invites.md):

- **pre-welcome** sent (`send-pre-welcome-email.ts --execute`) → add a row, set _Pre-welcome_.
- **invite** sent (`invite-user.ts --execute`) → set _Invited_ and status `invited`.
- **removed** (`delete-user.ts --execute`) → set status `removed` (keep the row for history).

Dates are the day the email went out (Europe/London). Status: `pre-welcomed` → `invited` →
(`removed`).

## Beta students

| Name      | Email                       | Pre-welcome | Invited    | Status  | Notes   |
| --------- | --------------------------- | ----------- | ---------- | ------- | ------- |
| Francesca | `frxnyi@gmail.com`          | 2026-07-22  | 2026-07-24 | invited | Gmail   |
| Ruby      | `Rubyajames@live.co.uk`     | 2026-07-22  | 2026-07-24 | invited | Live    |
| Nicole    | `nicolewane@hotmail.co.uk`  | 2026-07-22  | 2026-07-24 | invited | Hotmail |

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
