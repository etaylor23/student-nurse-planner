import { describe, expect, it } from "vitest";
import { diffShift } from "../src/logic/shiftDiff";
import type { Shift } from "../src/domain/types";

function shift(p: Partial<Shift>): Shift {
  return {
    id: "s",
    userId: "u",
    date: "2026-06-10",
    shiftType: "LONG_DAY",
    entryMode: "RAW",
    netHours: 11.5,
    isSimulated: false,
    status: "PLANNED",
    createdAt: "",
    updatedAt: "",
    ...p,
  };
}
const noPlace = new Map<string, string>();

describe("diffShift", () => {
  it("returns nothing when nothing changed", () => {
    expect(diffShift(shift({}), shift({}), noPlace)).toEqual([]);
  });

  it("reports notes before → after", () => {
    const r = diffShift(shift({ notes: undefined }), shift({ notes: "Busy night" }), noPlace);
    expect(r).toEqual([{ label: "Notes", from: "—", to: "Busy night" }]);
  });

  it("reports a simulated toggle and a counted-hours change", () => {
    const r = diffShift(
      shift({ isSimulated: false, netHours: 11.5 }),
      shift({ isSimulated: true, netHours: 10 }),
      noPlace,
    );
    expect(r).toContainEqual({ label: "Simulated", from: "No", to: "Yes" });
    expect(r).toContainEqual({ label: "Counted hours", from: "11.5h", to: "10h" });
  });

  it("resolves placement names from the map", () => {
    const map = new Map([
      ["p1", "Ward 7"],
      ["p2", "Ward 9"],
    ]);
    const r = diffShift(shift({ placementId: "p1" }), shift({ placementId: "p2" }), map);
    expect(r).toEqual([{ label: "Placement", from: "Ward 7", to: "Ward 9" }]);
  });

  it("shows 'No placement' when a placement is removed", () => {
    const map = new Map([["p1", "Ward 7"]]);
    const r = diffShift(shift({ placementId: "p1" }), shift({ placementId: undefined }), map);
    expect(r).toEqual([{ label: "Placement", from: "Ward 7", to: "No placement" }]);
  });

  it("labels a start-time change", () => {
    const r = diffShift(
      shift({ startAt: "2026-06-10T08:00:00.000Z" }),
      shift({ startAt: "2026-06-10T09:00:00.000Z" }),
      noPlace,
    );
    expect(r.map((c) => c.label)).toContain("Start time");
  });
});
