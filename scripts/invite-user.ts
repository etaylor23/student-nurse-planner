/**
 * Invite a beta user: provision them in Cognito (no Cognito default email — invite is
 * SUPPRESSED, then confirmed) and send the branded magic-link sign-in email. Idempotent —
 * re-running on an existing user just re-sends the magic link.
 *
 * Dry-run by default. Add --execute to actually provision + send.
 *
 *   AWS_PROFILE=personal npx tsx scripts/invite-user.ts someone@example.com
 *   AWS_PROFILE=personal npx tsx scripts/invite-user.ts someone@example.com --execute
 */
import {
  cognitoClient,
  findUser,
  parseUserArgs,
  provisionUser,
  resolveStackConfig,
  sendMagicLink,
} from "./lib/admin";

async function main() {
  const args = parseUserArgs(process.argv.slice(2));
  if (!args.email) {
    console.error("Usage: invite-user.ts <email> [--execute] [--stack <name>]");
    process.exit(1);
  }
  const { userPoolId, clientId } = await resolveStackConfig(args.stack);
  const cognito = cognitoClient();
  const log = (m: string) => console.log(m);

  if (!args.execute) {
    const existing = await findUser(cognito, userPoolId, args.email);
    console.log(`\nDRY-RUN for ${args.email}`);
    console.log(
      existing
        ? `  already provisioned (status ${existing.status ?? "?"}) — would send a fresh magic link.`
        : "  would provision (create + confirm, no Cognito email) and send a magic link.",
    );
    console.log("\nRe-run with --execute to do it.\n");
    return;
  }

  console.log(`\nINVITING ${args.email}`);
  const { user } = await provisionUser(cognito, userPoolId, args.email, log);
  await sendMagicLink(cognito, userPoolId, clientId, user.username, log);
  console.log(
    `\n✅ ${args.email} can now sign in — the magic-link email is on its way (tell them to check spam; new-sender mail can land there while the domain warms up).\n`,
  );
}

main().catch((err) => {
  console.error("invite-user failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
