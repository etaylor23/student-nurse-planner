/**
 * Close the line breaks a notebook's width put in, and keep the ones the student meant.
 *
 * Handwriting wraps mid-sentence. "man made protein used to / treat neutropenia" is one
 * sentence that the paper happened to break in two, and rendering it that way in a review card
 * three times the width of the page reads as ragged nonsense — the note looks damaged when
 * nothing is wrong with it.
 *
 * `classify.ts` already asks the model to do this ("JOIN HARD-WRAPPED LINES back into flowing
 * sentences … that line structure is an artefact of the paper, not the meaning"). This is the
 * same job for the DEGRADED path, where there is no classifier output to rely on — the case
 * where the student is *most* reliant on the transcription being readable, since nothing has
 * been routed for them either. Applied to every block regardless: on text the classifier
 * already joined there are no single newlines left, so it is a no-op.
 *
 * **Whitespace only.** Not one word is changed, added or removed, so P11 (`rawText` frozen) and
 * P24 (their wording is theirs) are untouched by construction.
 *
 * Conservative about what it closes, because the alternative destroys meaning:
 *   - a blank line is a paragraph the student made, and survives;
 *   - a line ending in sentence punctuation is a finished thought, and survives;
 *   - a line opening with a bullet or a number is a list item, and survives — flattening
 *     "side effects - lower back pain / - nausea" into a paragraph loses the list.
 * Everything else is treated as a wrap and closed up.
 */

/** A line that starts a list item: `-`, `•`, `1.`, `2)`, `a.`. Never joined onto the previous. */
const LIST_START = /^\s*(?:[-–—*•]|\d+[.)]|[a-z][.)])\s/i;

/** A line that finished its thought. `:` counts — "Side effects:" heads a list. */
const SENTENCE_END = /[.:;!?]["')\]]?$/;

export function reflow(text: string): string {
  return text
    .split(/\n\s*\n+/) // the student's own paragraphs
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      return lines.reduce((acc, line) => {
        if (!acc) return line;
        // `acc` ends with the previous physical line, which is what decides the join.
        const wrapped = !LIST_START.test(line) && !SENTENCE_END.test(acc);
        return wrapped ? `${acc} ${line}` : `${acc}\n${line}`;
      }, "");
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
