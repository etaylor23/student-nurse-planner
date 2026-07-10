import {
  IsAuthorizedWithTokenCommand,
  type VerifiedPermissionsClient,
} from "@aws-sdk/client-verifiedpermissions";

export type Verb = "Read" | "List" | "Create" | "Update" | "Delete";
export type Tier = "SensitiveRecord" | "EvidenceRecord" | "Reference";

const NS = "NursePlanner";

export interface AuthorizeDeps {
  client: VerifiedPermissionsClient;
  policyStoreId: string;
  /** Allow-decision cache TTL. Spec §4.4: a few seconds absorbs AVP latency/blips. */
  cacheTtlMs?: number;
}

export interface AuthorizeRequest {
  /** The Cognito ID token (token_use=id) — AVP derives the principal from it. */
  identityToken: string;
  action: Verb;
  tier: Tier;
  /** Concrete resource id, or a scope marker for List/Create. */
  resourceId: string;
  /**
   * The resource owner's AVP principal entity id. AVP's Cognito identity source derives
   * the principal id as `<userPoolId>|<sub>` (NOT the bare sub), so owner-all only matches
   * when this uses the same form. In v1 (owner-scoped) this is always the caller's own id.
   */
  ownerId: string;
}

/**
 * The single authorization gate (spec-backend-dynamodb.md §4). Calls AVP
 * IsAuthorizedWithToken against the v1 owner-all policy: the principal (from the token)
 * may act on a resource whose `owner` attribute equals the principal.
 *
 * - **Fail-closed:** any AVP error → deny.
 * - **Short-TTL allow cache:** recent allow decisions are memoised in-Lambda.
 */
export function makeAuthorize(deps: AuthorizeDeps) {
  const ttl = deps.cacheTtlMs ?? 5000;
  const cache = new Map<string, number>(); // key -> expiry (epoch ms)

  return async function authorize(req: AuthorizeRequest): Promise<boolean> {
    const key = `${req.identityToken.slice(-24)}|${req.action}|${req.tier}|${req.resourceId}|${req.ownerId}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit > now) return true;

    try {
      const out = await deps.client.send(
        new IsAuthorizedWithTokenCommand({
          policyStoreId: deps.policyStoreId,
          identityToken: req.identityToken,
          action: { actionType: `${NS}::Action`, actionId: req.action },
          resource: { entityType: `${NS}::${req.tier}`, entityId: req.resourceId },
          entities: {
            entityList: [
              {
                identifier: { entityType: `${NS}::${req.tier}`, entityId: req.resourceId },
                attributes: {
                  owner: {
                    entityIdentifier: { entityType: `${NS}::User`, entityId: req.ownerId },
                  },
                },
                parents: [],
              },
            ],
          },
        }),
      );
      const allow = out.decision === "ALLOW";
      if (allow) cache.set(key, now + ttl);
      return allow;
    } catch {
      return false; // fail-closed
    }
  };
}
