import { CognitoJwtVerifier } from "aws-jwt-verify";

/**
 * Function URL auth (spec-ai-recall.md D7): the SPA sends the SAME Cognito ID token it
 * already holds for the RPC API. There is no API Gateway authorizer on this path, so we
 * verify the JWT in-Lambda, then the caller flows into the same AVP authorize() gate the
 * router uses (token_use=id, matching IsAuthorizedWithToken).
 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID as string,
  tokenUse: "id",
  clientId: process.env.USER_POOL_CLIENT_ID as string,
});

export interface VerifiedCaller {
  sub: string;
  email: string;
  /** The raw ID token — forwarded to AVP IsAuthorizedWithToken. */
  identityToken: string;
}

/** Returns the verified caller, or null when the token is missing/invalid/expired. */
export async function verifyCaller(
  headers: Record<string, string | undefined> | undefined,
): Promise<VerifiedCaller | null> {
  const raw = (headers?.authorization ?? headers?.Authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  try {
    const payload = await verifier.verify(raw);
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      identityToken: raw,
    };
  } catch {
    return null;
  }
}
