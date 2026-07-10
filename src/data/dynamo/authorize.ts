import {
  type AttributeValue,
  IsAuthorizedWithTokenCommand,
  type VerifiedPermissionsClient,
} from "@aws-sdk/client-verifiedpermissions";

export type Verb = "Read" | "List" | "Create" | "Update" | "Delete" | "Share";
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
  /**
   * Phase 4 relationship facts (spec-backend-dynamodb.md §4.5) — the AVP principal entity
   * ids (`<userPoolId>|<sub>` form, same as `ownerId`) the router loaded for THIS request:
   * mentors of the owner (EvidenceRecord only — the mentor-read policy) and per-item share
   * grantees (share-read policy, the only SensitiveRecord cross-user path). Omit/empty for
   * owner-only calls. `mentors` is only meaningful on EvidenceRecord (SensitiveRecord has no
   * `mentors` attribute in the schema), so it is dropped for the Sensitive tier.
   */
  mentors?: string[];
  sharedWith?: string[];
}

/** The single authorization gate as a function — production (AVP) or a test double. */
export type AuthorizeFn = (req: AuthorizeRequest) => Promise<boolean>;

/** A `NursePlanner::User` entity-reference attribute value. */
function userRef(entityId: string): AttributeValue {
  return { entityIdentifier: { entityType: `${NS}::User`, entityId } };
}

/**
 * The single authorization gate (spec-backend-dynamodb.md §4). Calls AVP
 * IsAuthorizedWithToken against the shipped policy set: owner-all (owner == principal),
 * plus the Phase 4 cross-user grants when the router supplies relationship facts —
 * mentor-read (`resource.mentors.contains(principal)`, EvidenceRecord only), share-read
 * (`resource.sharedWith.contains(principal)`), and admin break-glass (the token's
 * `cognito:groups` claim → `principal in Group::"admins"`, carried by the identity source's
 * groupConfiguration — no extra fact needed here).
 *
 * - **Fail-closed:** any AVP error → deny.
 * - **Short-TTL allow cache:** recent allow decisions are memoised in-Lambda. The relationship
 *   facts are part of the cache key, so a cross-user allow never masks an owner-only miss.
 */
export function makeAuthorize(deps: AuthorizeDeps): AuthorizeFn {
  const ttl = deps.cacheTtlMs ?? 5000;
  const cache = new Map<string, number>(); // key -> expiry (epoch ms)

  return async function authorize(req: AuthorizeRequest): Promise<boolean> {
    // SensitiveRecord has no `mentors` attribute in the schema — never pass it for that tier.
    const mentors = req.tier === "SensitiveRecord" ? [] : (req.mentors ?? []);
    const sharedWith = req.sharedWith ?? [];
    const relKey = `m:${[...mentors].sort().join(",")}|s:${[...sharedWith].sort().join(",")}`;
    const key = `${req.identityToken.slice(-24)}|${req.action}|${req.tier}|${req.resourceId}|${req.ownerId}|${relKey}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit > now) return true;

    const attributes: Record<string, AttributeValue> = {
      owner: userRef(req.ownerId),
    };
    if (mentors.length > 0) attributes.mentors = { set: mentors.map(userRef) };
    if (sharedWith.length > 0) attributes.sharedWith = { set: sharedWith.map(userRef) };

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
                attributes,
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
