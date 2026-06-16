import { describe, expect, it } from "vitest";
import { defaultBreakRules, resolveBreakMins } from "../src/logic/breakRules";

describe("resolveBreakMins (default bands)", () => {
  const rules = defaultBreakRules();

  it("deducts nothing for short shifts", () => {
    expect(resolveBreakMins(0, rules)).toBe(0);
    expect(resolveBreakMins(360, rules)).toBe(0); // 6h boundary -> still band 1
  });

  it("deducts 30 min for mid-length shifts", () => {
    expect(resolveBreakMins(361, rules)).toBe(30);
    expect(resolveBreakMins(540, rules)).toBe(30); // 9h boundary
  });

  it("deducts 60 min for long shifts", () => {
    expect(resolveBreakMins(541, rules)).toBe(60);
    expect(resolveBreakMins(750, rules)).toBe(60); // 12.5h long day
    expect(resolveBreakMins(900, rules)).toBe(60);
  });
});
