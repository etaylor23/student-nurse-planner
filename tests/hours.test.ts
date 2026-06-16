import { describe, expect, it } from "vitest";
import { computeNetHours, summariseHours } from "../src/logic/hours";
import { defaultBreakRules } from "../src/logic/breakRules";
import type { Shift } from "../src/domain/types";

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
