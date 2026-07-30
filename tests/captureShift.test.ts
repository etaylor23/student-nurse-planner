import { describe, expect, it } from "vitest";
import { formatShiftLabel, parseWrittenDate, resolveShift } from "../src/logic/captureShift";
import type { Shift } from "../src/domain/types";

/**
 * Shift resolution (spec-note-capture.md P8/P9).
 *
 * The app matches; the model only reports what it read. That split exists because the model
 * invented a year: asked for a normalised date it returned `2024-07-22` for a page saying only
 * `22/7` — wrong by two years, and silently attachable to a two-year-old shift.
 */

const shift = (date: string, id = date): Shift =>
  ({
    id,
    userId: "u1",
    date,
    shiftType: "LATE",
    entryMode: "RAW",
    netHours: 8,
    isSimulated: false,
    status: "COMPLETED",
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
  }) as Shift;

describe("parseWrittenDate", () => {
  it("reads the numeric forms a student actually writes", () => {
    expect(parseWrittenDate("22/7")).toEqual({ day: 22, month: 7 });
    expect(parseWrittenDate("22-07")).toEqual({ day: 22, month: 7 });
    expect(parseWrittenDate("22.7.26")).toEqual({ day: 22, month: 7, year: 2026 });
    expect(parseWrittenDate("22/07/2026")).toEqual({ day: 22, month: 7, year: 2026 });
  });

  it("reads named months, with or without ordinals and weekday", () => {
    expect(parseWrittenDate("22 July")).toEqual({ day: 22, month: 7 });
    expect(parseWrittenDate("22nd July 2026")).toEqual({ day: 22, month: 7, year: 2026 });
    expect(parseWrittenDate("Tues 22 Jul")).toEqual({ day: 22, month: 7 });
  });

  it("NEVER invents a year that wasn't written", () => {
    // The whole reason this function exists rather than asking the model.
    expect(parseWrittenDate("22/7")?.year).toBeUndefined();
    expect(parseWrittenDate("22 July")?.year).toBeUndefined();
  });

  it("returns null for nothing usable", () => {
    expect(parseWrittenDate(null)).toBeNull();
    expect(parseWrittenDate("")).toBeNull();
    expect(parseWrittenDate("Medication notes")).toBeNull();
    expect(parseWrittenDate("40/13")).toBeNull(); // not a date
  });
});

describe("resolveShift", () => {
  it("matches day/month ACROSS YEARS, so back-filling last year works (P9)", () => {
    const shifts = [shift("2026-07-22"), shift("2025-07-22"), shift("2026-07-01")];
    const res = resolveShift("22/7", shifts);
    expect(res.isFallback).toBe(false);
    // Both July 22nds are candidates; the most recent is suggested.
    expect(res.candidates.map((c) => c.shift.date)).toEqual(["2026-07-22", "2025-07-22"]);
    expect(res.suggested?.shift.date).toBe("2026-07-22");
    expect(res.suggested?.confidence).toBe("DATE_MATCH");
  });

  it("narrows to one year when the page stated one", () => {
    const shifts = [shift("2026-07-22"), shift("2025-07-22")];
    const res = resolveShift("22/7/25", shifts);
    expect(res.candidates).toHaveLength(1);
    expect(res.suggested?.shift.date).toBe("2025-07-22");
  });

  it("falls back to the most recent shift and SAYS it's a fallback", () => {
    const shifts = [shift("2026-07-20"), shift("2026-07-19")];
    const res = resolveShift(null, shifts);
    expect(res.isFallback).toBe(true);
    expect(res.suggested?.shift.date).toBe("2026-07-20");
    // Not dressed up as a match — the UI states this plainly (P9).
    expect(res.suggested?.confidence).toBe("FALLBACK_RECENT");
  });

  it("falls back when a date was read but matches no shift", () => {
    const res = resolveShift("03/3", [shift("2026-07-20")]);
    expect(res.isFallback).toBe(true);
    expect(res.suggested?.confidence).toBe("FALLBACK_RECENT");
  });

  it("suggests nothing at all when the student has no shifts", () => {
    const res = resolveShift("22/7", []);
    expect(res.suggested).toBeUndefined();
    expect(res.candidates).toEqual([]);
    // Never invents a shift to attach notes to.
    expect(res.isFallback).toBe(false);
  });

  it("always offers alternates, so the suggestion is never the only option", () => {
    const shifts = [shift("2026-07-22"), shift("2026-07-21"), shift("2026-07-20")];
    expect(resolveShift(null, shifts).candidates).toHaveLength(3);
  });

  it("is order-independent", () => {
    const asc = [shift("2026-07-20"), shift("2026-07-22")];
    const desc = [shift("2026-07-22"), shift("2026-07-20")];
    expect(resolveShift(null, asc).suggested?.shift.date).toBe(
      resolveShift(null, desc).suggested?.shift.date,
    );
  });
});

describe("formatShiftLabel", () => {
  it("is short and unambiguous", () => {
    expect(formatShiftLabel(shift("2026-07-22"))).toMatch(/22 Jul · late/);
  });
});
