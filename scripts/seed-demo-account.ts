/**
 * Seed a real account with a third-year student's worth of data — a demo environment
 * with enough depth to show every screen, and enough SPECIFIC note content to demo AI
 * recall ("what did I write about taking a manual BP?").
 *
 * Writes SERVER-SIDE through `DynamoRepository`, so the data is already in the account's
 * DynamoDB partition: the AI corpus can see it immediately, and the user's client pulls
 * it down on next sync. Additive — nothing is deleted, so existing real data survives.
 *
 * Dry-run by default. Add --execute to write.
 *
 *   AWS_PROFILE=personal npx tsx scripts/seed-demo-account.ts someone@example.com
 *   AWS_PROFILE=personal npx tsx scripts/seed-demo-account.ts someone@example.com --execute
 */
import { cognitoClient, docClient, findUser, parseUserArgs, resolveStackConfig } from "./lib/admin";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { seedThirdYearDemo } from "./lib/demoThirdYear";

async function main() {
  const args = parseUserArgs(process.argv.slice(2));
  if (!args.email) {
    console.error("Usage: seed-demo-account.ts <email> [--execute] [--stack <name>]");
    process.exit(1);
  }

  const { tableName, userPoolId } = await resolveStackConfig(args.stack);
  const user = await findUser(cognitoClient(), userPoolId, args.email);
  if (!user) {
    console.error(`No Cognito user for ${args.email} — invite them first.`);
    process.exit(1);
  }
  // The Dynamo partition is keyed by the Cognito `sub`, not the username/email.
  const sub = user.sub;
  if (!sub) {
    console.error(`User ${args.email} has no sub attribute.`);
    process.exit(1);
  }

  const repo = new DynamoRepository({
    doc: docClient(),
    tableName,
    principal: { sub, email: args.email },
  });

  // Show what is already there — this script is additive, so the operator should see
  // whether they are about to pile a demo dataset on top of real content.
  const [placements, shifts, reflections] = await Promise.all([
    repo.listPlacements(sub),
    repo.listShifts(sub),
    repo.listReflections(sub),
  ]);
  console.log(`\nTarget: ${args.email}`);
  console.log(`  sub:   ${sub}`);
  console.log(`  table: ${tableName}`);
  console.log(
    `  existing: ${placements.length} placements · ${shifts.length} shifts · ${reflections.length} reflections`,
  );

  // A demo environment should be reproducible, and this script is additive — so a
  // re-run after a partial failure would double everything. `--reset` clears the
  // account's own data first (never reference data) so the result is deterministic.
  const reset = process.argv.includes("--reset");
  if (reset) console.log("  --reset: existing user data will be cleared first");

  if (!args.execute) {
    console.log("\nDRY-RUN — would add a third-year dataset (~2.5 years of use):");
    console.log("  6 placements across 3 years + ~180 shifts (notes on ~half)");
    console.log("  6 reflections with full Gibbs sections + tags");
    console.log("  12 medications + conditions + 28 medication logs");
    console.log("  ~20 clinical skills staged, several PAD-signed");
    console.log("  ~45 NMC proficiencies with status history + evidence links");
    console.log("  revision targets/topics/sessions, 24 self-care check-ins, 18 calc drills");
    console.log("\nAdditive — nothing is deleted. Re-run with --execute to write.\n");
    return;
  }

  if (reset) {
    console.log("\nCLEARING existing data for this account…");
    await repo.resetDatabase();
  }
  console.log("\nSEEDING…");
  const counts = await seedThirdYearDemo(repo, sub, (m) => console.log(m));
  console.log("\nDone:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log("\nThe account's client will pull this down on its next sync (or a page reload).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
