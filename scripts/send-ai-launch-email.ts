/**
 * Announce AI recall ("ask your own notes") to the students who asked to be told.
 *
 * Unlike the other mail scripts this one **resolves its own recipient list**: it scans
 * the table for users whose profile carries `aiRecallInterestAt` — the flag set when
 * someone tapped "notify me" on the coming-soon teaser. That teaser promised "one
 * heads-up at launch", so the list is the promise, and typing addresses by hand would
 * risk both missing someone and mailing someone who never asked.
 *
 * Dry-run by default: prints the resolved recipients and renders a preview, sends
 * nothing. `--execute` sends. A single `--to` overrides the flag lookup entirely, which
 * is how you send yourself a real copy before the real run.
 *
 *   AWS_PROFILE=personal npx tsx scripts/send-ai-launch-email.ts
 *   AWS_PROFILE=personal npx tsx scripts/send-ai-launch-email.ts --to me@example.com --name Ellis --execute
 *   AWS_PROFILE=personal npx tsx scripts/send-ai-launch-email.ts --execute
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, resolveStackConfig } from "./lib/admin";

const TEMPLATE = "ai-recall-launch";
/** Nicola + Ellis keep a blind copy of every send. `--bcc` overrides, `--no-bcc` drops. */
const DEFAULT_BCC = "nicolanightingale97@hotmail.co.uk,ellis@placemate.uk";

interface Recipient {
  email: string;
  name?: string;
  interestedAt: string;
}

/**
 * Everyone who tapped "notify me". A Scan is the honest tool here: profiles live at
 * `SK = "PROFILE"` across every user partition, there is no GSI on the flag, and the
 * beta is small — this runs once, by hand.
 */
async function findInterestedUsers(tableName: string): Promise<Recipient[]> {
  const doc = docClient();
  const found: Recipient[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "SK = :sk AND attribute_exists(aiRecallInterestAt) AND deleted <> :true",
        ExpressionAttributeValues: { ":sk": "PROFILE", ":true": true },
        ExclusiveStartKey,
      }),
    );
    for (const item of res.Items ?? []) {
      const email = typeof item.email === "string" ? item.email : "";
      if (!email) continue; // a guest-shaped profile with no address — nothing to send to
      found.push({
        email,
        name: typeof item.displayName === "string" ? item.displayName : undefined,
        interestedAt: String(item.aiRecallInterestAt),
      });
    }
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return found.sort((a, b) => a.interestedAt.localeCompare(b.interestedAt));
}

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const arg = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const bcc = argv.includes("--no-bcc") ? undefined : (arg("--bcc") ?? DEFAULT_BCC);
  const stack = arg("--stack");

  // `--to` bypasses the flag lookup — for sending yourself a real copy first.
  const override = arg("--to");
  let recipients: Recipient[];
  if (override) {
    recipients = [{ email: override, name: arg("--name"), interestedAt: "(manual)" }];
    console.log(`\nManual recipient (bypassing the notify-me list): ${override}`);
  } else {
    const { tableName } = await resolveStackConfig(stack);
    recipients = await findInterestedUsers(tableName);
    console.log(`\nRecipients from the notify-me list (${tableName}):`);
    if (recipients.length === 0) {
      console.log("  (nobody has tapped 'notify me' — nothing to send)\n");
      return;
    }
    for (const r of recipients) {
      console.log(
        `  ${r.email}${r.name ? ` (${r.name})` : ""} — asked ${r.interestedAt.slice(0, 10)}`,
      );
    }
  }

  console.log(
    `\n${execute ? "SENDING" : "DRY-RUN"} "${TEMPLATE}" to ${recipients.length} recipient(s)` +
      `${bcc ? ` (bcc ${bcc})` : ""}\n`,
  );

  const sendSh = join(dirname(fileURLToPath(import.meta.url)), "..", "emails", "send.sh");
  let failures = 0;
  for (const r of recipients) {
    const cliArgs = [TEMPLATE, "--to", r.email];
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
      : "\nDry run only — open the preview path(s) above, then re-run with --execute.\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
