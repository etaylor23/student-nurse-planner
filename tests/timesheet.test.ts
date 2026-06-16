import { describe, expect, it } from "vitest";
import { buildTimesheet, timesheetToCsv } from "../src/logic/timesheet";
import type { Placement, Shift } from "../src/domain/types";

const placements: Placement[] = [
  { id: "p1", userId: "u", name: "Ward 7, Lister", settingType: "Acute", createdAt: "" },
];

function shift(partial: Partial<Shift>): Shift {
  return {
    id: partial.id ?? "s",
    userId: "u",
    date: "2026-01-01",
    shiftType: "LONG_DAY",
    entryMode: "RAW",
    rawDurationMins: 750,
    breakMins: 60,
    netHours: 11.5,
    isSimulated: false,
    status: "COMPLETED",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("buildTimesheet", () => {
  it("resolves placement names and sorts newest-first", () => {
    const rows = buildTimesheet(
      [
        shift({ id: "a", date: "2026-01-01", placementId: "p1" }),
        shift({ id: "b", date: "2026-02-01", placementId: "p1" }),
      ],
      placements,
    );
    expect(rows[0].date).toBe("2026-02-01");
    expect(rows[0].placement).toBe("Ward 7, Lister");
    expect(rows[0].netHours).toBe(11.5);
  });

  it("falls back to a dash when no placement is set", () => {
    const rows = buildTimesheet([shift({ placementId: undefined })], placements);
    expect(rows[0].placement).toBe("—");
  });
});

describe("timesheetToCsv", () => {
  it("escapes commas and quotes", () => {
    const rows = buildTimesheet(
      [shift({ supervisingRnName: 'Smith, "Jo"' })],
      placements,
    );
    const csv = timesheetToCsv(rows);
    expect(csv.split("\n")[0]).toContain("Date");
    expect(csv).toContain('"Smith, ""Jo"""');
  });
});
