/**
 * GDPR erasure — delete a beta user's Cognito account and ALL their data.
 *
 * Usage (dry-run is the default; nothing is deleted without --execute):
 *   AWS_PROFILE=personal npx tsx scripts/erase-user.ts --email someone@example.com
 *   AWS_PROFILE=personal npx tsx scripts/erase-user.ts --sub <cognito-sub> --execute
 *
 * What it deletes (the honest erasure our privacy policy promises):
 *   1. Every item in the user's DynamoDB partition (PK=USER#<sub>) — their domain rows
 *      AND soft-delete tombstones (which retain pre-image content for ~90 days).
 *   2. The counterpart relationship rows that live in OTHER users' partitions (share/
 *      mentorship mirrors), so no dangling grant references the erased user.
 *   3. The Cognito user (so the email/account is gone).
 *
 * It then prints the manual tail (Sentry, the hello@ inbox) that isn't in AWS. See the
 * runbook at docs/runbooks/erasure.md. Point-in-time backups of the table roll off within
 * ~35 days automatically (disclosed in the privacy policy).
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

type Key = { PK: string; SK: string };

export interface EraseResult {
  partitionItems: number;
  counterparts: number;
}

/** Read every item in a partition (paginated). */
async function queryPartition(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey,
      }),
    );
    for (const it of res.Items ?? []) items.push(it as Record<string, unknown>);
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * Given a user's own partition rows, derive the mirror/canonical relationship rows that
 * live in OTHER users' partitions and reference this user (see relationships.ts for the
 * SK shapes). Deleting only the user's own partition would leave these dangling.
 */
export function deriveCounterparts(sub: string, items: Record<string, unknown>[]): Key[] {
  const out: Key[] = [];
  for (const it of items) {
    const sk = String(it.SK);
    if (sk.startsWith("SHARE#")) {
      // Canonical in this user's partition → mirror in the grantee's partition.
      out.push({
        PK: `USER#${String(it.grantee)}`,
        SK: `SHAREDWITHME#${sub}#${String(it.entityType)}#${String(it.resourceId)}`,
      });
    } else if (sk.startsWith("SHAREDWITHME#")) {
      // Mirror in this user's partition → canonical in the owner's partition.
      out.push({
        PK: `USER#${String(it.owner)}`,
        SK: `SHARE#${String(it.entityType)}#${String(it.resourceId)}#${sub}`,
      });
    } else if (sk.startsWith("MENTOR#")) {
      // This user named a mentor → mentee mirror in the mentor's partition.
      out.push({ PK: `USER#${String(it.mentor)}`, SK: `MENTEE#${sub}` });
    } else if (sk.startsWith("MENTEE#")) {
      // This user mentors a student → mentor canonical in the student's partition.
      out.push({ PK: `USER#${String(it.student)}`, SK: `MENTOR#${sub}` });
    }
  }
  return out;
}

/** Batch-delete keys (25 per request, the DynamoDB limit). */
async function batchDelete(
  doc: DynamoDBDocumentClient,
  tableName: string,
  keys: Key[],
): Promise<void> {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
        },
      }),
    );
  }
}

/**
 * Delete all DynamoDB data for a user: their whole partition (incl. tombstones) plus the
 * relationship counterparts in other partitions. Pure of Cognito — exported for tests.
 */
export async function eraseUserData(
  doc: DynamoDBDocumentClient,
  tableName: string,
  sub: string,
  opts: { dryRun: boolean; log?: (m: string) => void },
): Promise<EraseResult> {
  const log = opts.log ?? (() => {});
  const pk = `USER#${sub}`;
  const items = await queryPartition(doc, tableName, pk);
  const counterparts = deriveCounterparts(sub, items);
  log(
    `Partition ${pk}: ${items.length} item(s). Relationship counterparts in other partitions: ${counterparts.length}.`,
  );
  if (opts.dryRun) {
    for (const it of items) log(`  [dry-run] would delete ${pk} / ${String(it.SK)}`);
    for (const c of counterparts) log(`  [dry-run] would delete ${c.PK} / ${c.SK} (counterpart)`);
  } else {
    await batchDelete(doc, tableName, [
      ...counterparts,
      ...items.map((it) => ({ PK: String(it.PK), SK: String(it.SK) })),
    ]);
    log(`Deleted ${items.length} partition item(s) and ${counterparts.length} counterpart(s).`);
  }
  return { partitionItems: items.length, counterparts: counterparts.length };
}

// ---------------------------------------------------------------------------
// CLI wrapper (skipped when imported by tests)
// ---------------------------------------------------------------------------

interface Args {
  email?: string;
  sub?: string;
  execute: boolean;
  stack: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { execute: false, stack: process.env.STACK_NAME || "NursePlanner-dev" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") args.email = argv[++i];
    else if (a === "--sub") args.sub = argv[++i];
    else if (a === "--execute") args.execute = true;
    else if (a === "--stack") args.stack = argv[++i];
  }
  return args;
}

async function resolveStackConfig(
  region: string,
  stack: string,
): Promise<{ tableName: string; userPoolId: string }> {
  const cfn = new CloudFormationClient({ region });
  const res = await cfn.send(new DescribeStacksCommand({ StackName: stack }));
  const outputs = res.Stacks?.[0]?.Outputs ?? [];
  const get = (key: string) => outputs.find((o) => o.OutputKey === key)?.OutputValue;
  const tableName = get("TableName");
  const userPoolId = get("UserPoolId");
  if (!tableName || !userPoolId) {
    throw new Error(`Could not resolve TableName/UserPoolId from stack ${stack}`);
  }
  return { tableName, userPoolId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email && !args.sub) {
    console.error("Usage: erase-user.ts (--email <addr> | --sub <sub>) [--execute] [--stack <name>]");
    process.exit(1);
  }
  const region = process.env.AWS_REGION || "eu-west-2";
  const { tableName, userPoolId } = await resolveStackConfig(region, args.stack);
  const cognito = new CognitoIdentityProviderClient({ region });
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  // Resolve the Cognito user (sub + username) so we can both scope Dynamo and delete the account.
  let sub = args.sub;
  let username: string | undefined;
  if (args.email) {
    const res = await cognito.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${args.email}"`,
        Limit: 2,
      }),
    );
    const users = res.Users ?? [];
    if (users.length === 0) throw new Error(`No Cognito user with email ${args.email}`);
    if (users.length > 1) throw new Error(`Multiple users match ${args.email} — resolve by --sub`);
    username = users[0].Username;
    sub = users[0].Attributes?.find((a) => a.Name === "sub")?.Value ?? username;
  }
  if (!sub) throw new Error("Could not determine the user's sub");

  console.log(`\n${args.execute ? "ERASING" : "DRY-RUN for"} user sub=${sub}${username ? ` (username ${username})` : ""}`);
  console.log(`Table: ${tableName} · Pool: ${userPoolId}\n`);

  const result = await eraseUserData(doc, tableName, sub, {
    dryRun: !args.execute,
    log: (m) => console.log(m),
  });

  if (args.execute) {
    if (username) {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
      console.log(`Deleted Cognito user ${username}.`);
    } else {
      console.log("No Cognito username resolved (sub-only run) — delete the pool user by hand.");
    }
    console.log("\n✅ AWS data erased. Manual tail (not in AWS):");
  } else {
    console.log(`\nDry run only — re-run with --execute to delete the above (${result.partitionItems} + ${result.counterparts} rows) and the Cognito user.`);
    console.log("\nOn --execute, remember the manual tail (not in AWS):");
  }
  console.log("  • Sentry: delete this user's data (User Feedback + events by user id) in the EU project.");
  console.log("  • hello@ inbox: delete their emails if they asked.");
  console.log("  • Note: point-in-time table backups roll off automatically within ~35 days.\n");
}

// Only run the CLI when executed directly, not when imported by a test.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /erase-user\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("Erasure failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
