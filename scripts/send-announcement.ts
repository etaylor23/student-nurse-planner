/**
 * Send a branded announcement (a feature launch, a beta update) to every active user.
 *
 * Replaces the old send-ai-launch-email.ts, which resolved recipients from the
 * `aiRecallInterestAt` "notify me" flag. That list was always empty and always would be:
 * the teaser that sets the flag only renders while the AI feature is *unavailable*, so it
 * stopped being reachable the moment recall shipped. Announcements go to the beta, not to
 * a flag nobody could set.
 *
 * Dry-run by default: prints the resolved recipients and renders a preview per person,
 * sends nothing. `--execute` sends. `--to` overrides the lookup entirely, which is how you
 * send yourself a real copy before the real run.
 *
 *   AWS_PROFILE=personal npx tsx scripts/send-announcement.ts --template intelligence-recall
 *   AWS_PROFILE=personal npx tsx scripts/send-announcement.ts --template intelligence-recall --to me@example.com --name Ellis --execute
 *   AWS_PROFILE=personal npx tsx scripts/send-announcement.ts --template intelligence-recall --execute
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, resolveStackConfig } from "./lib/admin";

/** Nicola + Ellis keep a blind copy of every send. `--bcc` overrides, `--no-bcc` drops. */
const DEFAULT_BCC = "nicolanightingale97@hotmail.co.uk,ellis@placemate.uk";

/**
 * Team and test accounts — real users in the pool, but not people to announce *to*. Nicola
 * and Ellis are BCC'd on every send already, so including them here as well would deliver
 * two copies and greet them by name on a mail they're also blind-copied on. Listed
 * explicitly rather than inferred, so the skip is visible when you read the output.
 */
const EXCLUDE = new Set(
  [
    "nicolanightingale97@hotmail.co.uk", // Nicola — co-founder, BCC'd
    "ellis@placemate.uk", // Ellis — BCC'd
    "ellis.taylor499@gmail.com", // dogfood inbox used to rehearse invites
  ].map((e) => e.toLowerCase()),
);

interface Recipient {
  email: string;
  name?: string;
}

/**
 * Every active user with an address. A Scan is the honest tool: profiles live at
 * `SK = "PROFILE"` across every user partition, there is no GSI for them, and the beta is
 * small — this runs by hand, a handful of times.
 *
 * Note the deletion filter. `deleted <> :true` looks right but is wrong: DynamoDB treats a
 * comparison against a *missing* attribute as false, and a profile that was never deleted
 * has no `deleted` attribute at all — so that form silently excludes every live user. The
 * soft-delete path (dynamoRepository) writes `deleted: true`, so test for its absence.
 */
async function findActiveUsers(
  tableName: string,
): Promise<{ all: Recipient[]; skipped: string[] }> {
  const doc = docClient();
  const all: Recipient[] = [];
  const skipped: string[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression:
          "SK = :sk AND attribute_exists(email) AND (attribute_not_exists(deleted) OR deleted = :false)",
        ExpressionAttributeValues: { ":sk": "PROFILE", ":false": false },
        ExclusiveStartKey,
      }),
    );
    for (const item of res.Items ?? []) {
      const email = typeof item.email === "string" ? item.email.trim() : "";
      if (!email) continue; // a guest-shaped profile with no address — nothing to send to
      if (EXCLUDE.has(email.toLowerCase())) {
        skipped.push(email);
        continue;
      }
      all.push({
        email,
        name: typeof item.displayName === "string" ? item.displayName : undefined,
      });
    }
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return { all: all.sort((a, b) => a.email.localeCompare(b.email)), skipped: skipped.sort() };
}

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const arg = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };

  const template = arg("--template");
  if (!template) {
    console.error(
      "Usage: send-announcement.ts --template <name> [--to <email> --name <first>] [--bcc <addr>] [--no-bcc] [--execute]",
    );
    process.exit(1);
  }
  const bcc = argv.includes("--no-bcc") ? undefined : (arg("--bcc") ?? DEFAULT_BCC);

  // `--to` bypasses the lookup — for sending yourself a real copy first.
  const override = arg("--to");
  let recipients: Recipient[];
  if (override) {
    recipients = [{ email: override, name: arg("--name") }];
    console.log(`\nManual recipient (bypassing the user lookup): ${override}`);
  } else {
    const { tableName } = await resolveStackConfig(arg("--stack"));
    const { all, skipped } = await findActiveUsers(tableName);
    recipients = all;
    console.log(`\nActive users in ${tableName}:`);
    for (const r of recipients) console.log(`  ${r.email}${r.name ? ` (${r.name})` : ""}`);
    if (skipped.length > 0) {
      console.log(`\n  skipped (team/test, and BCC'd anyway): ${skipped.join(", ")}`);
    }
    if (recipients.length === 0) {
      console.log("\n  (no one to send to)\n");
      return;
    }
  }

  console.log(
    `\n${execute ? "SENDING" : "DRY-RUN"} "${template}" to ${recipients.length} recipient(s)` +
      `${bcc ? ` (bcc ${bcc})` : ""}\n`,
  );

  const sendSh = join(dirname(fileURLToPath(import.meta.url)), "..", "emails", "send.sh");
  let failures = 0;
  for (const r of recipients) {
    const cliArgs = [template, "--to", r.email];
    // `{{first_name}}` wants a first name; display names are usually already just that,
    // but split defensively so "Ellis Taylor" doesn't greet someone by their full name.
    const firstName = r.name?.trim().split(/\s+/)[0];
    if (firstName) cliArgs.push("--name", firstName);
    if (bcc) cliArgs.push("--bcc", bcc);
    if (!execute) cliArgs.push("--dry-run");

    const res = spawnSync("bash", [sendSh, ...cliArgs], { stdio: "inherit" });
    if (res.status !== 0) {
      failures++;
      // Keep going: one bad address must not strand the rest of the list mid-send.
      console.error(`  ! failed for ${r.email} — continuing`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} of ${recipients.length} failed. See the output above.`);
    process.exit(1);
  }
  console.log(
    execute
      ? `\nSent to ${recipients.length}. Record who received it in docs/runbooks/beta-recipients.md — SES keeps no per-recipient record.\n`
      : "\nDry run only — open the preview path above, then re-run with --execute.\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
