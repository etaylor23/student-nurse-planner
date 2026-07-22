/**
 * Send the pre-welcome ("welcome-beta") email to a prospective beta user. This does NOT
 * touch Cognito — it just sends the warm intro that sets expectations ("your magic-link
 * invite is coming in the next couple of days"), so recipients don't need an account yet.
 *
 * Thin wrapper over emails/send.sh (the proven renderer: {{first_name}} substitution +
 * List-Unsubscribe header). Dry-run by default (writes a preview, sends nothing); --execute
 * sends for real.
 *
 *   AWS_PROFILE=personal npx tsx scripts/send-pre-welcome-email.ts someone@example.com --name Sam
 *   AWS_PROFILE=personal npx tsx scripts/send-pre-welcome-email.ts someone@example.com --name Sam --execute
 *
 * Nicola is BCC'd on every send by default (so she keeps a copy). Override with
 * --bcc <addr[,addr]>, or turn it off with --no-bcc.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUserArgs } from "./lib/admin";

/** Nicola keeps a blind copy of every pre-welcome that goes out. */
const DEFAULT_BCC = "nicolanightingale97@hotmail.co.uk";

function main() {
  const argv = process.argv.slice(2);
  const args = parseUserArgs(argv);
  if (!args.email) {
    console.error(
      "Usage: send-pre-welcome-email.ts <email> [--name <first name>] [--bcc <addr>] [--no-bcc] [--execute]",
    );
    process.exit(1);
  }
  // BCC defaults to Nicola; --bcc overrides the address, --no-bcc drops it.
  const bccIdx = argv.indexOf("--bcc");
  const bcc = argv.includes("--no-bcc")
    ? undefined
    : bccIdx !== -1 && argv[bccIdx + 1]
      ? argv[bccIdx + 1]
      : DEFAULT_BCC;

  const sendSh = join(dirname(fileURLToPath(import.meta.url)), "..", "emails", "send.sh");
  const cliArgs = ["welcome-beta", "--to", args.email];
  if (args.name) cliArgs.push("--name", args.name);
  if (bcc) cliArgs.push("--bcc", bcc);
  if (!args.execute) cliArgs.push("--dry-run"); // preview unless --execute

  console.log(
    `\n${args.execute ? "SENDING" : "DRY-RUN"} pre-welcome → ${args.email}${args.name ? ` (${args.name})` : ""}${bcc ? ` (bcc ${bcc})` : ""}\n`,
  );
  // send.sh honours AWS_PROFILE via PLACEMATE_AWS_PROFILE (defaults to `personal`).
  const res = spawnSync("bash", [sendSh, ...cliArgs], { stdio: "inherit" });
  if (res.status !== 0) {
    console.error("\nsend.sh failed — check the output above (needs bash, jq, aws configured).");
    process.exit(res.status ?? 1);
  }
  if (!args.execute) {
    console.log("\nDry run only — re-run with --execute to send. Open the preview path above to check it.");
  }
}

main();
