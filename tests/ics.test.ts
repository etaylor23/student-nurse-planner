import { describe, expect, it } from "vitest";
import { buildIcs } from "../src/logic/ics";
import type { Placement, Shift } from "../src/domain/types";

const STAMP = "20260616T090000Z";
const placements: Placement[] = [
  { id: "p1", userId: "u", name: "Ward 7, Lister", settingType: "Acute", createdAt: "" },
];

function shift(partial: Partial<Shift>): Shift {
  return {
    id: "s1",
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

describe("buildIcs", () => {
  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    const ics = buildIcs([shift({})], placements, STAMP);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.includes("\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect(ics).toContain("UID:s1@student-nurse-planner");
  });

  it("timed shift emits UTC datetimes from the stored instants", () => {
    const ics = buildIcs(
      [shift({ startAt: "2026-06-10T07:30:00.000Z", endAt: "2026-06-10T20:00:00.000Z" })],
      placements,
      STAMP,
    );
    expect(ics).toContain("DTSTART:20260610T073000Z");
    expect(ics).toContain("DTEND:20260610T200000Z");
  });

  it("overnight shift ends on the next day", () => {
    const ics = buildIcs(
      [shift({ startAt: "2026-06-10T20:00:00.000Z", endAt: "2026-06-11T08:00:00.000Z" })],
      placements,
      STAMP,
    );
    expect(ics).toContain("DTSTART:20260610T200000Z");
    expect(ics).toContain("DTEND:20260611T080000Z");
  });

  it("shift with no times is all-day with an exclusive next-day end", () => {
    const ics = buildIcs([shift({ startAt: undefined, endAt: undefined })], placements, STAMP);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260610");
    expect(ics).toContain("DTEND;VALUE=DATE:20260611");
  });

  it("escapes commas/semicolons in text fields", () => {
    const ics = buildIcs(
      [shift({ placementId: "p1", supervisingRnName: "Smith, Jo; RN" })],
      placements,
      STAMP,
    );
    // placement name "Ward 7, Lister" comma is escaped in SUMMARY
    expect(ics).toContain("SUMMARY:Ward 7\\, Lister - Long day");
    expect(ics).toContain("Nurse: Smith\\, Jo\\; RN");
  });
});
