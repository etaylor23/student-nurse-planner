# Runbook: erase a user's data (UK GDPR)

Our [privacy policy](../../site/src/pages/privacy.astro) promises we action an erasure
request within **30 days**. This is how. Budget ~5 minutes.

## 1. Verify the request

Erasure is destructive and irreversible. Confirm the request genuinely comes from the
account holder: it must arrive **from the account's own email address** (the one they sign
in with). If it came another way, reply asking them to send it from that address.

## 2. Dry-run (see exactly what will be deleted)

The script is **dry-run by default** — it deletes nothing until you add `--execute`.

```bash
AWS_PROFILE=personal npx tsx scripts/delete-user.ts someone@example.com
```

It resolves the live table + user pool from the `NursePlanner-dev` stack, finds the Cognito
user, and prints every DynamoDB row it would delete: the user's whole partition
(`USER#<sub>`) including soft-delete **tombstones**, plus the share/mentorship
**counterpart** rows that live in other users' partitions. Read the list.

## 3. Execute

```bash
AWS_PROFILE=personal npx tsx scripts/delete-user.ts someone@example.com --execute
```

This deletes the DynamoDB rows above **and** the Cognito user (so the email/account is
gone). It prints the manual tail below.

## 4. Manual tail (not in AWS)

- **Sentry** (EU project): delete the user's data — their entries in the User Feedback
  inbox, and events filtered by their user id. Sentry's Settings → Privacy & Security has a
  "delete user data" action, or filter + delete by `user.id`.
- **hello@ inbox**: if they asked, delete their emails to us.

## 5. Confirm & note the backup window

Reply from `hello@placemate.uk` confirming the erasure is done. Note that **point-in-time
backups of the table roll off automatically within ~35 days** (the PITR window) — after
that no copy remains. This is disclosed in the privacy policy, so no further action is
needed; just be aware if they ask "is it *really* all gone".

## Notes

- The deletion logic is covered by `tests/eraseUser.test.ts` (dynalite) — partition +
  tombstones + cross-partition grants.
- Rehearse once on a throwaway user before you need it for real.
- The script only ever touches the account you name; it does not scan or affect other users
  beyond deleting the specific grant rows that pointed at the erased user.
