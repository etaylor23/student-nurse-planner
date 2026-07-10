import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import * as cedar from "@cedar-policy/cedar-wasm/nodejs";

// Cedar policy unit tests — spec-implementation-roadmap.md Phase 1 + spec-backend §8.
// Evaluate the SHIPPED policies (infra/cedar/*) against the schema locally, with sample
// (principal, action, resource) tuples → expect allow/deny. No AVP deployment needed.

const here = dirname(fileURLToPath(import.meta.url));
const cedarDir = join(here, "..", "infra", "cedar");
const schema = JSON.parse(readFileSync(join(cedarDir, "nurse-planner.cedarschema.json"), "utf8"));
const policies = {
  staticPolicies:
    readFileSync(join(cedarDir, "policies", "owner-all.cedar"), "utf8") +
    "\n" +
    readFileSync(join(cedarDir, "policies", "reference-read.cedar"), "utf8"),
};

const NS = "NursePlanner";
const user = (id: string) => ({ type: `${NS}::User`, id });
const action = (id: string) => ({ type: `${NS}::Action`, id });

function ownedResource(type: string, id: string, ownerSub: string) {
  return {
    uid: { type: `${NS}::${type}`, id },
    attrs: { owner: { __entity: { type: `${NS}::User`, id: ownerSub } } },
    parents: [],
  };
}

function decide(opts: {
  principalSub: string;
  actionId: string;
  resource: { type: string; id: string };
  entities: unknown[];
}): "allow" | "deny" {
  const answer = cedar.isAuthorized({
    principal: user(opts.principalSub),
    action: action(opts.actionId),
    resource: { type: `${NS}::${opts.resource.type}`, id: opts.resource.id },
    context: {},
    schema,
    policies,
    entities: [
      { uid: { type: `${NS}::User`, id: opts.principalSub }, attrs: {}, parents: [] },
      ...opts.entities,
    ] as never,
  });
  if (answer.type !== "success") {
    throw new Error("cedar isAuthorized failed: " + JSON.stringify(answer.errors));
  }
  return answer.response.decision;
}

describe("Cedar v1 policies — owner-all", () => {
  it("owner may Read/Update/Create/Delete/List their own EvidenceRecord", () => {
    for (const verb of ["Read", "Update", "Create", "Delete", "List"]) {
      expect(
        decide({
          principalSub: "alice",
          actionId: verb,
          resource: { type: "EvidenceRecord", id: "shift-1" },
          entities: [ownedResource("EvidenceRecord", "shift-1", "alice")],
        }),
      ).toBe("allow");
    }
  });

  it("owner may act on their own SensitiveRecord (reflections/self-care)", () => {
    expect(
      decide({
        principalSub: "alice",
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "refl-1" },
        entities: [ownedResource("SensitiveRecord", "refl-1", "alice")],
      }),
    ).toBe("allow");
  });

  it("a non-owner is DENIED on someone else's EvidenceRecord", () => {
    expect(
      decide({
        principalSub: "bob",
        actionId: "Read",
        resource: { type: "EvidenceRecord", id: "shift-1" },
        entities: [ownedResource("EvidenceRecord", "shift-1", "alice")],
      }),
    ).toBe("deny");
  });

  it("a non-owner is DENIED on someone else's SensitiveRecord (no blanket grant)", () => {
    expect(
      decide({
        principalSub: "bob",
        actionId: "Read",
        resource: { type: "SensitiveRecord", id: "refl-1" },
        entities: [ownedResource("SensitiveRecord", "refl-1", "alice")],
      }),
    ).toBe("deny");
  });
});

describe("Cedar v1 policies — reference-read (reserved, inert in v1)", () => {
  it("any authenticated user may Read a Reference", () => {
    expect(
      decide({
        principalSub: "anyone",
        actionId: "Read",
        resource: { type: "Reference", id: "prof-1.1" },
        entities: [{ uid: { type: `${NS}::Reference`, id: "prof-1.1" }, attrs: {}, parents: [] }],
      }),
    ).toBe("allow");
  });

  it("but may NOT List a Reference (reference policy is Read-only)", () => {
    expect(
      decide({
        principalSub: "anyone",
        actionId: "List",
        resource: { type: "Reference", id: "prof-1.1" },
        entities: [{ uid: { type: `${NS}::Reference`, id: "prof-1.1" }, attrs: {}, parents: [] }],
      }),
    ).toBe("deny");
  });
});
