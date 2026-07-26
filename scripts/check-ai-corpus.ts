/**
 * Inspect the AI recall corpus for a real account, exactly as the ask Lambda builds it.
 *
 * Read-only. Useful for demo prep ("does the AI actually see this?"), for sizing the
 * prompt, and as a standing check that self-care data never leaks into the corpus (D4).
 *
 *   AWS_PROFILE=personal npx tsx scripts/check-ai-corpus.ts someone@example.com
 */
import { cognitoClient, docClient, findUser, parseUserArgs, resolveStackConfig } from "./lib/admin";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { assembleCorpus } from "../infra/lambda/ai/corpus";

async function main() {
  const args = parseUserArgs(process.argv.slice(2));
  if (!args.email) {
    console.error("Usage: check-ai-corpus.ts <email> [--stack <name>]");
    process.exit(1);
  }
  const { tableName, userPoolId } = await resolveStackConfig(args.stack);
  const user = await findUser(cognitoClient(), userPoolId, args.email);
  if (!user?.sub) {
    console.error(`No Cognito user for ${args.email}`);
    process.exit(1);
  }
  const repo = new DynamoRepository({
    doc: docClient(),
    tableName,
    principal: { sub: user.sub, email: args.email },
  });

  const corpus = await assembleCorpus(repo, user.sub);
  const types = [...corpus.text.matchAll(/^\[([A-Z_]+):/gm)].map((m) => m[1]);
  const counts = types.reduce<Record<string, number>>(
    (a, t) => ({ ...a, [t]: (a[t] ?? 0) + 1 }),
    {},
  );

  console.log(`\nCorpus for ${args.email}`);
  console.log(`  blocks:     ${corpus.blocks}`);
  console.log(
    `  characters: ${corpus.text.length} (~${Math.round(corpus.text.length / 4)} tokens)`,
  );
  console.log(`  truncated:  ${corpus.truncated}`);
  console.log(`  by type:    ${JSON.stringify(counts)}`);
  // D4 is a promise, so assert it rather than assume it.
  const leaked = /SELFCARE:/i.test(corpus.text);
  console.log(`  self-care excluded (D4): ${leaked ? "NO — BUG" : "yes"}`);
  const sample = corpus.text.split("\n\n").slice(-1)[0] ?? "";
  console.log(`\n  most recent block:\n    ${sample.slice(0, 300).replace(/\n/g, "\n    ")}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
