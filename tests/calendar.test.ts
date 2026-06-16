import { describe, expect, it } from "vitest";
import {
  clampResizeSpan,
  composeShiftTimes,
  hhmm,
  isAllDay,
  isoAddDays,
  isoDate,
  shiftEnd,
  shiftMinutes,
  shiftStart,
} from "../src/logic/calendar";
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
    const s = shift({ startAt: undefined, endAt: undefined });
    expect(isAllDay(s)).toBe(true);
    expect(shiftStart(s)).toBe("2026-06-10");
    expect(shiftEnd(s)).toBe("2026-06-11");
  });

  it("timed shift: datetime start/end on the same day", () => {
    const s = shift({ startAt: "2026-06-10T07:30", endAt: "2026-06-10T20:00" });
    expect(isAllDay(s)).toBe(false);
    expect(shiftStart(s)).toBe("2026-06-10T07:30:00");
    expect(shiftEnd(s)).toBe("2026-06-10T20:00:00");
  });

  it("overnight shift: end carries the next day's date", () => {
    const s = shift({ startAt: "2026-06-10T20:00", endAt: "2026-06-11T08:00" });
    expect(shiftEnd(s)).toBe("2026-06-11T08:00:00");
  });

  it("timed shift without an end is open-ended", () => {
    const s = shift({ startAt: "2026-06-10T07:30", endAt: undefined });
    expect(shiftEnd(s)).toBeUndefined();
  });
});

describe("shiftMinutes", () => {
  it("is the true span — same-day", () => {
    expect(shiftMinutes({ startAt: "2026-06-10T07:30", endAt: "2026-06-10T20:00" })).toBe(750);
  });
  it("is the true span — overnight (no 24h cap)", () => {
    expect(shiftMinutes({ startAt: "2026-06-10T20:00", endAt: "2026-06-11T08:00" })).toBe(720);
    // 7pm day 1 → 8pm day 2 is genuinely 25h, not 1h.
    expect(shiftMinutes({ startAt: "2026-06-10T19:00", endAt: "2026-06-11T20:00" })).toBe(25 * 60);
  });
  it("is 0 when either end is missing", () => {
    expect(shiftMinutes({ startAt: "2026-06-10T07:30", endAt: undefined })).toBe(0);
    expect(shiftMinutes({ startAt: undefined, endAt: undefined })).toBe(0);
  });
});

describe("clampResizeSpan", () => {
  const ms = (iso: string) => new Date(iso).getTime();
  const DAY = 24 * 60 * 60000;

  it("leaves a span within 24h unchanged", () => {
    const start = ms("2026-06-10T19:00");
    const r = clampResizeSpan(start, start, ms("2026-06-11T08:00"));
    expect(r.startMs).toBe(start);
    expect(r.endMs).toBe(ms("2026-06-11T08:00"));
  });

  it("clamps the end to start+24h when the end edge is dragged past 24h", () => {
    // 7pm day 1 dragged to 8pm day 2 = 25h → end clamped to 7pm day 2 (exactly 24h).
    const start = ms("2026-06-10T19:00");
    const r = clampResizeSpan(start, start, ms("2026-06-11T20:00"));
    expect(r.startMs).toBe(start);
    expect(r.endMs - r.startMs).toBe(DAY);
    expect(r.endMs).toBe(ms("2026-06-11T19:00"));
  });

  it("clamps the start to end−24h when the start edge is dragged past 24h", () => {
    const origStart = ms("2026-06-11T06:00");
    const end = ms("2026-06-11T08:00");
    const r = clampResizeSpan(origStart, ms("2026-06-10T05:00"), end);
    expect(r.endMs).toBe(end);
    expect(r.endMs - r.startMs).toBe(DAY);
    expect(r.startMs).toBe(ms("2026-06-10T08:00"));
  });
});

describe("composeShiftTimes", () => {
  it("no start time → no datetimes (all-day)", () => {
    expect(composeShiftTimes("2026-06-10")).toEqual({});
  });
  it("start only → open-ended start datetime", () => {
    expect(composeShiftTimes("2026-06-10", "07:30")).toEqual({ startAt: "2026-06-10T07:30" });
  });
  it("same-day when end is after start", () => {
    expect(composeShiftTimes("2026-06-10", "07:30", "20:00")).toEqual({
      startAt: "2026-06-10T07:30",
      endAt: "2026-06-10T20:00",
    });
  });
  it("rolls the end to the next day for a night shift", () => {
    expect(composeShiftTimes("2026-06-10", "20:00", "08:00")).toEqual({
      startAt: "2026-06-10T20:00",
      endAt: "2026-06-11T08:00",
    });
  });
});
