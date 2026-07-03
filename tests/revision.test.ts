import { describe, expect, it } from "vitest";
import {
  clampConfidence,
  daysUntil,
  isTopicDue,
  nextDueFrom,
  resurfaceTopics,
} from "../src/logic/revision";

describe("nextDueFrom / clampConfidence", () => {
  it("schedules low confidence sooner than high", () => {
    expect(nextDueFrom(1, "2026-07-03")).toBe("2026-07-04"); // +1
    expect(nextDueFrom(3, "2026-07-03")).toBe("2026-07-07"); // +4
    expect(nextDueFrom(5, "2026-07-03")).toBe("2026-07-19"); // +16
  });

  it("clamps out-of-range confidence into 1..5", () => {
    expect(clampConfidence(0)).toBe(1);
    expect(clampConfidence(9)).toBe(5);
    expect(nextDueFrom(0, "2026-07-03")).toBe(nextDueFrom(1, "2026-07-03"));
  });
});

describe("isTopicDue", () => {
  const today = "2026-07-10";
  it("is due when confidence is low (≤2), whatever the schedule", () => {
    expect(isTopicDue({ confidence: 2, nextDue: "2026-12-01" }, today)).toBe(true);
    expect(isTopicDue({ confidence: 1, nextDue: undefined }, today)).toBe(true);
  });
  it("is due when never reviewed", () => {
    expect(isTopicDue({ confidence: 4, nextDue: undefined }, today)).toBe(true);
  });
  it("respects the schedule for confident topics", () => {
    expect(isTopicDue({ confidence: 5, nextDue: "2026-07-20" }, today)).toBe(false); // future
    expect(isTopicDue({ confidence: 5, nextDue: "2026-07-10" }, today)).toBe(true); // today
    expect(isTopicDue({ confidence: 4, nextDue: "2026-07-01" }, today)).toBe(true); // past
  });
});

describe("resurfaceTopics", () => {
  it("returns only due topics, weakest first then most overdue", () => {
    const today = "2026-07-10";
    const topics = [
      { id: "a", confidence: 5, nextDue: "2026-08-01" }, // not due
      { id: "b", confidence: 3, nextDue: "2026-07-05" }, // due (overdue)
      { id: "c", confidence: 1, nextDue: "2026-07-09" }, // due (weak)
      { id: "d", confidence: 3, nextDue: "2026-07-08" }, // due (more overdue than b)
    ];
    const out = resurfaceTopics(topics, today).map((t) => t.id);
    expect(out).not.toContain("a");
    expect(out[0]).toBe("c"); // weakest
    expect(out.slice(1)).toEqual(["b", "d"]); // same confidence → most overdue (earliest due) first
  });
});

describe("daysUntil", () => {
  it("counts whole calendar days, signed", () => {
    expect(daysUntil("2026-07-10", "2026-07-03")).toBe(7);
    expect(daysUntil("2026-07-03", "2026-07-03")).toBe(0);
    expect(daysUntil("2026-07-01", "2026-07-03")).toBe(-2);
  });
});
