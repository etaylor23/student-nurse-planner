import { describe, expect, it } from "vitest";
import { droppedShiftDraft } from "../src/logic/shiftDraft";
import { defaultBreakRules } from "../src/logic/breakRules";

const rules = defaultBreakRules();

describe("droppedShiftDraft", () => {
  it("builds a 2h planned RAW shift at the drop time", () => {
    const start = new Date(2026, 5, 16, 9, 0); // local 09:00
    const d = droppedShiftDraft(start, 120, "p1", rules);
    expect(d.status).toBe("PLANNED");
    expect(d.entryMode).toBe("RAW");
    expect(d.rawDurationMins).toBe(120);
    expect(d.placementId).toBe("p1");
    expect(d.isSimulated).toBe(false);
    // 2h apart, regardless of timezone.
    expect((new Date(d.endAt!).getTime() - new Date(d.startAt!).getTime()) / 60000).toBe(120);
    // No break under the default bands at 2h → counts as 2h.
    expect(d.netHours).toBe(2);
  });

  it("leaves the placement unset when none is given", () => {
    const d = droppedShiftDraft(new Date(2026, 5, 16, 9, 0), 120, undefined, rules);
    expect(d.placementId).toBeUndefined();
  });
});
