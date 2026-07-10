import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import * as cedar from "@cedar-policy/cedar-wasm/nodejs";

// Cedar policy unit tests — spec-implementation-roadmap.md Phase 1 + Phase 4, spec-backend §8.
// Evaluate the SHIPPED policies (infra/cedar/*) against the schema locally, with sample
// (principal, action, resource) tuples → expect allow/deny. No AVP deployment needed.
// The Phase 4 blocks are the security-review artifact for the cross-user grants.

const here = dirname(fileURLToPath(import.meta.url));
const cedarDir = join(here, "..", "infra", "cedar");
const schema = JSON.parse(readFileSync(join(cedarDir, "nurse-planner.cedarschema.json"), "utf8"));
const policyFile = (n: string) => readFileSync(join(cedarDir, "policies", n), "utf8");
// The Authz construct substitutes the pool id into admin-breakglass's __USER_POOL_ID__
// placeholder at deploy (AVP names the Cognito group `<userPoolId>|<groupName>`); mirror
// that here with a fixed test pool so the admin test matches the shipped semantics.
const TEST_POOL = "eu-west-2_testpool";
const policies = {
  staticPolicies: [
    policyFile("owner-all.cedar"),
    policyFile("reference-read.cedar"),
    policyFile("mentor-read.cedar"),
    policyFile("share-read.cedar"),
    policyFile("admin-breakglass.cedar").replace("__USER_POOL_ID__", TEST_POOL),
  ].join("\n"),
};

const NS = "NursePlanner";
const uid = (type: string, id: string) => ({ type: `${NS}::${type}`, id });
const userRef = (id: string) => ({ __entity: uid("User", id) });

/** A resource entity with owner + optional per-request relationship sets (mentors/sharedWith). */
function rec(
  type: "EvidenceRecord" | "SensitiveRecord" | "Reference",
  id: string,
  ownerSub?: string,
  rel?: { mentors?: string[]; sharedWith?: string[] },
) {
  const attrs: Record<string, unknown> = {};
  if (ownerSub) attrs.owner = userRef(ownerSub);
  if (rel?.mentors) attrs.mentors = rel.mentors.map(userRef);
  if (rel?.sharedWith) attrs.sharedWith = rel.sharedWith.map(userRef);
  return { uid: uid(type, id), attrs, parents: [] };
}

function decide(opts: {
  principalSub: string;
  actionId: string;
  resource: { type: string; id: string };
  entities: unknown[];
  /** Cognito-group parents of the principal (admin break-glass). */
  principalParents?: { type: string; id: string }[];
}): "allow" | "deny" {
  const parents = opts.principalParents ?? [];
  const extraGroups = parents.map((p) => ({ uid: p, attrs: {}, parents: [] }));
  const answer = cedar.isAuthorized({
    principal: uid("User", opts.principalSub),
    action: uid("Action", opts.actionId),
    resource: uid(opts.resource.type, opts.resource.id),
    context: {},
    schema,
    policies,
    entities: [
      { uid: uid("User", opts.principalSub), attrs: {}, parents },
      ...extraGroups,
      ...opts.entities,
    ] as never,
  });
  if (answer.type !== "success") {
    throw new Error("cedar isAuthorized failed: " + JSON.stringify(answer.errors));
  }
  return answer.response.decision;
}

describe("Cedar v1 — owner-all", () => {
  it("owner may act on their own Evidence + Sensitive records across verbs", () => {
    for (const verb of ["Read", "List", "Create", "Update", "Delete", "Share"]) {
      expect(
        decide({
          principalSub: "alice",
          actionId: verb,
          resource: { type: "EvidenceRecord", id: "e1" },
          entities: [rec("EvidenceRecord", "e1", "alice")],
        }),
      ).toBe("allow");
    }
    expect(
      decide({
        principalSub: "alice",
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "s1" },
        entities: [rec("SensitiveRecord", "s1", "alice")],
      }),
    ).toBe("allow");
  });

  it("a non-owner with no relationship is denied on both tiers", () => {
    expect(
      decide({
        principalSub: "bob",
        actionId: "Read",
        resource: { type: "EvidenceRecord", id: "e1" },
        entities: [rec("EvidenceRecord", "e1", "alice")],
      }),
    ).toBe("deny");
    expect(
      decide({
        principalSub: "bob",
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "s1" },
        entities: [rec("SensitiveRecord", "s1", "alice")],
      }),
    ).toBe("deny");
  });
});

describe("Cedar v1 — reference-read (reserved, inert)", () => {
  it("any user may Read a Reference but not List it", () => {
    expect(
      decide({
        principalSub: "x",
        actionId: "Read",
        resource: { type: "Reference", id: "p1" },
        entities: [rec("Reference", "p1")],
      }),
    ).toBe("allow");
    expect(
      decide({
        principalSub: "x",
        actionId: "List",
        resource: { type: "Reference", id: "p1" },
        entities: [rec("Reference", "p1")],
      }),
    ).toBe("deny");
  });
});

describe("Cedar Phase 4 — mentor-read (EvidenceRecord only, Read/List only)", () => {
  const mentee = "alice";
  const mentor = "dr-jones";
  it("a mentor may Read + List a mentee's EvidenceRecord (in resource.mentors)", () => {
    for (const verb of ["Read", "List"]) {
      expect(
        decide({
          principalSub: mentor,
          actionId: verb,
          resource: { type: "EvidenceRecord", id: "hours-1" },
          entities: [rec("EvidenceRecord", "hours-1", mentee, { mentors: [mentor] })],
        }),
      ).toBe("allow");
    }
  });
  it("a mentor may NOT Update or Delete a mentee's EvidenceRecord", () => {
    for (const verb of ["Update", "Delete"]) {
      expect(
        decide({
          principalSub: mentor,
          actionId: verb,
          resource: { type: "EvidenceRecord", id: "hours-1" },
          entities: [rec("EvidenceRecord", "hours-1", mentee, { mentors: [mentor] })],
        }),
      ).toBe("deny");
    }
  });
  it("a mentor may NEVER read a mentee's SensitiveRecord (reflections/self-care)", () => {
    // SensitiveRecord has no `mentors` attribute; even if the router mistakenly tried, the
    // grant simply cannot be expressed. Sharing is the only path (next block).
    expect(
      decide({
        principalSub: mentor,
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "refl-1" },
        entities: [rec("SensitiveRecord", "refl-1", mentee, { sharedWith: [] })],
      }),
    ).toBe("deny");
  });
  it("a non-mentor (absent from resource.mentors) is denied", () => {
    expect(
      decide({
        principalSub: "stranger",
        actionId: "Read",
        resource: { type: "EvidenceRecord", id: "hours-1" },
        entities: [rec("EvidenceRecord", "hours-1", mentee, { mentors: [mentor] })],
      }),
    ).toBe("deny");
  });
});

describe("Cedar Phase 4 — per-item share (the only SensitiveRecord cross-user path)", () => {
  const owner = "alice";
  const grantee = "peer-sam";
  it("a grantee may Read a shared SensitiveRecord (reflection)", () => {
    expect(
      decide({
        principalSub: grantee,
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "refl-1" },
        entities: [rec("SensitiveRecord", "refl-1", owner, { sharedWith: [grantee] })],
      }),
    ).toBe("allow");
  });
  it("a grantee may Read a shared EvidenceRecord", () => {
    expect(
      decide({
        principalSub: grantee,
        actionId: "Read",
        resource: { type: "EvidenceRecord", id: "e1" },
        entities: [rec("EvidenceRecord", "e1", owner, { sharedWith: [grantee] })],
      }),
    ).toBe("allow");
  });
  it("a share is Read-only — no List/Update/Delete", () => {
    for (const verb of ["List", "Update", "Delete"]) {
      expect(
        decide({
          principalSub: grantee,
          actionId: verb,
          resource: { type: "SensitiveRecord", id: "refl-1" },
          entities: [rec("SensitiveRecord", "refl-1", owner, { sharedWith: [grantee] })],
        }),
      ).toBe("deny");
    }
  });
  it("a non-grantee is denied even when the item is shared with someone else", () => {
    expect(
      decide({
        principalSub: "outsider",
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "refl-1" },
        entities: [rec("SensitiveRecord", "refl-1", owner, { sharedWith: [grantee] })],
      }),
    ).toBe("deny");
  });
  it("a grant for a DIFFERENT record does not leak (empty sharedWith on this one)", () => {
    // The router only ever puts the grantee into the sharedWith of the exact shared record.
    expect(
      decide({
        principalSub: grantee,
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "refl-2" },
        entities: [rec("SensitiveRecord", "refl-2", owner, { sharedWith: [] })],
      }),
    ).toBe("deny");
  });
});

describe("Cedar Phase 4 — admin break-glass (Cognito group)", () => {
  // AVP names the Cognito group entity `<userPoolId>|<groupName>` — match the templated policy.
  const admins = { type: `${NS}::Group`, id: `${TEST_POOL}|admins` };
  it("an admin-group member may act on any record (incl. Sensitive)", () => {
    for (const verb of ["Read", "Update", "Delete"]) {
      expect(
        decide({
          principalSub: "support-admin",
          actionId: verb,
          resource: { type: "SensitiveRecord", id: "refl-1" },
          entities: [rec("SensitiveRecord", "refl-1", "alice")],
          principalParents: [admins],
        }),
      ).toBe("allow");
    }
  });
  it("a non-admin is denied (falls back to owner-only)", () => {
    expect(
      decide({
        principalSub: "not-admin",
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "refl-1" },
        entities: [rec("SensitiveRecord", "refl-1", "alice")],
      }),
    ).toBe("deny");
  });
});
