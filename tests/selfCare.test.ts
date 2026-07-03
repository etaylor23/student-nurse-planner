import { describe, expect, it } from "vitest";
import type { Shift } from "../src/domain/types";
import {
  SELF_CARE_DIMENSIONS,
  SELF_CARE_ITEMS,
  isHardShift,
  joinItems,
  parseItems,
} from "../src/logic/selfCare";

const shift = (p: Partial<Shift>): Pick<Shift, "shiftType" | "netHours"> => ({
  shiftType: "EARLY",
  netHours: 8,
  ...p,
});

describe("self-care catalogue", () => {
  it("maps every item to a real dimension", () => {
    const dims = new Set(SELF_CARE_DIMENSIONS.map((d) => d.key));
    expect(SELF_CARE_ITEMS.every((i) => dims.has(i.dimension))).toBe(true);
    expect(SELF_CARE_ITEMS.length).toBeGreaterThan(0);
  });
});

describe("parseItems / joinItems", () => {
  it("round-trips and is empty-safe", () => {
    expect(parseItems(undefined)).toEqual([]);
    expect(parseItems("")).toEqual([]);
    expect(parseItems("sleep, food ,, move")).toEqual(["sleep", "food", "move"]);
    expect(joinItems(["sleep", "food", "sleep", " "])).toBe("sleep,food"); // dedupe + drop blank
  });
});

describe("isHardShift", () => {
  it("flags nights, long days and long counted spans", () => {
    expect(isHardShift(shift({ shiftType: "NIGHT", netHours: 8 }))).toBe(true);
    expect(isHardShift(shift({ shiftType: "LONG_DAY", netHours: 8 }))).toBe(true);
    expect(isHardShift(shift({ shiftType: "OTHER", netHours: 11.5 }))).toBe(true);
  });
  it("leaves ordinary shorter shifts alone", () => {
    expect(isHardShift(shift({ shiftType: "EARLY", netHours: 7.5 }))).toBe(false);
    expect(isHardShift(shift({ shiftType: "LATE", netHours: 8 }))).toBe(false);
  });
});
