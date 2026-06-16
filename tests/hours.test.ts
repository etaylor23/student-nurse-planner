import { describe, expect, it } from "vitest";
import { computeNetHours, hoursByPlacement, summariseHours } from "../src/logic/hours";
import { defaultBreakRules } from "../src/logic/breakRules";
import type { Placement, Shift } from "../src/domain/types";

const rules = defaultBreakRules();

function shift(partial: Partial<Shift>): Shift {
  return {
    id: partial.id ?? "s",
    userId: "u",
    date: "2026-01-01",
    shiftType: "LONG_DAY",
    entryMode: "NET",
    netHours: 0,
    isSimulated: false,
    status: "COMPLETED",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("computeNetHours", () => {
  it("RAW: 12.5h shift deducts a 60-min break -> 11.5h", () => {
    const r = computeNetHours({ entryMode: "RAW", rawDurationMins: 750 }, rules);
    expect(r.netHours).toBe(11.5);
    expect(r.breakMins).toBe(60);
  });

  it("RAW: honours an explicit break override", () => {
    const r = computeNetHours(
      { entryMode: "RAW", rawDurationMins: 750, breakMinsOverride: 0 },
      rules,
    );
    expect(r.netHours).toBe(12.5);
    expect(r.breakMins).toBe(0);
  });

  it("RAW: a 7.5h shift deducts 30 min -> 7h", () => {
    const r = computeNetHours({ entryMode: "RAW", rawDurationMins: 450 }, rules);
    expect(r.netHours).toBe(7);
    expect(r.breakMins).toBe(30);
  });

  it("NET: passes entered hours through with no break", () => {
    const r = computeNetHours({ entryMode: "NET", netHoursEntered: 11.5 }, rules);
    expect(r.netHours).toBe(11.5);
    expect(r.breakMins).toBe(0);
  });

  it("never returns negative hours", () => {
    const r = computeNetHours(
      { entryMode: "RAW", rawDurationMins: 30, breakMinsOverride: 60 },
      rules,
    );
    expect(r.netHours).toBe(0);
  });
});

describe("summariseHours", () => {
  it("counts only completed shifts toward the target", () => {
    const s = summariseHours([
      shift({ netHours: 11.5, status: "COMPLETED" }),
      shift({ netHours: 11.5, status: "PLANNED" }),
    ]);
    expect(s.practiceHours).toBe(11.5);
    expect(s.plannedHours).toBe(11.5);
    expect(s.remainingHours).toBe(2300 - 11.5);
  });

  it("treats simulated hours as a subset of the target, tracked against 600", () => {
    const s = summariseHours([
      shift({ netHours: 100, isSimulated: true }),
      shift({ netHours: 50, isSimulated: false }),
    ]);
    expect(s.practiceHours).toBe(150); // simulated included in the 2300 total
    expect(s.simulatedHours).toBe(100);
    expect(s.simulatedRemaining).toBe(500);
    expect(s.simulatedCapReached).toBe(false);
  });

  it("flags the simulated cap once 600 simulated hours are reached", () => {
    const s = summariseHours([shift({ netHours: 600, isSimulated: true })]);
    expect(s.simulatedCapReached).toBe(true);
    expect(s.simulatedRemaining).toBe(0);
  });

  it("clamps progress to 100%", () => {
    const s = summariseHours([shift({ netHours: 2500, isSimulated: false })]);
    expect(s.progressFraction).toBe(1);
    expect(s.remainingHours).toBe(0);
  });
});

describe("hoursByPlacement", () => {
  const placements: Placement[] = [
    { id: "p1", userId: "u", name: "Ward 7", createdAt: "" },
    { id: "p2", userId: "u", name: "Community", createdAt: "" },
  ];

  it("groups counted vs planned hours by placement, names resolved, sorted desc", () => {
    const rows = hoursByPlacement(
      [
        shift({ placementId: "p1", netHours: 11.5, status: "COMPLETED" }),
        shift({ placementId: "p1", netHours: 7.5, status: "PLANNED" }),
        shift({ placementId: "p2", netHours: 20, status: "COMPLETED" }),
        shift({ placementId: undefined, netHours: 5, status: "COMPLETED" }),
      ],
      placements,
    );
    expect(rows[0]).toMatchObject({ name: "Community", counted: 20, shiftCount: 1 });
    const ward7 = rows.find((r) => r.placementId === "p1")!;
    expect(ward7).toMatchObject({ name: "Ward 7", counted: 11.5, planned: 7.5, shiftCount: 2 });
    const none = rows.find((r) => r.placementId === null)!;
    expect(none).toMatchObject({ name: "No placement", counted: 5 });
  });
});
