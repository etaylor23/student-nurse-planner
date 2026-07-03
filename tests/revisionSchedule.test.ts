import { describe, expect, it } from "vitest";
import type { Shift } from "../src/domain/types";
import { overlapsBusy, suggestStudySlots } from "../src/logic/revisionSchedule";

/** A timed shift from local wall-clock hours on a date (stored as a UTC instant). */
function shift(dateIso: string, startH: number, endH: number): Shift {
  const at = (h: number) => {
    const d = new Date(`${dateIso}T00:00:00`);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  return {
    id: `${dateIso}-${startH}`,
    userId: "u",
    date: dateIso,
    startAt: at(startH),
    endAt: at(endH),
    shiftType: "LONG_DAY",
    entryMode: "RAW",
    netHours: endH - startH,
    isSimulated: false,
    status: "COMPLETED",
    createdAt: "",
    updatedAt: "",
  };
}

const hourOf = (ms: number) => new Date(ms).getHours();

const OPTS = {
  fromIso: "2026-07-06",
  days: 3,
  durationMins: 60,
  dayStartHour: 8,
  dayEndHour: 22,
  maxSlots: 5,
};

describe("overlapsBusy", () => {
  it("detects overlap on the half-open interval", () => {
    const busy: Array<[number, number]> = [[100, 200]];
    expect(overlapsBusy(150, 250, busy)).toBe(true);
    expect(overlapsBusy(200, 300, busy)).toBe(false); // touching end, no overlap
    expect(overlapsBusy(0, 100, busy)).toBe(false); // touching start, no overlap
  });
});

describe("suggestStudySlots", () => {
  it("offers the earliest study-hour slot each day when there are no shifts", () => {
    const slots = suggestStudySlots([], OPTS);
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => hourOf(s.startMs) === 8)).toBe(true);
    expect(slots.every((s) => s.endMs - s.startMs === 60 * 60000)).toBe(true);
  });

  it("pushes past a shift to the first free window that day", () => {
    // A long day 08:00–20:00 on the first day; the day after is free.
    const slots = suggestStudySlots([shift("2026-07-06", 8, 20)], OPTS);
    expect(hourOf(slots[0].startMs)).toBe(20); // 20:00–21:00, after the shift
    expect(hourOf(slots[1].startMs)).toBe(8); // next day free from 08:00
  });

  it("skips a day with no free window inside study hours", () => {
    // A shift spanning the whole study window leaves no room that day.
    const slots = suggestStudySlots([shift("2026-07-06", 6, 23)], OPTS);
    // Day 0 skipped; still returns the other two days.
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => hourOf(s.startMs) === 8)).toBe(true);
  });
});
