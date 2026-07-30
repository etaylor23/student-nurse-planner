/**
 * Post an already-uploaded capture photo to the deployed parse endpoint and dump the result.
 *
 * This is the Gate 2 inspection tool (spec-note-capture-implementation.md): it proves the
 * whole four-call pipeline end-to-end against real AWS, with no UI in the way. It needs a
 * real Cognito ID token, so it signs the user in with a magic link — the same admin path
 * `scripts/invite-user.ts` uses.
 *
 *   AWS_PROFILE=personal npx tsx scripts/parse-capture.ts <email> [--key <s3-key>]
 *
 * With no --key it parses the most recent object under the user's prefix.
 */
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { cognitoClient, findUser, parseUserArgs, resolveStackConfig, s3Client } from "./lib/admin";
import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";

/**
 * Mint an ID token for a user without their inbox. The passwordless pool's custom-auth flow
 * issues the magic link on the RESPOND step; passing the link's own secret back is not
 * possible here, so this uses the admin flow's session directly.
 */
async function idTokenFor(userPoolId: string, clientId: string, username: string): Promise<string> {
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
      ChallengeResponses: { USERNAME: username, ANSWER: "__dummy__" },
      ClientMetadata: { signInMethod: "MAGIC_LINK", alreadyHaveMagicLink: "no" },
    }),
  );
  const token = res.AuthenticationResult?.IdToken;
  if (!token) {
    throw new Error(
      "No ID token — the magic-link flow needs the emailed secret. Sign in in the browser " +
        "and paste the token via PARSE_ID_TOKEN=... instead.",
    );
  }
  return token;
}

async function main() {
  const args = parseUserArgs(process.argv.slice(2));
  const keyArg = process.argv.includes("--key")
    ? process.argv[process.argv.indexOf("--key") + 1]
    : undefined;
  if (!args.email) {
    console.error("Usage: parse-capture.ts <email> [--key <s3-key>] [--stack <name>]");
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
      captureId: key.split("/")[2] ?? "cap-unknown0000",
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

  const out = JSON.parse(body) as {
    pageDateRaw: string | null;
    wardHint: string | null;
    corrections: string[];
    blocks: Array<{
      text: string;
      kind: string;
      targetType?: string;
      candidateCodes: string[];
      tags: string[];
      medicationCandidate?: string;
      disputedWords: string[];
      gibbs?: Record<string, string>;
      confidence: number;
    }>;
    diagnostics: Record<string, unknown>;
  };

  console.log(
    `pageDateRaw: ${JSON.stringify(out.pageDateRaw)}   wardHint: ${JSON.stringify(out.wardHint)}`,
  );
  if (out.corrections.length) console.log(`corrections: ${out.corrections.join("  ·  ")}`);
  console.log("");
  out.blocks.forEach((b, i) => {
    console.log(
      `── BLOCK ${i + 1}  ${b.kind}${b.targetType ? ` → ${b.targetType}` : ""}  selfConf=${b.confidence}`,
    );
    console.log(`   ${b.text.replace(/\n/g, "\n   ")}`);
    if (b.candidateCodes.length)
      console.log(`   codes: ${b.candidateCodes.join(", ")}  (first is pre-selected)`);
    if (b.tags.length) console.log(`   tags: ${b.tags.join(", ")}`);
    if (b.medicationCandidate) console.log(`   medication: ${b.medicationCandidate}`);
    if (b.gibbs) console.log(`   gibbs: ${Object.keys(b.gibbs).join(", ")}`);
    if (b.disputedWords.length) console.log(`   ⚠ confirm: ${b.disputedWords.join("  ·  ")}`);
    console.log("");
  });
  console.log("diagnostics:", JSON.stringify(out.diagnostics, null, 2));
}

main().catch((err) => {
  console.error("parse-capture failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
