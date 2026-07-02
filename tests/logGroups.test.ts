import { describe, expect, it } from "vitest";
import { groupLogItems } from "../src/logic/logGroups";
import type { LogItem } from "../src/domain/types";

let n = 0;
function item(p: Partial<LogItem>): LogItem {
  return {
    id: "i" + n++,
    userId: "u",
    entityType: "SHIFT",
    entityId: "s1",
    action: "SHIFT_UPDATED",
    summary: "x",
    createdAt: "2026-06-16T10:00:00.000Z",
    ...p,
  };
}

describe("groupLogItems", () => {
  it("collapses entries sharing a batchId into one group, newest time wins", () => {
    const groups = groupLogItems([
      item({ id: "a", batchId: "b1", createdAt: "2026-06-16T10:00:00.001Z" }),
      item({ id: "b", batchId: "b1", createdAt: "2026-06-16T10:00:00.000Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groups[0].at).toBe("2026-06-16T10:00:00.001Z");
  });

  it("keeps entries without a batchId as separate groups", () => {
    const groups = groupLogItems([
      item({ id: "c", action: "SHIFT_CREATED" }),
      item({ id: "d", action: "SHIFT_COMPLETED" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("preserves newest-first order across groups", () => {
    const groups = groupLogItems([
      item({ id: "new", batchId: "b2", createdAt: "2026-06-16T12:00:00.000Z" }),
      item({ id: "old1", batchId: "b1", createdAt: "2026-06-16T10:00:00.000Z" }),
      item({ id: "old2", batchId: "b1", createdAt: "2026-06-16T10:00:00.000Z" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["b2", "b1"]);
  });

  it("carries entityLabel onto the group", () => {
    const groups = groupLogItems([item({ entityLabel: "Ward 7 · Thu 18 Jun" })]);
    expect(groups[0].entityLabel).toBe("Ward 7 · Thu 18 Jun");
  });

  it("carries entityType (from the first entry) onto the group", () => {
    const groups = groupLogItems([
      item({ id: "e", batchId: "b1", entityType: "PROFICIENCY", entityId: "prof_1" }),
      item({ id: "f", batchId: "b1", entityType: "PROFICIENCY", entityId: "prof_1" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entityType).toBe("PROFICIENCY");
  });
});
