import { type DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { nowIso } from "../../domain/ids";
import type { AuthorizeFn, Tier, Verb } from "./authorize";
import type { RelationshipStore } from "./relationships";

/**
 * Cross-user read path + the load-then-authorize gate (spec-backend-dynamodb.md §4.4).
 *
 * A cross-user read names an explicit target owner and:
 *   1. loads the target row from the OWNER's partition and reads its tier + owner;
 *   2. loads the grant(s) that apply for THIS caller (a Share for the exact record and/or a
 *      Mentorship over the owner), and populates the resource's `mentors` / `sharedWith`
 *      sets with the caller — and only when a real grant applies;
 *   3. calls the single AVP gate with tier + owner + those sets (the admin group arrives via
 *      the token's `cognito:groups` claim, no extra fact) — ALLOW returns the row, else 403;
 *   4. AUDITS every non-owner allow (§4.6). Owner-accessing-own is never audited.
 */

const SENSITIVE_ENTITIES = new Set([
  "reflections",
  "reflectionSections",
  "reflectionTags",
  "tags",
  "selfCareCheckins",
]);

/** Tier for an entity type — mirrors the router METHODS tier map (§4.2). */
export function tierForEntity(entityType: string): Tier {
  return SENSITIVE_ENTITIES.has(entityType) ? "SensitiveRecord" : "EvidenceRecord";
}

/**
 * Top-level owned entities addressable cross-user by `<PREFIX>#<id>`. Compound-keyed
 * evidence (proficiencyProgress = PROFPROG#<profId>, evidenceLinks = EVLINK#<profId>#<id>,
 * child rows, …) is out of scope for cross-user reads in v1 — a documented limitation, not
 * a security gap (owner-scoped reads are unaffected).
 */
const SK_PREFIX: Record<string, string> = {
  placements: "PLACEMENT#",
  shifts: "SHIFT#",
  medications: "MED#",
  calcDrills: "CALCDRILL#",
  reflections: "REFLECTION#",
  selfCareCheckins: "SELFCARE#",
  revisionTargets: "REVTARGET#",
  revisionTopics: "REVTOPIC#",
  revisionSessions: "REVSESSION#",
  subjects: "SUBJECT#",
  skills: "SKILL#",
};

/** A structured cross-user access audit record (§4.6) — one JSON line to CloudWatch. */
export interface AuditRecord {
  kind: "cross_user_access";
  actor: string;
  action: Verb;
  resourceType: Tier;
  resourceId: string;
  owner: string;
  basis: "mentor" | "share" | "admin";
  ts: string;
  reason?: string;
}

export type AuditFn = (record: AuditRecord) => void;

/** v1 audit sink: a structured JSON line to stdout → CloudWatch Logs (§4.6). */
export const defaultAudit: AuditFn = (record) => {
  console.log(JSON.stringify(record));
};

export class CrossUserError extends Error {
  constructor(public readonly code: "forbidden" | "unsupported_entity") {
    super(code);
    this.name = "CrossUserError";
  }
}

export interface CrossUserDeps {
  doc: DynamoDBDocumentClient;
  tableName: string;
  /** AVP derives the principal id as `<userPoolId>|<sub>`; owner/mentors/sharedWith match it. */
  userPoolId: string;
  authorize: AuthorizeFn;
  relationships: RelationshipStore;
  audit?: AuditFn;
}

/** The verified caller — `sub` from the JWT, `identityToken` forwarded to AVP. */
export interface Caller {
  sub: string;
  identityToken: string;
}

const INFRA_KEYS = ["PK", "SK", "owner", "version", "ttl", "entityType", "deleted"];

function stripInfra(raw: Record<string, unknown>): Record<string, unknown> {
  const item = { ...raw };
  for (const k of INFRA_KEYS) delete item[k];
  return item;
}

export class CrossUserAccess {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly userPoolId: string;
  private readonly authorize: AuthorizeFn;
  private readonly rel: RelationshipStore;
  private readonly audit: AuditFn;

  constructor(deps: CrossUserDeps) {
    this.doc = deps.doc;
    this.tableName = deps.tableName;
    this.userPoolId = deps.userPoolId;
    this.authorize = deps.authorize;
    this.rel = deps.relationships;
    this.audit = deps.audit ?? defaultAudit;
  }

  private principalId(sub: string): string {
    return `${this.userPoolId}|${sub}`;
  }

  private async queryPrefix(partition: string, prefix: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: { ":pk": partition, ":sk": prefix },
          ExclusiveStartKey,
        }),
      );
      for (const it of res.Items ?? []) {
        if ((it as Record<string, unknown>).deleted !== true)
          items.push(it as Record<string, unknown>);
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  /**
   * Read one record owned by `owner` that has been shared with the caller (or that the
   * caller mentors / is admin over). Load-then-authorize + audit. Returns the domain object,
   * `undefined` if the row is absent/tombstoned, or throws `CrossUserError("forbidden")`.
   * `reason` is recorded on admin break-glass audits.
   */
  async getSharedRecord(
    caller: Caller,
    owner: string,
    entityType: string,
    id: string,
    reason?: string,
  ): Promise<Record<string, unknown> | undefined> {
    const prefix = SK_PREFIX[entityType];
    if (!prefix) throw new CrossUserError("unsupported_entity");
    const tier = tierForEntity(entityType);

    // 1. Load the target row from the OWNER's partition.
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${owner}`, SK: `${prefix}${id}` },
      }),
    );
    const raw = res.Item as Record<string, unknown> | undefined;
    if (!raw || raw.deleted === true) return undefined;
    const ownerSub = String(raw.owner ?? owner); // the stored owner attribute is authoritative

    // 2. Load the grant(s) that apply for THIS caller + resource (owner reads skip this).
    const isOwner = caller.sub === ownerSub;
    const share = isOwner
      ? undefined
      : await this.rel.getShare(ownerSub, entityType, id, caller.sub);
    const mentor =
      !isOwner && tier === "EvidenceRecord" ? await this.rel.isMentor(caller.sub, ownerSub) : false;
    const callerPrincipal = this.principalId(caller.sub);

    // 3. Single AVP gate with the populated relationship facts.
    const allowed = await this.authorize({
      identityToken: caller.identityToken,
      action: "Read",
      tier,
      resourceId: id,
      ownerId: this.principalId(ownerSub),
      mentors: mentor ? [callerPrincipal] : [],
      sharedWith: share ? [callerPrincipal] : [],
    });
    if (!allowed) throw new CrossUserError("forbidden");

    // 4. Audit non-owner allow.
    if (!isOwner) {
      this.audit({
        kind: "cross_user_access",
        actor: caller.sub,
        action: "Read",
        resourceType: tier,
        resourceId: id,
        owner: ownerSub,
        basis: share ? "share" : mentor ? "mentor" : "admin",
        ts: nowIso(),
        reason,
      });
    }
    return stripInfra(raw);
  }

  /**
   * A mentor reading a mentee's records of one entity type (Evidence only — a mentorship
   * never reaches SensitiveRecord). Authorises the SCOPE (§4.4: List authorises the scope,
   * not per-row), then queries the mentee's partition. Throws `forbidden` when the caller
   * is not a mentor (nor admin). Audits the non-owner allow once.
   */
  async listMenteeRecords(
    caller: Caller,
    menteeSub: string,
    entityType: string,
    reason?: string,
  ): Promise<Record<string, unknown>[]> {
    const prefix = SK_PREFIX[entityType];
    if (!prefix) throw new CrossUserError("unsupported_entity");
    const tier = tierForEntity(entityType);

    const isOwner = caller.sub === menteeSub;
    const mentor =
      !isOwner && tier === "EvidenceRecord"
        ? await this.rel.isMentor(caller.sub, menteeSub)
        : false;
    const callerPrincipal = this.principalId(caller.sub);

    const allowed = await this.authorize({
      identityToken: caller.identityToken,
      action: "List",
      tier,
      resourceId: `scope:${entityType}`,
      ownerId: this.principalId(menteeSub),
      mentors: mentor ? [callerPrincipal] : [],
      sharedWith: [],
    });
    if (!allowed) throw new CrossUserError("forbidden");

    const rows = await this.queryPrefix(`USER#${menteeSub}`, prefix);

    if (!isOwner) {
      this.audit({
        kind: "cross_user_access",
        actor: caller.sub,
        action: "List",
        resourceType: tier,
        resourceId: `scope:${entityType}`,
        owner: menteeSub,
        basis: mentor ? "mentor" : "admin",
        ts: nowIso(),
        reason,
      });
    }
    return rows.map(stripInfra);
  }
}
