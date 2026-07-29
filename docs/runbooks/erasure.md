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

It resolves the live table, user pool and capture bucket from the `NursePlanner-dev` stack,
finds the Cognito user, and prints everything it would delete. Read the list. There are
**four** things, and the first three are DynamoDB rows:

1. The user's own partition (`USER#<sub>`), including soft-delete **tombstones**.
2. The sibling **`AI#<sub>` partition** — every ask-your-notes thread, question and answer,
   plus the daily counters. This lives apart from `USER#<sub>` on purpose (it must stay out
   of the sync scan, `spec-ai-recall.md` D16), which is exactly why it has to be named
   explicitly here rather than being caught by "the whole partition".
3. The share/mentorship **counterpart** rows that live in *other* users' partitions.
4. Every **photographed note page** under `u/<sub>/` in the capture bucket
   (`spec-note-capture.md` P1). These have **no lifecycle expiry** by decision (P13) — they
   back PAD evidence for the length of a degree — so this script is the only thing that ever
   removes them.

If the stack predates the Captures construct there is no `CaptureBucketName` output; the
script says so and skips step 4 rather than failing. If you see that message on a stack that
*should* have photos, stop and check the stack before replying to the request.

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
that no copy remains. Note the capture bucket is **not** versioned, so deleted photos are
gone immediately with no equivalent window. This is disclosed in the privacy policy, so no further action is
needed; just be aware if they ask "is it *really* all gone".

## Notes

- The deletion logic is covered by `tests/eraseUser.test.ts` (dynalite + a stub S3 client):
  partition, tombstones, cross-partition grants, the `AI#<sub>` partition, and the capture
  prefix — including that pagination is followed (so a heavy user's later pages aren't
  missed) and that another user's prefix is never touched.
- Rehearse once on a throwaway user before you need it for real.
- The script only ever touches the account you name; it does not scan or affect other users
  beyond deleting the specific grant rows that pointed at the erased user.
