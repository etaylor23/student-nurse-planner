import { describe, expect, it } from "vitest";
import { hhmm, isAllDay, isoAddDays, isoDate, shiftEnd, shiftStart } from "../src/logic/calendar";
import type { Shift } from "../src/domain/types";

function shift(partial: Partial<Shift>): Shift {
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
    ...partial,
  };
}

describe("calendar date helpers", () => {
  it("isoDate formats from local parts (no UTC off-by-one)", () => {
    expect(isoDate(new Date(2026, 5, 16))).toBe("2026-06-16");
    expect(isoDate(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("hhmm formats local hours/minutes zero-padded", () => {
    expect(hhmm(new Date(2026, 5, 16, 7, 30))).toBe("07:30");
    expect(hhmm(new Date(2026, 5, 16, 20, 5))).toBe("20:05");
  });

  it("isoAddDays crosses month and year boundaries", () => {
    expect(isoAddDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(isoAddDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("shift → event boundaries", () => {
  it("all-day shift (no times): start = date, exclusive next-day end", () => {
    const s = shift({ startTime: undefined, endTime: undefined });
    expect(isAllDay(s)).toBe(true);
    expect(shiftStart(s)).toBe("2026-06-10");
    expect(shiftEnd(s)).toBe("2026-06-11");
  });

  it("timed shift: datetime start/end on the same day", () => {
    const s = shift({ startTime: "07:30", endTime: "20:00" });
    expect(isAllDay(s)).toBe(false);
    expect(shiftStart(s)).toBe("2026-06-10T07:30:00");
    expect(shiftEnd(s)).toBe("2026-06-10T20:00:00");
  });

  it("overnight shift: end rolls to the next day", () => {
    const s = shift({ startTime: "20:00", endTime: "08:00" });
    expect(shiftEnd(s)).toBe("2026-06-11T08:00:00");
  });

  it("timed shift without an end time is open-ended", () => {
    const s = shift({ startTime: "07:30", endTime: undefined });
    expect(shiftEnd(s)).toBeUndefined();
  });
});
