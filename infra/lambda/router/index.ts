import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { z } from "zod";
import { VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";
import { makeDocClient } from "../../../src/data/dynamo/dynamoClient";
import { DynamoRepository } from "../../../src/data/dynamo/dynamoRepository";
import { makeAuthorize, type Tier, type Verb } from "../../../src/data/dynamo/authorize";
import { RelationshipStore } from "../../../src/data/dynamo/relationships";
import {
  type Caller,
  CrossUserAccess,
  CrossUserError,
  tierForEntity,
} from "../../../src/data/dynamo/crossUser";
import {
  calcDrillDraftSchema,
  evidenceLinkDraftSchema,
  logInputSchema,
  medicationDraftSchema,
  medicationLogDraftSchema,
  proficiencyStatusChangeSchema,
  reflectionDraftSchema,
  revisionSessionDraftSchema,
  revisionTargetDraftSchema,
  revisionTopicDraftSchema,
  selfCareCheckinDraftSchema,
  shiftDraftSchema,
} from "../../../src/domain/schemas.generated";

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
// Phase 4 cross-user machinery (spec §4.5). Caller-independent — the caller sub is passed
// per request; the RelationshipStore only ever writes the caller's own grants, and the
// CrossUserAccess gate loads-then-authorizes + audits every non-owner read.
const relationships = new RelationshipStore(doc, TABLE);
const crossUser = new CrossUserAccess({
  doc,
  tableName: TABLE,
  userPoolId: USER_POOL_ID,
  authorize,
  relationships,
});

/** Method → (verb, tier). This map is also the dispatch allow-list. Verb follows the CRUD
 *  prefix (list→List, get→Read, create/add→Create, update/set/signOff/record→Update,
 *  delete/remove→Delete). Tier is SensitiveRecord for reflections + self-care (§4.2),
 *  EvidenceRecord for everything else. `listProficiencies`/`getProficiency` and the baseline
 *  skills/subjects are served from the client bundle (§2.4) and are deliberately NOT here —
 *  only the server's custom-only listSkills/getSkill/listSubjects are dispatchable. */
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
  // ---- Phase 2 ----
  // Medications + conditions + logs (study aid; no patient data)
  listMedications: { verb: "List", tier: "EvidenceRecord" },
  getMedication: { verb: "Read", tier: "EvidenceRecord" },
  createMedication: { verb: "Create", tier: "EvidenceRecord" },
  updateMedication: { verb: "Update", tier: "EvidenceRecord" },
  deleteMedication: { verb: "Delete", tier: "EvidenceRecord" },
  listMedicationConditions: { verb: "List", tier: "EvidenceRecord" },
  listConditionsForUser: { verb: "List", tier: "EvidenceRecord" },
  addMedicationCondition: { verb: "Create", tier: "EvidenceRecord" },
  removeMedicationCondition: { verb: "Delete", tier: "EvidenceRecord" },
  listMedicationLogs: { verb: "List", tier: "EvidenceRecord" },
  listMedicationLogsForShift: { verb: "List", tier: "EvidenceRecord" },
  listMedicationLogsForMedication: { verb: "List", tier: "EvidenceRecord" },
  createMedicationLog: { verb: "Create", tier: "EvidenceRecord" },
  deleteMedicationLog: { verb: "Delete", tier: "EvidenceRecord" },
  // Numeracy drills + accuracy aggregate
  listCalcDrills: { verb: "List", tier: "EvidenceRecord" },
  createCalcDrill: { verb: "Create", tier: "EvidenceRecord" },
  updateCalcDrill: { verb: "Update", tier: "EvidenceRecord" },
  deleteCalcDrill: { verb: "Delete", tier: "EvidenceRecord" },
  listCalcStats: { verb: "List", tier: "EvidenceRecord" },
  recordCalcAttempt: { verb: "Update", tier: "EvidenceRecord" },
  // Proficiency progress + status history + evidence links
  listProficiencyProgress: { verb: "List", tier: "EvidenceRecord" },
  getProficiencyProgress: { verb: "Read", tier: "EvidenceRecord" },
  setProficiencyStatus: { verb: "Update", tier: "EvidenceRecord" },
  setProficiencyTargetPart: { verb: "Update", tier: "EvidenceRecord" },
  listProficiencyStatusEvents: { verb: "List", tier: "EvidenceRecord" },
  listEvidenceLinks: { verb: "List", tier: "EvidenceRecord" },
  listEvidenceLinksForUser: { verb: "List", tier: "EvidenceRecord" },
  createEvidenceLink: { verb: "Create", tier: "EvidenceRecord" },
  deleteEvidenceLink: { verb: "Delete", tier: "EvidenceRecord" },
  // Clinical skills (custom-only server-side) + progress
  listSkills: { verb: "List", tier: "EvidenceRecord" },
  getSkill: { verb: "Read", tier: "EvidenceRecord" },
  addCustomSkill: { verb: "Create", tier: "EvidenceRecord" },
  deleteCustomSkill: { verb: "Delete", tier: "EvidenceRecord" },
  listSkillProgress: { verb: "List", tier: "EvidenceRecord" },
  getSkillProgress: { verb: "Read", tier: "EvidenceRecord" },
  setSkillStage: { verb: "Update", tier: "EvidenceRecord" },
  signOffSkill: { verb: "Update", tier: "EvidenceRecord" },
  // Reflection on practice + tags (SensitiveRecord — §4.2)
  listReflections: { verb: "List", tier: "SensitiveRecord" },
  getReflection: { verb: "Read", tier: "SensitiveRecord" },
  listReflectionSections: { verb: "List", tier: "SensitiveRecord" },
  listReflectionSectionsForUser: { verb: "List", tier: "SensitiveRecord" },
  createReflection: { verb: "Create", tier: "SensitiveRecord" },
  updateReflection: { verb: "Update", tier: "SensitiveRecord" },
  deleteReflection: { verb: "Delete", tier: "SensitiveRecord" },
  listTags: { verb: "List", tier: "SensitiveRecord" },
  listReflectionTags: { verb: "List", tier: "SensitiveRecord" },
  setReflectionTags: { verb: "Update", tier: "SensitiveRecord" },
  // Revision timetable
  listSubjects: { verb: "List", tier: "EvidenceRecord" },
  addSubject: { verb: "Create", tier: "EvidenceRecord" },
  listRevisionTargets: { verb: "List", tier: "EvidenceRecord" },
  createRevisionTarget: { verb: "Create", tier: "EvidenceRecord" },
  deleteRevisionTarget: { verb: "Delete", tier: "EvidenceRecord" },
  listRevisionTopics: { verb: "List", tier: "EvidenceRecord" },
  createRevisionTopic: { verb: "Create", tier: "EvidenceRecord" },
  updateRevisionTopic: { verb: "Update", tier: "EvidenceRecord" },
  deleteRevisionTopic: { verb: "Delete", tier: "EvidenceRecord" },
  listRevisionSessions: { verb: "List", tier: "EvidenceRecord" },
  createRevisionSession: { verb: "Create", tier: "EvidenceRecord" },
  updateRevisionSession: { verb: "Update", tier: "EvidenceRecord" },
  deleteRevisionSession: { verb: "Delete", tier: "EvidenceRecord" },
  // Self-care check-ins (SensitiveRecord — §4.2)
  listSelfCareCheckins: { verb: "List", tier: "SensitiveRecord" },
  createSelfCareCheckin: { verb: "Create", tier: "SensitiveRecord" },
  deleteSelfCareCheckin: { verb: "Delete", tier: "SensitiveRecord" },
  // ---- Phase 3: local-first sync transport (spec §5) ----
  // Coarse EvidenceRecord gate: in v1 the only policy is owner==principal (§4.3), so the
  // decision is identical across tiers — and the server derives owner from the JWT sub and
  // only ever touches the caller's own partition, so a batch that includes SensitiveRecord
  // rows (reflections/self-care) is still gated to the owner. syncPull=List, syncPush=Update.
  syncPull: { verb: "List", tier: "EvidenceRecord" },
  syncPush: { verb: "Update", tier: "EvidenceRecord" },
};

/**
 * Light server-side write validation (spec §7). For obvious create/update payloads, the
 * relevant argument is checked against the matching generated zod schema before dispatch;
 * a failure returns 400 `invalid_input`. Schemas run in strip mode, so the extra `userId`
 * carried on create args is ignored (the server owns identity regardless). Methods whose
 * args don't map cleanly to a schema are simply omitted here (validation skipped).
 */
const VALIDATORS: Record<string, { index: number; schema: z.ZodTypeAny }> = {
  createShift: { index: 0, schema: shiftDraftSchema },
  createLogItem: { index: 0, schema: logInputSchema },
  createMedication: { index: 0, schema: medicationDraftSchema },
  updateMedication: { index: 1, schema: medicationDraftSchema.partial() },
  createMedicationLog: { index: 0, schema: medicationLogDraftSchema },
  createCalcDrill: { index: 0, schema: calcDrillDraftSchema },
  updateCalcDrill: { index: 1, schema: calcDrillDraftSchema.partial() },
  createEvidenceLink: { index: 0, schema: evidenceLinkDraftSchema },
  setProficiencyStatus: { index: 2, schema: proficiencyStatusChangeSchema },
  createReflection: { index: 0, schema: reflectionDraftSchema },
  updateReflection: { index: 1, schema: reflectionDraftSchema.partial() },
  createRevisionTarget: { index: 0, schema: revisionTargetDraftSchema },
  createRevisionTopic: { index: 0, schema: revisionTopicDraftSchema },
  updateRevisionTopic: { index: 1, schema: revisionTopicDraftSchema.partial() },
  createRevisionSession: { index: 0, schema: revisionSessionDraftSchema },
  updateRevisionSession: { index: 1, schema: revisionSessionDraftSchema.partial() },
  createSelfCareCheckin: { index: 0, schema: selfCareCheckinDraftSchema },
};

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * Phase 4 cross-user + relationship dispatch (spec-backend-dynamodb.md §4.5). These are NOT
 * plain single-user Repository methods, so they route through a separate path:
 *  - Own-grant WRITES are owner-scoped — the caller is always the owner of what they share
 *    (a share is proven with the `Share` action via owner-all) or the student naming their
 *    own mentor. The server derives every owner/student from the verified JWT `sub`.
 *  - Cross-user READS (getSharedRecord / listMenteeRecords) run the load-then-authorize gate
 *    (§4.4) + audit inside CrossUserAccess.
 */
const CROSS_USER = new Set([
  "shareRecord",
  "revokeShare",
  "listSharedWithMe",
  "addMentorship",
  "removeMentorship",
  "listMyMentees",
  "listMyMentors",
  "getSharedRecord",
  "listMenteeRecords",
]);

async function dispatchCrossUser(
  method: string,
  args: unknown[],
  caller: Caller,
): Promise<unknown> {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const opt = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  switch (method) {
    case "shareRecord": {
      const entityType = s(args[0]);
      const resourceId = s(args[1]);
      const grantee = s(args[2]);
      const tier = tierForEntity(entityType);
      // Owner-scoped: the caller IS the owner. Prove ownership via the Share action (owner-all).
      const ok = await authorize({
        identityToken: caller.identityToken,
        action: "Share",
        tier,
        resourceId,
        ownerId: `${USER_POOL_ID}|${caller.sub}`,
      });
      if (!ok) throw new CrossUserError("forbidden");
      await relationships.shareRecord(caller.sub, entityType, resourceId, tier, grantee);
      return { ok: true };
    }
    case "revokeShare":
      await relationships.revokeShare(caller.sub, s(args[0]), s(args[1]), s(args[2]));
      return { ok: true };
    case "listSharedWithMe":
      return relationships.listSharedWithMe(caller.sub);
    case "addMentorship":
      await relationships.addMentorship(caller.sub, s(args[0]));
      return { ok: true };
    case "removeMentorship":
      await relationships.removeMentorship(caller.sub, s(args[0]));
      return { ok: true };
    case "listMyMentees":
      return relationships.listMyMentees(caller.sub);
    case "listMyMentors":
      return relationships.listMyMentors(caller.sub);
    case "getSharedRecord":
      return crossUser.getSharedRecord(caller, s(args[0]), s(args[1]), s(args[2]), opt(args[3]));
    case "listMenteeRecords":
      return crossUser.listMenteeRecords(caller, s(args[0]), s(args[1]), opt(args[2]));
    default:
      throw new CrossUserError("unsupported_entity");
  }
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

    const identityToken = (event.headers?.authorization ?? event.headers?.Authorization ?? "").replace(
      /^Bearer\s+/i,
      "",
    );

    // Phase 4: cross-user + relationship methods route through their own path (they are not
    // plain Repository methods). Each does its own owner-scoped authorize / load-then-authorize.
    if (CROSS_USER.has(method)) {
      try {
        const result = await dispatchCrossUser(method, args, { sub, identityToken });
        return json(200, { result });
      } catch (err) {
        if (err instanceof CrossUserError) {
          return json(err.code === "forbidden" ? 403 : 400, { error: err.code, method });
        }
        return json(500, { error: "internal", detail: err instanceof Error ? err.message : String(err) });
      }
    }

    const spec = METHODS[method];
    if (!spec) return json(404, { error: "unknown_method", method });

    // Light input hardening: validate the mapped create/update payload before dispatch.
    const validator = VALIDATORS[method];
    if (validator && args[validator.index] !== undefined) {
      if (!validator.schema.safeParse(args[validator.index]).success) {
        return json(400, { error: "invalid_input", method });
      }
    }
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
