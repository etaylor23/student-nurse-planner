import { describe, expect, it } from "vitest";
import { GIBBS_STAGES } from "../src/domain/types";
import { GIBBS_PROMPT_LIST, gibbsCompleteness, reflectionMatchesQuery } from "../src/logic/gibbs";

describe("GIBBS_PROMPT_LIST", () => {
  it("has one prompt per stage, in the canonical order", () => {
    expect(GIBBS_PROMPT_LIST.map((p) => p.stage)).toEqual(GIBBS_STAGES);
    expect(GIBBS_PROMPT_LIST).toHaveLength(6);
    expect(GIBBS_PROMPT_LIST.every((p) => p.prompt.length > 0 && p.helper.length > 0)).toBe(true);
  });
});

describe("gibbsCompleteness", () => {
  it("counts an empty reflection as 0/6", () => {
    const c = gibbsCompleteness([]);
    expect(c.filled).toBe(0);
    expect(c.total).toBe(6);
    expect(c.fraction).toBe(0);
    expect(c.complete).toBe(false);
  });

  it("ignores blank/whitespace content and reports filled stages in order", () => {
    const c = gibbsCompleteness([
      { stage: "FEELINGS", content: "nervous" },
      { stage: "DESCRIPTION", content: "did a thing" },
      { stage: "EVALUATION", content: "   " },
    ]);
    expect(c.filled).toBe(2);
    expect(c.filledStages).toEqual(["DESCRIPTION", "FEELINGS"]); // canonical order, blank dropped
    expect(c.complete).toBe(false);
  });

  it("is complete when all six stages carry content", () => {
    const c = gibbsCompleteness(GIBBS_STAGES.map((stage) => ({ stage, content: "x" })));
    expect(c.filled).toBe(6);
    expect(c.fraction).toBe(1);
    expect(c.complete).toBe(true);
  });
});

describe("reflectionMatchesQuery", () => {
  const r = {
    title: "First cannulation",
    sectionContents: ["I assisted Sr Okafor", "Felt nervous but supported"],
    tagLabels: ["placement", "Ward 12"],
  };

  it("matches everything on an empty/whitespace query", () => {
    expect(reflectionMatchesQuery(r, "")).toBe(true);
    expect(reflectionMatchesQuery(r, "   ")).toBe(true);
  });

  it("matches on title, section content and tags (case-insensitive)", () => {
    expect(reflectionMatchesQuery(r, "CANNULATION")).toBe(true);
    expect(reflectionMatchesQuery(r, "nervous")).toBe(true);
    expect(reflectionMatchesQuery(r, "ward")).toBe(true);
  });

  it("requires every term to appear (AND semantics)", () => {
    expect(reflectionMatchesQuery(r, "nervous placement")).toBe(true);
    expect(reflectionMatchesQuery(r, "nervous cardiology")).toBe(false);
  });
});
