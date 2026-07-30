/**
 * Shared helpers for the PlaceMate beta-operator scripts (delete-user / invite-user /
 * send-pre-welcome-email). All AWS access uses the ambient credentials (run with
 * AWS_PROFILE=personal). Nothing here sends or deletes on import — the scripts drive it,
 * and default to dry-run.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { randomBytes } from "node:crypto";

export const REGION = process.env.AWS_REGION || "eu-west-2";
export const STACK = process.env.STACK_NAME || "NursePlanner-dev";
/** Where magic links redirect (must be an allowed origin in infra/lib/config.ts). */
export const APP_ORIGIN = process.env.APP_ORIGIN || "https://app.placemate.uk";

export type Log = (message: string) => void;

// ---------------------------------------------------------------------------
// Config + clients
// ---------------------------------------------------------------------------

export interface StackConfig {
  tableName: string;
  userPoolId: string;
  clientId: string;
  /**
   * Note-capture photo bucket. **Optional on purpose:** the output only exists once a stack
   * carrying the Captures construct is deployed, and erasure must still work (and say what
   * it skipped) against a stack that predates it — rather than crashing halfway through a
   * GDPR request.
   */
  captureBucket?: string;
  /** Note-capture parse Function URL. Optional for the same reason as `captureBucket`. */
  parseUrl?: string;
}

/** Resolve the live table + user-pool + app-client ids from the CloudFormation stack. */
export async function resolveStackConfig(stack = STACK): Promise<StackConfig> {
  const cfn = new CloudFormationClient({ region: REGION });
  const res = await cfn.send(new DescribeStacksCommand({ StackName: stack }));
  const outputs = res.Stacks?.[0]?.Outputs ?? [];
  const get = (k: string) => outputs.find((o) => o.OutputKey === k)?.OutputValue;
  const tableName = get("TableName");
  const userPoolId = get("UserPoolId");
  const clientId = get("UserPoolClientId");
  if (!tableName || !userPoolId || !clientId) {
    throw new Error(`Could not resolve TableName/UserPoolId/UserPoolClientId from stack ${stack}`);
  }
  return {
    tableName,
    userPoolId,
    clientId,
    captureBucket: get("CaptureBucketName"),
    parseUrl: get("AiParseUrl"),
  };
}

export function docClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
}

export function cognitoClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({ region: REGION });
}

export function s3Client(): S3Client {
  return new S3Client({ region: REGION });
}

// ---------------------------------------------------------------------------
// Cognito users
// ---------------------------------------------------------------------------

export interface CognitoUser {
  username: string;
  sub: string;
  status?: string;
}

/** Find a user by email (non-alias Username + the `sub` attribute), or null. */
export async function findUser(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
): Promise<CognitoUser | null> {
  const res = await cognito.send(
    new ListUsersCommand({ UserPoolId: userPoolId, Filter: `email = "${email}"`, Limit: 2 }),
  );
  const users = res.Users ?? [];
  if (users.length === 0) return null;
  if (users.length > 1) throw new Error(`Multiple Cognito users match ${email} — resolve by hand`);
  const u = users[0];
  const sub = u.Attributes?.find((a) => a.Name === "sub")?.Value ?? u.Username!;
  return { username: u.Username!, sub, status: u.UserStatus };
}

/** A random password that satisfies the default Cognito policy — used only to move an
 * admin-created user to CONFIRMED. It's never usable to sign in (the app client allows
 * only CUSTOM_AUTH / magic-link, not password auth) and is discarded immediately. */
function throwawayPassword(): string {
  return `${randomBytes(24)
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "")}aA1!`;
}

/**
 * Provision a magic-link-ready user for `email`, idempotently. If they already exist,
 * returns them untouched. Otherwise AdminCreateUser with the invite SUPPRESSED (no Cognito
 * email), then set a throwaway permanent password so status becomes CONFIRMED (a passwordless
 * pool can't magic-link a FORCE_CHANGE_PASSWORD user).
 */
export async function provisionUser(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
  log: Log,
): Promise<{ user: CognitoUser; created: boolean }> {
  const existing = await findUser(cognito, userPoolId, email);
  if (existing) {
    log(`Already provisioned: ${email} (status ${existing.status ?? "?"}) — leaving as is.`);
    return { user: existing, created: false };
  }
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
      ],
      MessageAction: "SUPPRESS", // no Cognito default invite email
    }),
  );
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: throwawayPassword(),
      Permanent: true, // → CONFIRMED; password is unusable (no password-auth flow)
    }),
  );
  const user = await findUser(cognito, userPoolId, email);
  if (!user) throw new Error(`Provisioned ${email} but couldn't read it back`);
  log(`Provisioned ${email} (CONFIRMED, no email sent).`);
  return { user, created: true };
}

/**
 * Send a branded magic-link sign-in email to a provisioned user. Drives the passwordless
 * custom-auth flow's TWO steps: initiate (issues PROVIDE_AUTH_PARAMETERS), then respond with
 * the MAGIC_LINK metadata — the respond step is what actually sends the email.
 */
export async function sendMagicLink(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  clientId: string,
  username: string,
  log: Log,
): Promise<void> {
  const init = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "CUSTOM_AUTH",
      AuthParameters: { USERNAME: username },
    }),
  );
  const uname = init.ChallengeParameters?.USERNAME ?? username;
  await cognito.send(
    new AdminRespondToAuthChallengeCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      ChallengeName: "CUSTOM_CHALLENGE",
      Session: init.Session,
      ChallengeResponses: { USERNAME: uname, ANSWER: "__dummy__" },
      ClientMetadata: {
        signInMethod: "MAGIC_LINK",
        redirectUri: APP_ORIGIN,
        alreadyHaveMagicLink: "no",
        // Marks this as a first-touch beta invite so create-auth-challenge renders the warm
        // welcome/invite copy. Only this admin path sets it; the app's own sign-in requests
        // don't, so routine sign-ins get the plain "Your sign-in link" email.
        invite: "true",
      },
    }),
  );
  log(`Magic-link email sent to the address for ${username}.`);
}

/** Delete the Cognito user (the account/email). */
export async function deleteCognitoUser(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  username: string,
  log: Log,
): Promise<void> {
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
  log(`Deleted Cognito user ${username}.`);
}

// ---------------------------------------------------------------------------
// DynamoDB data erasure (whole partition incl. tombstones + cross-partition grants)
// ---------------------------------------------------------------------------

type Key = { PK: string; SK: string };

export interface EraseResult {
  partitionItems: number;
  counterparts: number;
  /** Rows in the sibling `AI#<sub>` partition — chat threads/messages + daily counters. */
  aiItems: number;
}

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
 * live in OTHER users' partitions and reference this user (see src/data/dynamo/
 * relationships.ts for the SK shapes). Deleting only the user's own partition would leave
 * these dangling.
 */
export function deriveCounterparts(sub: string, items: Record<string, unknown>[]): Key[] {
  const out: Key[] = [];
  for (const it of items) {
    const sk = String(it.SK);
    if (sk.startsWith("SHARE#")) {
      out.push({
        PK: `USER#${String(it.grantee)}`,
        SK: `SHAREDWITHME#${sub}#${String(it.entityType)}#${String(it.resourceId)}`,
      });
    } else if (sk.startsWith("SHAREDWITHME#")) {
      out.push({
        PK: `USER#${String(it.owner)}`,
        SK: `SHARE#${String(it.entityType)}#${String(it.resourceId)}#${sub}`,
      });
    } else if (sk.startsWith("MENTOR#")) {
      out.push({ PK: `USER#${String(it.mentor)}`, SK: `MENTEE#${sub}` });
    } else if (sk.startsWith("MENTEE#")) {
      out.push({ PK: `USER#${String(it.student)}`, SK: `MENTOR#${sub}` });
    }
  }
  return out;
}

async function batchDelete(
  doc: DynamoDBDocumentClient,
  tableName: string,
  keys: Key[],
): Promise<void> {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await doc.send(
      new BatchWriteCommand({
        RequestItems: { [tableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })) },
      }),
    );
  }
}

/**
 * Delete all DynamoDB data for a user: their whole partition (incl. soft-delete tombstones)
 * plus the relationship counterparts in other partitions. Cognito-free — exported for tests.
 */
export async function eraseUserData(
  doc: DynamoDBDocumentClient,
  tableName: string,
  sub: string,
  opts: { dryRun: boolean; log?: Log },
): Promise<EraseResult> {
  const log = opts.log ?? (() => {});
  const pk = `USER#${sub}`;
  const items = await queryPartition(doc, tableName, pk);
  const counterparts = deriveCounterparts(sub, items);
  // AI recall deliberately stores chat in a SIBLING partition so it stays out of the sync
  // scan (spec-ai-recall.md D16), which also means a `USER#`-only erasure silently leaves
  // it behind: threads, every question and answer, and the daily counters. Erasure has to
  // know about both partitions or it reports success while retaining personal data.
  const aiPk = `AI#${sub}`;
  const aiItems = await queryPartition(doc, tableName, aiPk);
  log(
    `Partition ${pk}: ${items.length} item(s). Partition ${aiPk}: ${aiItems.length} item(s). ` +
      `Relationship counterparts elsewhere: ${counterparts.length}.`,
  );
  if (opts.dryRun) {
    for (const it of items) log(`  [dry-run] would delete ${pk} / ${String(it.SK)}`);
    for (const it of aiItems) log(`  [dry-run] would delete ${aiPk} / ${String(it.SK)}`);
    for (const c of counterparts) log(`  [dry-run] would delete ${c.PK} / ${c.SK} (counterpart)`);
  } else {
    await batchDelete(doc, tableName, [
      ...counterparts,
      ...items.map((it) => ({ PK: String(it.PK), SK: String(it.SK) })),
      ...aiItems.map((it) => ({ PK: String(it.PK), SK: String(it.SK) })),
    ]);
    log(
      `Deleted ${items.length} partition item(s), ${aiItems.length} AI item(s) and ` +
        `${counterparts.length} counterpart(s).`,
    );
  }
  return {
    partitionItems: items.length,
    counterparts: counterparts.length,
    aiItems: aiItems.length,
  };
}

/**
 * Delete every photographed note page for a user (spec-note-capture.md P1/P13).
 *
 * Photos have NO lifecycle expiry by decision — they back PAD evidence for the length of a
 * degree — so erasure is the only thing that removes them. Without this, `delete-user.ts`
 * would report success while the student's clinical imagery stayed in the bucket
 * indefinitely, which is precisely the risk P2 accepted on the understanding that erasure
 * works.
 *
 * Paginated: a heavy user could exceed one `ListObjectsV2` page, and `DeleteObjects` caps
 * at 1000 keys per call.
 */
export async function eraseUserCaptures(
  s3: S3Client,
  bucket: string,
  sub: string,
  opts: { dryRun: boolean; log?: Log },
): Promise<{ objects: number }> {
  const log = opts.log ?? (() => {});
  const Prefix = `u/${sub}/`;
  const keys: string[] = [];
  let ContinuationToken: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }),
    );
    for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);

  log(`Bucket ${bucket} prefix ${Prefix}: ${keys.length} object(s).`);
  if (opts.dryRun) {
    for (const k of keys) log(`  [dry-run] would delete s3://${bucket}/${k}`);
    return { objects: keys.length };
  }
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
  if (keys.length > 0) log(`Deleted ${keys.length} capture object(s).`);
  return { objects: keys.length };
}

// ---------------------------------------------------------------------------
// Small CLI helpers shared by the scripts
// ---------------------------------------------------------------------------

/** Parse `<email> [--name X] [--execute] [--stack Y]`. Email is the first positional. */
export function parseUserArgs(argv: string[]): {
  email?: string;
  name?: string;
  execute: boolean;
  stack: string;
} {
  const out = { execute: false, stack: STACK } as {
    email?: string;
    name?: string;
    execute: boolean;
    stack: string;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") out.execute = true;
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--stack") out.stack = argv[++i];
    else if (!a.startsWith("--") && !out.email) out.email = a;
  }
  return out;
}
