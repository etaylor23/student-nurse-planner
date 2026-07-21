/**
 * Remove a beta user: delete ALL their DynamoDB data (their whole partition incl.
 * soft-delete tombstones + the share/mentorship counterparts in other users' partitions)
 * and their Cognito account. This is also the GDPR-erasure tool (see docs/runbooks/erasure.md).
 *
 * Dry-run by default — prints what it would delete and changes nothing. Add --execute to act.
 *
 *   AWS_PROFILE=personal npx tsx scripts/delete-user.ts someone@example.com
 *   AWS_PROFILE=personal npx tsx scripts/delete-user.ts someone@example.com --execute
 */
import {
  cognitoClient,
  deleteCognitoUser,
  docClient,
  eraseUserData,
  findUser,
  parseUserArgs,
  resolveStackConfig,
} from "./lib/admin";

async function main() {
  const args = parseUserArgs(process.argv.slice(2));
  if (!args.email) {
    console.error("Usage: delete-user.ts <email> [--execute] [--stack <name>]");
    process.exit(1);
  }
  const { tableName, userPoolId } = await resolveStackConfig(args.stack);
  const cognito = cognitoClient();
  const doc = docClient();

  const user = await findUser(cognito, userPoolId, args.email);
  const mode = args.execute ? "DELETING" : "DRY-RUN for";
  console.log(`\n${mode} ${args.email}${user ? ` (sub ${user.sub})` : " — no Cognito account found"}\n`);

  if (user) {
    await eraseUserData(doc, tableName, user.sub, {
      dryRun: !args.execute,
      log: (m) => console.log(m),
    });
    if (args.execute) {
      await deleteCognitoUser(cognito, userPoolId, user.username, (m) => console.log(m));
    }
  } else {
    console.log("Nothing in DynamoDB to scope without a sub — if data exists, delete by sub via the runbook.");
  }

  if (!args.execute) {
    console.log("\nDry run only — re-run with --execute to delete the above + the Cognito user.");
  } else {
    console.log("\n✅ AWS data + account removed.");
  }
  console.log("Manual tail (not in AWS):");
  console.log("  • Sentry (EU project): delete this user's events + User Feedback by user id.");
  console.log("  • hello@ inbox: delete their emails if requested.");
  console.log("  • Point-in-time table backups roll off automatically within ~35 days.\n");
}

main().catch((err) => {
  console.error("delete-user failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
