import { GIBBS_STAGES, type GibbsStage, type ReflectionSection } from "../domain/types";

/**
 * The Gibbs reflective cycle as guided scaffolding — the spec's "guided prompts per
 * section, not a blank canvas" decision. Pure copy + derivations, kept out of the
 * components so they're unit-testable and reusable (editor, read view, list).
 *
 * The stages/labels themselves live in `domain/types` (they're part of the model);
 * this module holds the view-facing prompts and the completeness/search derivations.
 */

/** A stage's framing question + helper text (shown under the editor field). */
export interface GibbsPrompt {
  stage: GibbsStage;
  prompt: string;
  helper: string;
}

const PROMPTS: Record<GibbsStage, { prompt: string; helper: string }> = {
  DESCRIPTION: {
    prompt: "What happened?",
    helper:
      "Set the scene factually — where you were, who was involved and what you did. Never anything patient-identifiable.",
  },
  FEELINGS: {
    prompt: "What were you thinking and feeling?",
    helper: "Your reactions before, during and after — honestly, without judging them.",
  },
  EVALUATION: {
    prompt: "What was good and bad about the experience?",
    helper: "What went well, what didn't, and what you'd keep or change.",
  },
  ANALYSIS: {
    prompt: "What sense can you make of it?",
    helper: "Why did it happen this way? Link to theory, guidelines or the NMC proficiencies.",
  },
  CONCLUSION: {
    prompt: "What else could you have done?",
    helper: "What you've learned, and what you might have done differently.",
  },
  ACTION_PLAN: {
    prompt: "If it arose again, what would you do?",
    helper: "Concrete next steps — skills to practise, reading to do, who to ask.",
  },
};

/** The prompts in stage order — drives the editor's section list. */
export const GIBBS_PROMPT_LIST: GibbsPrompt[] = GIBBS_STAGES.map((stage) => ({
  stage,
  ...PROMPTS[stage],
}));

/** How complete a reflection is: which of the six stages carry non-empty content. */
export interface GibbsCompleteness {
  filledStages: GibbsStage[];
  filled: number; // 0..6
  total: number; // 6
  fraction: number; // 0..1
  complete: boolean; // all six filled
}

/** Derive completeness from a reflection's sections. Pure. */
export function gibbsCompleteness(
  sections: Pick<ReflectionSection, "stage" | "content">[],
): GibbsCompleteness {
  const filledSet = new Set(sections.filter((s) => s.content.trim() !== "").map((s) => s.stage));
  const filledStages = GIBBS_STAGES.filter((s) => filledSet.has(s));
  const filled = filledStages.length;
  const total = GIBBS_STAGES.length;
  return {
    filledStages,
    filled,
    total,
    fraction: total === 0 ? 0 : filled / total,
    complete: filled === total,
  };
}

/**
 * Free-text search across a reflection's title, its section content and its tags.
 * Multi-term AND (every whitespace-separated term must appear somewhere). Pure so the
 * list can filter without a repository round-trip. An empty query matches everything.
 */
export function reflectionMatchesQuery(
  input: { title: string; sectionContents: string[]; tagLabels: string[] },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const hay = [input.title, ...input.sectionContents, ...input.tagLabels].join("  ").toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}
