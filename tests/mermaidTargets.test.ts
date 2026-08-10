import { describe, expect, it } from "vitest";
import { pickTarget } from "../src/react/components/MermaidDiagram";

/**
 * Node → block resolution for the clickable drawing (the third leg of the
 * photo ↔ list ↔ drawing connection). The rule is the highlight's mutual containment,
 * plus a tie-break the highlight never needed: several blocks can match one label, and
 * "YES" has to resolve to the note that says YES — not to the long branch text that
 * happens to contain the word.
 */

const t = (id: string, text: string) => ({ id, text });

describe("pickTarget", () => {
  it("resolves a node whose label is exactly a block's text", () => {
    const targets = [t("a", "Check BM"), t("b", "Give quick acting glucose")];
    expect(pickTarget("Check BM", targets)?.id).toBe("a");
  });

  it("survives label wrapping — the node text is space-joined fragments", () => {
    // Rendered labels split across tspans; nodeText joins with spaces, punctuation differs.
    expect(pickTarget("Give quick acting glucose", [t("a", "Give quick-acting glucose")])?.id).toBe(
      "a",
    );
  });

  it("prefers the closest text when several blocks contain the label", () => {
    const targets = [
      t("branch", "4. IV fluids — 500ml bolus, reassess YES if BM below 4"),
      t("yes", "YES"),
    ];
    expect(pickTarget("YES", targets)?.id).toBe("yes");
  });

  it("still matches when the block text spans several labels", () => {
    // A block may cover more than one node; its node is a substring of the block.
    const targets = [t("a", "SEPSIS SIX within 1 hour 1. O2 — keep sats 94-98%")];
    expect(pickTarget("keep sats 94 98", targets)?.id).toBe("a");
  });

  it("gives nothing for an unrelated label — that node is simply not clickable", () => {
    expect(pickTarget("document + identify cause", [t("a", "Check BM")])).toBeUndefined();
  });

  it("never matches on empty text in either direction", () => {
    expect(pickTarget("", [t("a", "Check BM")])).toBeUndefined();
    expect(pickTarget("Check BM", [t("a", "  ")])).toBeUndefined();
  });
});
