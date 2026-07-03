import { describe, expect, it } from "vitest";
import { findCurrentShift, nextShift, recentShifts } from "../src/logic/shiftContext";
import type { Shift } from "../src/domain/types";

function shift(p: Partial<Shift>): Shift {
  return {
    id: "s",
    userId: "u",
    date: "2026-06-16",
    shiftType: "LONG_DAY",
    entryMode: "RAW",
    netHours: 8,
    isSimulated: false,
    status: "PLANNED",
    createdAt: "",
    updatedAt: "",
    ...p,
  };
}

const ms = (iso: string) => new Date(iso).getTime();

describe("findCurrentShift", () => {
  const inShift = shift({
    id: "now",
    startAt: "2026-06-16T08:00:00.000Z",
    endAt: "2026-06-16T16:00:00.000Z",
  });
  const other = shift({
    id: "later",
    startAt: "2026-06-17T08:00:00.000Z",
    endAt: "2026-06-17T16:00:00.000Z",
  });
  const allDay = shift({ id: "allday", startAt: undefined, endAt: undefined });

  it("returns the shift whose window contains now", () => {
    expect(findCurrentShift([other, inShift, allDay], ms("2026-06-16T10:00:00.000Z"))?.id).toBe(
      "now",
    );
  });
  it("returns undefined outside any window", () => {
    expect(findCurrentShift([inShift, other], ms("2026-06-16T20:00:00.000Z"))).toBeUndefined();
  });
  it("ignores all-day shifts (no window)", () => {
    expect(findCurrentShift([allDay], ms("2026-06-16T10:00:00.000Z"))).toBeUndefined();
  });
  it("includes the window boundaries", () => {
    expect(findCurrentShift([inShift], ms("2026-06-16T08:00:00.000Z"))?.id).toBe("now");
    expect(findCurrentShift([inShift], ms("2026-06-16T16:00:00.000Z"))?.id).toBe("now");
  });
});

describe("nextShift", () => {
  const now = ms("2026-06-16T12:00:00.000Z");
  const soon = shift({ id: "soon", startAt: "2026-06-16T18:00:00.000Z" });
  const later = shift({ id: "later", startAt: "2026-06-18T08:00:00.000Z" });
  const past = shift({ id: "past", startAt: "2026-06-15T08:00:00.000Z" });
  const completed = shift({ id: "done", status: "COMPLETED", startAt: "2026-06-17T08:00:00.000Z" });

  it("returns the soonest upcoming PLANNED shift", () => {
    expect(nextShift([later, soon, past], now)?.id).toBe("soon");
  });
  it("ignores past and completed shifts", () => {
    expect(nextShift([past, completed], now)).toBeUndefined();
  });
  it("returns undefined when nothing is upcoming", () => {
    expect(nextShift([past], now)).toBeUndefined();
  });
});

describe("recentShifts", () => {
  const shifts = [
    shift({ id: "today", date: "2026-06-17" }),
    shift({ id: "wk", date: "2026-06-11" }), // 6 days ago
    shift({ id: "old", date: "2026-06-01" }), // > 7 days ago
  ];
  it("keeps shifts within the last 7 days (inclusive), newest first", () => {
    expect(recentShifts(shifts, "2026-06-17").map((s) => s.id)).toEqual(["today", "wk"]);
  });
  it("excludes anything older than the window", () => {
    expect(recentShifts(shifts, "2026-06-17").some((s) => s.id === "old")).toBe(false);
  });
});
