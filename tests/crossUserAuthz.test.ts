import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as cedar from "@cedar-policy/cedar-wasm/nodejs";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { RelationshipStore } from "../src/data/dynamo/relationships";
import { type AuditRecord, CrossUserAccess, CrossUserError } from "../src/data/dynamo/crossUser";
import type { AuthorizeFn, AuthorizeRequest } from "../src/data/dynamo/authorize";

// Phase 4 cross-user authorization — the correctness proof (spec-backend-dynamodb.md §4.4–§4.6).
//
// The cross-user gate (CrossUserAccess) is exercised on a REAL dynalite table with a TEST
// `authorize` backed by @cedar-policy/cedar-wasm evaluating the SHIPPED infra/cedar policies
// against the exact resource facts (owner / mentors / sharedWith / admin group) the gate
// builds. So these tests prove the true end-to-end decision LOCALLY, without AVP — the same
// policies that ship, the same facts the router assembles.

const NS = "NursePlanner";
const TEST_POOL = "pool-test"; // AVP derives principal ids as `<userPoolId>|<sub>`.

// ---- the real, shipped Cedar policies + schema ----
const here = dirname(fileURLToPath(import.meta.url));
const cedarDir = join(here, "..", "infra", "cedar");
const schema = JSON.parse(readFileSync(join(cedarDir, "nurse-planner.cedarschema.json"), "utf8"));
const policyFile = (n: string) => readFileSync(join(cedarDir, "policies", n), "utf8");
const policies = {
  staticPolicies: [
    policyFile("owner-all.cedar"),
    policyFile("reference-read.cedar"),
    policyFile("mentor-read.cedar"),
    policyFile("share-read.cedar"),
    // Mirror the Authz construct: substitute the pool-id placeholder (AVP names the group
    // entity `<userPoolId>|<groupName>`).
    policyFile("admin-breakglass.cedar").replace("__USER_POOL_ID__", TEST_POOL),
  ].join("\n"),
};

const uid = (type: string, id: string) => ({ type: `${NS}::${type}`, id });
const userRef = (id: string) => ({ __entity: uid("User", id) });

/**
 * A test `authorize` (matching the production AuthorizeFn signature) that evaluates the real
 * policies with cedar-wasm. The caller principal + Cognito groups are carried in the opaque
 * `identityToken` the gate forwards (a JSON stand-in for the JWT); the principal id and the
 * owner/mentors/sharedWith entity refs all use the same `<pool>|<sub>` form as production.
 */
const cedarAuthorize: AuthorizeFn = async (req: AuthorizeRequest): Promise<boolean> => {
  const token = JSON.parse(req.identityToken) as { sub: string; groups?: string[] };
  const principalId = `${TEST_POOL}|${token.sub}`;
  const groups = token.groups ?? [];
  // AVP prefixes the group entity id with the pool id, same as the principal id.
  const groupParents = groups.map((g) => uid("Group", `${TEST_POOL}|${g}`));

  // Build the resource entity facts exactly as the gate supplied them (mentors is only
  // meaningful on EvidenceRecord — SensitiveRecord has no such attribute).
  const attrs: Record<string, unknown> = { owner: userRef(req.ownerId) };
  const mentors = req.tier === "SensitiveRecord" ? [] : (req.mentors ?? []);
  if (mentors.length > 0) attrs.mentors = mentors.map(userRef);
  if ((req.sharedWith ?? []).length > 0) attrs.sharedWith = (req.sharedWith ?? []).map(userRef);

  const answer = cedar.isAuthorized({
    principal: uid("User", principalId),
    action: uid("Action", req.action),
    resource: uid(req.tier, req.resourceId),
    context: {},
    schema,
    policies,
    entities: [
      { uid: uid("User", principalId), attrs: {}, parents: groupParents },
      ...groupParents.map((g) => ({ uid: g, attrs: {}, parents: [] })),
      { uid: uid(req.tier, req.resourceId), attrs, parents: [] },
    ] as never,
  });
  if (answer.type !== "success") {
    throw new Error("cedar isAuthorized failed: " + JSON.stringify(answer.errors));
  }
  return answer.response.decision === "allow";
};

let ddb: DynamoLocal;
let rel: RelationshipStore;
beforeAll(async () => {
  ddb = await startDynamoLocal();
  rel = new RelationshipStore(ddb.doc, ddb.tableName);
});
afterAll(async () => {
  await ddb.stop();
});

let counter = 0;
const uniqueSub = (label: string) => `${label}-${counter++}-${Math.random().toString(36).slice(2)}`;

function repo(sub: string) {
  return new DynamoRepository({ doc: ddb.doc, tableName: ddb.tableName, principal: { sub } });
}
function caller(sub: string, groups?: string[]) {
  return { sub, identityToken: JSON.stringify({ sub, groups: groups ?? [] }) };
}
function gate() {
  const audits: AuditRecord[] = [];
  const cu = new CrossUserAccess({
    doc: ddb.doc,
    tableName: ddb.tableName,
    userPoolId: TEST_POOL,
    authorize: cedarAuthorize,
    relationships: rel,
    audit: (r) => audits.push(r),
  });
  return { cu, audits };
}

describe("Cross-user — mentorship (EvidenceRecord only)", () => {
  it("a mentor listMenteeRecords sees the mentee's EvidenceRecord rows; audits the access", async () => {
    const mentee = uniqueSub("mentee");
    const mentor = uniqueSub("mentor");
    await repo(mentee).createPlacement({ userId: mentee, name: "Ward A" });
    await repo(mentee).createPlacement({ userId: mentee, name: "Ward B" });
    await rel.addMentorship(mentee, mentor);

    const { cu, audits } = gate();
    const rows = await cu.listMenteeRecords(caller(mentor), mentee, "placements");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name).sort()).toEqual(["Ward A", "Ward B"]);
    // A non-owner allow is audited (basis mentor, List).
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor: mentor,
      owner: mentee,
      action: "List",
      resourceType: "EvidenceRecord",
      basis: "mentor",
    });
  });

  it("a mentor may getSharedRecord a mentee's individual EvidenceRecord (basis mentor)", async () => {
    const mentee = uniqueSub("mentee");
    const mentor = uniqueSub("mentor");
    const placement = await repo(mentee).createPlacement({ userId: mentee, name: "Ward C" });
    await rel.addMentorship(mentee, mentor);

    const { cu, audits } = gate();
    const row = await cu.getSharedRecord(caller(mentor), mentee, "placements", placement.id);
    expect(row?.id).toBe(placement.id);
    expect(audits[0]).toMatchObject({ basis: "mentor", action: "Read", owner: mentee });
  });

  it("a mentor may NEVER read a mentee's SensitiveRecord (reflection) — DENIED", async () => {
    const mentee = uniqueSub("mentee");
    const mentor = uniqueSub("mentor");
    const reflection = await repo(mentee).createReflection(
      {
        userId: mentee,
        title: "Hard shift",
        model: "GIBBS",
        isLocked: false,
        piiAcknowledged: true,
      },
      [],
    );
    await rel.addMentorship(mentee, mentor);

    const { cu, audits } = gate();
    await expect(
      cu.getSharedRecord(caller(mentor), mentee, "reflections", reflection.id),
    ).rejects.toBeInstanceOf(CrossUserError);
    // A mentor cannot even list sensitive rows.
    await expect(
      cu.listMenteeRecords(caller(mentor), mentee, "reflections"),
    ).rejects.toBeInstanceOf(CrossUserError);
    expect(audits).toHaveLength(0); // denials are never audited
  });

  it("a non-mentor is denied both the list and the single read", async () => {
    const mentee = uniqueSub("mentee");
    const mentor = uniqueSub("mentor");
    const stranger = uniqueSub("stranger");
    const placement = await repo(mentee).createPlacement({ userId: mentee, name: "Ward D" });
    await rel.addMentorship(mentee, mentor); // mentor exists, but the caller is a stranger

    const { cu } = gate();
    await expect(
      cu.listMenteeRecords(caller(stranger), mentee, "placements"),
    ).rejects.toBeInstanceOf(CrossUserError);
    await expect(
      cu.getSharedRecord(caller(stranger), mentee, "placements", placement.id),
    ).rejects.toBeInstanceOf(CrossUserError);
  });
});

describe("Cross-user — per-item share (the only SensitiveRecord path)", () => {
  it("owner shares a reflection → the grantee can read it (basis share, audited)", async () => {
    const owner = uniqueSub("owner");
    const grantee = uniqueSub("peer");
    const reflection = await repo(owner).createReflection(
      {
        userId: owner,
        title: "Shared reflection",
        model: "GIBBS",
        isLocked: false,
        piiAcknowledged: true,
      },
      [],
    );
    await rel.shareRecord(owner, "reflections", reflection.id, "SensitiveRecord", grantee);

    const { cu, audits } = gate();
    const row = await cu.getSharedRecord(caller(grantee), owner, "reflections", reflection.id);
    expect(row?.id).toBe(reflection.id);
    expect(row?.title).toBe("Shared reflection");
    expect(audits[0]).toMatchObject({
      actor: grantee,
      owner,
      basis: "share",
      resourceType: "SensitiveRecord",
      action: "Read",
    });
  });

  it("a different user (not the grantee) is denied the shared record", async () => {
    const owner = uniqueSub("owner");
    const grantee = uniqueSub("peer");
    const outsider = uniqueSub("outsider");
    const reflection = await repo(owner).createReflection(
      { userId: owner, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    await rel.shareRecord(owner, "reflections", reflection.id, "SensitiveRecord", grantee);

    const { cu } = gate();
    await expect(
      cu.getSharedRecord(caller(outsider), owner, "reflections", reflection.id),
    ).rejects.toBeInstanceOf(CrossUserError);
  });

  it("a grantee cannot read a DIFFERENT, non-shared record of the same owner", async () => {
    const owner = uniqueSub("owner");
    const grantee = uniqueSub("peer");
    const shared = await repo(owner).createReflection(
      { userId: owner, title: "Shared", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    const secret = await repo(owner).createReflection(
      { userId: owner, title: "Secret", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    await rel.shareRecord(owner, "reflections", shared.id, "SensitiveRecord", grantee);

    const { cu } = gate();
    await expect(
      cu.getSharedRecord(caller(grantee), owner, "reflections", secret.id),
    ).rejects.toBeInstanceOf(CrossUserError);
  });

  it("revokeShare ends access — the grantee is denied again", async () => {
    const owner = uniqueSub("owner");
    const grantee = uniqueSub("peer");
    const reflection = await repo(owner).createReflection(
      { userId: owner, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    await rel.shareRecord(owner, "reflections", reflection.id, "SensitiveRecord", grantee);

    const before = gate();
    expect(
      (await before.cu.getSharedRecord(caller(grantee), owner, "reflections", reflection.id))?.id,
    ).toBe(reflection.id);

    await rel.revokeShare(owner, "reflections", reflection.id, grantee);

    const after = gate();
    await expect(
      after.cu.getSharedRecord(caller(grantee), owner, "reflections", reflection.id),
    ).rejects.toBeInstanceOf(CrossUserError);
  });
});

describe("Cross-user — admin break-glass (Cognito group)", () => {
  it("a member of the `admins` group reads any record incl. Sensitive; audits with a reason", async () => {
    const owner = uniqueSub("owner");
    const admin = uniqueSub("support");
    const reflection = await repo(owner).createReflection(
      { userId: owner, title: "Private", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );

    const { cu, audits } = gate();
    const row = await cu.getSharedRecord(
      caller(admin, ["admins"]),
      owner,
      "reflections",
      reflection.id,
      "welfare escalation #42",
    );
    expect(row?.id).toBe(reflection.id);
    expect(audits[0]).toMatchObject({
      actor: admin,
      owner,
      basis: "admin",
      resourceType: "SensitiveRecord",
      reason: "welfare escalation #42",
    });
  });

  it("a non-admin, non-owner, non-grantee is denied (falls back to owner-only)", async () => {
    const owner = uniqueSub("owner");
    const nobody = uniqueSub("nobody");
    const reflection = await repo(owner).createReflection(
      { userId: owner, title: "Private", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );

    const { cu } = gate();
    await expect(
      cu.getSharedRecord(caller(nobody), owner, "reflections", reflection.id),
    ).rejects.toBeInstanceOf(CrossUserError);
  });
});

describe("Cross-user — audit only fires for non-owner access", () => {
  it("the owner reading their OWN record via the cross-user path is allowed and NOT audited", async () => {
    const owner = uniqueSub("owner");
    const placement = await repo(owner).createPlacement({ userId: owner, name: "Ward Own" });

    const { cu, audits } = gate();
    const row = await cu.getSharedRecord(caller(owner), owner, "placements", placement.id);
    expect(row?.id).toBe(placement.id);
    expect(audits).toHaveLength(0);
  });

  it("a missing/tombstoned record returns undefined without a decision or audit", async () => {
    const owner = uniqueSub("owner");
    const { cu, audits } = gate();
    const row = await cu.getSharedRecord(caller(owner), owner, "placements", "does-not-exist");
    expect(row).toBeUndefined();
    expect(audits).toHaveLength(0);
  });
});

describe("Cross-user — mirror items back the reverse queries", () => {
  it("listSharedWithMe returns the grantee's shared records", async () => {
    const owner = uniqueSub("owner");
    const grantee = uniqueSub("peer");
    const reflection = await repo(owner).createReflection(
      { userId: owner, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    await rel.shareRecord(owner, "reflections", reflection.id, "SensitiveRecord", grantee);

    const shared = await rel.listSharedWithMe(grantee);
    expect(shared).toContainEqual({
      owner,
      entityType: "reflections",
      resourceId: reflection.id,
      tier: "SensitiveRecord",
    });
  });

  it("listMyMentees / listMyMentors reflect the mentorship in both directions", async () => {
    const mentee = uniqueSub("mentee");
    const mentor = uniqueSub("mentor");
    await rel.addMentorship(mentee, mentor);

    expect(await rel.listMyMentees(mentor)).toContain(mentee);
    expect(await rel.listMyMentors(mentee)).toContain(mentor);

    await rel.removeMentorship(mentee, mentor);
    expect(await rel.listMyMentees(mentor)).not.toContain(mentee);
    expect(await rel.listMyMentors(mentee)).not.toContain(mentor);
  });
});
