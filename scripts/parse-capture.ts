/**
 * Post a capture photo to the deployed parse endpoint and dump the result.
 *
 * This is the Gate 2 inspection tool (spec-note-capture-implementation.md): it proves the
 * whole four-call pipeline end-to-end against real AWS, with no UI in the way. It needs a
 * real Cognito ID token, so it signs the user in with a magic link — the same admin path
 * `scripts/invite-user.ts` uses.
 *
 *   AWS_PROFILE=personal npx tsx scripts/parse-capture.ts <email> [--key <s3-key>]
 *   AWS_PROFILE=personal npx tsx scripts/parse-capture.ts <email> --file tests/pages/real-medications.png
 *
 * `--file` replicates what the client does before upload — downscale to 2400px JPEG q85
 * (`src/react/components/capture/downscale.ts`) — then PUTs the bytes at the content-addressed
 * key the presign would have derived (`u/<sub>/h/<sha256>/page.jpg`, P41) and parses that.
 * With neither flag it parses the most recent object under the user's prefix.
 *
 * The endpoint streams SSE (P40): stage markers, then `transcribed`, then `blocks`, then
 * `done`. This consumes the stream and prints each stage as it lands, which doubles as a
 * check that the staging itself works.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  APP_ORIGIN,
  cognitoClient,
  findUser,
  parseUserArgs,
  resolveStackConfig,
  s3Client,
} from "./lib/admin";
import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";

/**
 * Mint an ID token for a user without their inbox, by building the magic link ourselves.
 *
 * This is exactly what the CreateAuthChallenge Lambda does (`amazon-cognito-passwordless-auth`
 * `magic-link.js`), done with the same admin credentials every other script here uses: sign
 * `{userName, iat, exp}` with the pool's KMS key, store the salted hashes in the secrets
 * table, then answer the custom challenge with the link's fragment. No email is sent —
 * `alreadyHaveMagicLink: "yes"` short-circuits the send — so the harness can run the corpus
 * repeatedly without spamming the account's inbox.
 *
 * Config (KMS alias, secrets table, salt) is read from the CreateAuthChallenge function's own
 * environment rather than duplicated here, so a stack change can't silently desync it.
 */
async function idTokenFor(userPoolId: string, clientId: string, username: string): Promise<string> {
  const { GetFunctionConfigurationCommand, LambdaClient, ListFunctionsCommand } =
    await import("@aws-sdk/client-lambda");
  const { KMSClient, SignCommand } = await import("@aws-sdk/client-kms");
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, PutCommand } = await import("@aws-sdk/lib-dynamodb");
  const { createHash } = await import("node:crypto");

  // Find the CreateAuthChallenge function and read its magic-link config.
  const lambda = new LambdaClient({});
  let marker: string | undefined;
  let fnName: string | undefined;
  do {
    const page = await lambda.send(new ListFunctionsCommand({ Marker: marker }));
    fnName = page.Functions?.find((f) =>
      f.FunctionName?.includes("AuthPasswordlessCreateAuthChallen"),
    )?.FunctionName;
    marker = page.NextMarker;
  } while (!fnName && marker);
  if (!fnName) throw new Error("No CreateAuthChallenge function found — is the stack deployed?");
  const env = (await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fnName })))
    .Environment?.Variables;
  const kmsKeyId = env?.KMS_KEY_ID;
  const secretsTable = env?.DYNAMODB_SECRETS_TABLE;
  const salt = env?.STACK_ID;
  if (!kmsKeyId || !secretsTable || !salt) {
    throw new Error(`Magic-link config missing on ${fnName}`);
  }

  // Build and sign the link message, the same bytes the Lambda would sign.
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 120; // the harness signs in immediately; no need for the emailed 7 days
  const message = Buffer.from(JSON.stringify({ userName: username, iat, exp }));
  const messageContext = Buffer.from(JSON.stringify({ userPoolId, clientId }));
  const { Signature: signature } = await new KMSClient({}).send(
    new SignCommand({
      KeyId: kmsKeyId,
      Message: createHash("sha512")
        .end(Buffer.concat([message, messageContext]))
        .digest(),
      SigningAlgorithm: "RSASSA_PSS_SHA_512",
      MessageType: "DIGEST",
    }),
  );
  if (!signature) throw new Error("KMS signing failed");

  // Store the salted hashes so VerifyAuthChallenge accepts the answer (single-use row).
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await ddb.send(
    new PutCommand({
      TableName: secretsTable,
      Item: {
        userNameHash: createHash("sha256").update(salt).end(username).digest(),
        signatureHash: createHash("sha256").update(salt).end(Buffer.from(signature)).digest(),
        iat,
        exp,
        kmsKeyId,
      },
    }),
  );

  const answer = `${message.toString("base64url")}.${Buffer.from(signature).toString("base64url")}`;
  const cognito = cognitoClient();
  const init = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "CUSTOM_AUTH",
      AuthParameters: { USERNAME: username },
    }),
  );
  const res = await cognito.send(
    new AdminRespondToAuthChallengeCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      ChallengeName: "CUSTOM_CHALLENGE",
      Session: init.Session,
      ChallengeResponses: { USERNAME: username, ANSWER: answer },
      ClientMetadata: {
        signInMethod: "MAGIC_LINK",
        redirectUri: APP_ORIGIN,
        alreadyHaveMagicLink: "yes",
      },
    }),
  );
  const token = res.AuthenticationResult?.IdToken;
  if (!token) {
    throw new Error(
      "No ID token — the minted magic link was not accepted. Sign in in the browser " +
        "and paste the token via PARSE_ID_TOKEN=... instead.",
    );
  }
  return token;
}

/**
 * Client-parity image prep (downscale.ts): JPEG q85, long edge capped at 2400px, never
 * upscaled. Uses ImageMagick because Node has no canvas; `-auto-orient` stands in for
 * `createImageBitmap` honouring EXIF.
 */
function downscaleLikeClient(path: string): Buffer {
  return execFileSync(
    "magick",
    [path, "-auto-orient", "-resize", "2400x2400>", "-quality", "85", "jpg:-"],
    { maxBuffer: 32 * 1024 * 1024 },
  );
}

/** One SSE frame from the parse stream. */
interface Frame {
  event: string;
  data: Record<string, unknown>;
}

/** Split an SSE body into frames. The stream is small enough to buffer whole. */
function sseFrames(body: string): Frame[] {
  const frames: Frame[] = [];
  for (const chunk of body.split("\n\n")) {
    const event = /^event: (.+)$/m.exec(chunk)?.[1];
    const data = /^data: (.+)$/m.exec(chunk)?.[1];
    if (!event || !data) continue;
    try {
      frames.push({ event, data: JSON.parse(data) as Record<string, unknown> });
    } catch {
      console.warn(`unparseable ${event} frame`);
    }
  }
  return frames;
}

async function main() {
  const args = parseUserArgs(process.argv.slice(2));
  const keyArg = process.argv.includes("--key")
    ? process.argv[process.argv.indexOf("--key") + 1]
    : undefined;
  const fileArg = process.argv.includes("--file")
    ? process.argv[process.argv.indexOf("--file") + 1]
    : undefined;
  if (!args.email || (keyArg && fileArg)) {
    console.error(
      "Usage: parse-capture.ts <email> [--key <s3-key> | --file <photo>] [--stack <name>]",
    );
    process.exit(1);
  }

  const cfg = await resolveStackConfig(args.stack);
  if (!cfg.captureBucket) throw new Error("Stack has no CaptureBucketName output — deploy first.");
  const parseUrl = process.env.PARSE_URL ?? cfg.parseUrl;
  if (!parseUrl) throw new Error("Stack has no AiParseUrl output — deploy parseFn first.");

  const user = await findUser(cognitoClient(), cfg.userPoolId, args.email);
  if (!user?.sub) throw new Error(`No Cognito user for ${args.email}`);

  // Find the photo to parse.
  let key = keyArg;
  if (fileArg) {
    // Same bytes, same key, as the app: downscale like the client, then the content-addressed
    // key the presign derives (P41). Admin-PUT rather than presign because this is a harness
    // with the bucket in reach — the parse call itself is still the real deployed path.
    const jpeg = downscaleLikeClient(fileArg);
    const hash = createHash("sha256").update(jpeg).digest("hex");
    key = `u/${user.sub}/h/${hash}/page.jpg`;
    await s3Client().send(
      new PutObjectCommand({
        Bucket: cfg.captureBucket,
        Key: key,
        Body: jpeg,
        ContentType: "image/jpeg",
      }),
    );
    console.log(`uploaded ${fileArg} (${jpeg.length} bytes downscaled)`);
  }
  if (!key) {
    const listed = await s3Client().send(
      new ListObjectsV2Command({ Bucket: cfg.captureBucket, Prefix: `u/${user.sub}/` }),
    );
    const newest = (listed.Contents ?? []).sort(
      (a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
    )[0];
    if (!newest?.Key) throw new Error(`No captures under u/${user.sub}/ — upload one first.`);
    key = newest.Key;
  }
  console.log(`\nparsing s3://${cfg.captureBucket}/${key}\n`);

  const token =
    process.env.PARSE_ID_TOKEN ?? (await idTokenFor(cfg.userPoolId, cfg.clientId, user.username));

  const t0 = Date.now();
  const res = await fetch(parseUrl.replace(/\/$/, ""), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      // The content-addressed key (P41) carries no capture id, so send a harness marker —
      // the endpoint only checks the SAFE_ID shape, and the parse itself never reads it.
      captureId: "cap-harness0000",
      imageKey: key,
      imageIndex: 0,
      // Stand-in for what the client sends from Dexie (P32).
      context: {
        medicationNames: ["Aciclovir", "Co-trimoxazole"],
        tagLabels: ["haematology"],
        placementName: "Ward 9",
        placementSetting: "acute inpatient",
      },
    }),
  });
  const body = await res.text();
  console.log(`HTTP ${res.status} in ${Date.now() - t0}ms\n`);
  if (!res.ok) {
    console.log(body.slice(0, 800));
    process.exit(2);
  }

  // The endpoint streams SSE (P40). Buffered here — the harness cares about the frames, not
  // the pacing; the review UI is where progressive rendering earns its keep.
  const frames = sseFrames(body);
  for (const f of frames.filter((x) => x.event === "stage")) {
    console.log(`· stage: ${String(f.data.stage)}`);
  }
  const error = frames.find((f) => f.event === "error");
  if (error) {
    console.error(`\nERROR frame: ${JSON.stringify(error.data)}`);
    process.exit(2);
  }

  interface BlockOut {
    text: string;
    kind: string;
    targetType?: string;
    candidateCodes: string[];
    tags: string[];
    medicationCandidate?: string;
    disputedWords: string[];
    gibbs?: Record<string, string>;
    diagramSource?: string;
    confidence: number;
    bbox?: Record<string, number>;
  }
  const blocksFrame = frames.find((f) => f.event === "blocks")?.data as
    | {
        pageDateRaw: string | null;
        wardHint: string | null;
        corrections: string[];
        blocks: BlockOut[];
      }
    | undefined;
  if (!blocksFrame) {
    console.error(
      "\nNo blocks frame in the stream — frames seen:",
      frames.map((f) => f.event),
    );
    process.exit(2);
  }

  console.log(
    `\npageDateRaw: ${JSON.stringify(blocksFrame.pageDateRaw)}   wardHint: ${JSON.stringify(blocksFrame.wardHint)}`,
  );
  if (blocksFrame.corrections.length) {
    console.log(`corrections: ${blocksFrame.corrections.join("  ·  ")}`);
  }
  console.log("");
  blocksFrame.blocks.forEach((b, i) => {
    console.log(
      `── BLOCK ${i + 1}  ${b.kind}${b.targetType ? ` → ${b.targetType}` : ""}  selfConf=${b.confidence}`,
    );
    console.log(`   ${b.text.replace(/\n/g, "\n   ")}`);
    if (b.candidateCodes.length)
      console.log(`   codes: ${b.candidateCodes.join(", ")}  (first is pre-selected)`);
    if (b.tags.length) console.log(`   tags: ${b.tags.join(", ")}`);
    if (b.medicationCandidate) console.log(`   medication: ${b.medicationCandidate}`);
    if (b.gibbs) console.log(`   gibbs: ${Object.keys(b.gibbs).join(", ")}`);
    if (b.diagramSource)
      console.log(`   mermaid:\n      ${b.diagramSource.replace(/\n/g, "\n      ")}`);
    if (b.disputedWords.length) console.log(`   ⚠ confirm: ${b.disputedWords.join("  ·  ")}`);
    console.log("");
  });
  const done = frames.find((f) => f.event === "done");
  if (done) console.log("diagnostics:", JSON.stringify(done.data.diagnostics, null, 2));
}

main().catch((err) => {
  console.error("parse-capture failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
