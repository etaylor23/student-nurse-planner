import { describe, expect, it } from "vitest";
import { summariseCalcStats } from "../src/logic/calcStats";

describe("summariseCalcStats", () => {
  it("computes per-type and overall accuracy", () => {
    const s = summariseCalcStats([
      { calcType: "TABLET_DOSE", attempts: 10, correct: 9 },
      { calcType: "IV_RATE", attempts: 10, correct: 5 },
    ]);
    expect(s.total).toEqual({ attempts: 20, correct: 14, accuracy: 0.7 });
    expect(s.perType.find((p) => p.calcType === "TABLET_DOSE")?.accuracy).toBe(0.9);
  });

  it("flags the lowest-accuracy type as weakest", () => {
    const s = summariseCalcStats([
      { calcType: "TABLET_DOSE", attempts: 10, correct: 9 },
      { calcType: "IV_RATE", attempts: 10, correct: 4 },
      { calcType: "WEIGHT_BASED", attempts: 10, correct: 7 },
    ]);
    expect(s.weakest).toBe("IV_RATE");
  });

  it("ignores types below the minimum-attempts threshold for weakest", () => {
    const s = summariseCalcStats([
      { calcType: "TABLET_DOSE", attempts: 10, correct: 8 },
      { calcType: "IV_RATE", attempts: 2, correct: 0 }, // 0% but too few attempts
    ]);
    expect(s.weakest).toBe("TABLET_DOSE");
  });

  it("returns null weakest when nothing has enough attempts", () => {
    const s = summariseCalcStats([{ calcType: "TABLET_DOSE", attempts: 1, correct: 0 }]);
    expect(s.weakest).toBeNull();
  });

  it("handles an empty stat set", () => {
    const s = summariseCalcStats([]);
    expect(s.total).toEqual({ attempts: 0, correct: 0, accuracy: 0 });
    expect(s.weakest).toBeNull();
  });
});
