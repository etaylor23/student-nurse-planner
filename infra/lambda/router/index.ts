import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";
import { makeDocClient } from "../../../src/data/dynamo/dynamoClient";
import { DynamoRepository } from "../../../src/data/dynamo/dynamoRepository";
import { makeAuthorize, type Tier, type Verb } from "../../../src/data/dynamo/authorize";

/**
 * Interactive RPC router Lambda (spec-backend-dynamodb.md §3).
 *
 * - `GET  /api/health` — liveness (guarded by the Cognito JWT authorizer → 401 w/o token).
 * - `POST /api/rpc`    — `{ method, args }` dispatch. The principal (`sub`, `email`) is
 *   derived from the VERIFIED JWT claims (never the client). Every call passes the
 *   single AVP authorize() gate, then a per-request DynamoRepository bound to that
 *   principal. Only the Phase 1 allow-listed methods are dispatchable.
 */
const TABLE = process.env.TABLE_NAME as string;
const POLICY_STORE_ID = process.env.POLICY_STORE_ID as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;

const doc = makeDocClient();
const authorize = makeAuthorize({
  client: new VerifiedPermissionsClient({}),
  policyStoreId: POLICY_STORE_ID,
});

/** Method → (verb, tier). This map is also the dispatch allow-list. Phase 1 slice only;
 *  all EvidenceRecord tier (reflections/self-care come in Phase 2 as SensitiveRecord). */
const METHODS: Record<string, { verb: Verb; tier: Tier }> = {
  getCurrentUser: { verb: "Read", tier: "EvidenceRecord" },
  updateUser: { verb: "Update", tier: "EvidenceRecord" },
  resetDatabase: { verb: "Delete", tier: "EvidenceRecord" },
  getBreakRules: { verb: "List", tier: "EvidenceRecord" },
  saveBreakRules: { verb: "Update", tier: "EvidenceRecord" },
  resetBreakRules: { verb: "Delete", tier: "EvidenceRecord" },
  listPlacements: { verb: "List", tier: "EvidenceRecord" },
  createPlacement: { verb: "Create", tier: "EvidenceRecord" },
  updatePlacement: { verb: "Update", tier: "EvidenceRecord" },
  deletePlacement: { verb: "Delete", tier: "EvidenceRecord" },
  listShifts: { verb: "List", tier: "EvidenceRecord" },
  getShift: { verb: "Read", tier: "EvidenceRecord" },
  createShift: { verb: "Create", tier: "EvidenceRecord" },
  updateShift: { verb: "Update", tier: "EvidenceRecord" },
  deleteShift: { verb: "Delete", tier: "EvidenceRecord" },
  createLogItem: { verb: "Create", tier: "EvidenceRecord" },
  listLogItems: { verb: "List", tier: "EvidenceRecord" },
};

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const http = event.requestContext.http;
  const path = http.path;
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email : undefined;

  if (http.method === "GET" && path.endsWith("/health")) {
    return json(200, {
      status: "ok",
      service: "nurse-planner-api",
      sub: sub || null,
      time: new Date().toISOString(),
    });
  }

  if (http.method === "POST" && path.endsWith("/rpc")) {
    if (!sub) return json(401, { error: "unauthenticated" });

    let payload: { method?: unknown; args?: unknown };
    try {
      payload = JSON.parse(event.body ?? "{}");
    } catch {
      return json(400, { error: "bad_json" });
    }
    const method = typeof payload.method === "string" ? payload.method : "";
    const args = Array.isArray(payload.args) ? payload.args : [];
    const spec = METHODS[method];
    if (!spec) return json(404, { error: "unknown_method", method });

    const identityToken = (event.headers?.authorization ?? event.headers?.Authorization ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    // resourceId: a concrete id where args[0] is one, else a scope marker. In v1 the
    // decision only turns on owner==principal (ownerSub = the caller), so this is
    // informational for the authz decision but useful in the audit trail later.
    const resourceId = typeof args[0] === "string" ? args[0] : `scope:${spec.tier}`;
    // AVP's Cognito identity source derives the principal id as `<userPoolId>|<sub>`; the
    // owner attribute must use the same form for the owner-all policy to match. DynamoDB
    // keys still use the bare sub.
    const allowed = await authorize({
      identityToken,
      action: spec.verb,
      tier: spec.tier,
      resourceId,
      ownerId: `${USER_POOL_ID}|${sub}`,
    });
    if (!allowed) return json(403, { error: "forbidden", method });

    const repo = new DynamoRepository({ doc, tableName: TABLE, principal: { sub, email } });
    const fn = (repo as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    try {
      const result = await fn.apply(repo, args);
      return json(200, { result });
    } catch (err) {
      return json(500, { error: "internal", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return json(404, { error: "not_found", method: http.method, path });
};
