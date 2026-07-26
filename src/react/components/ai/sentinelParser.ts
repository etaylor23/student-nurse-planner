/**
 * Incremental parser for the answer stream's sentinel tags (spec-ai-recall.md D17).
 *
 * The model streams markdown containing `<note ref="TYPE:id"/>` and
 * `<more topic="…" source="…"/>`. Tags arrive **split across SSE frames** — verified
 * live: one `<note ref="SHIFT:a08cb226-…"/>` came through as three separate deltas — so
 * parsing must hold a partial tag back until it closes rather than rendering the raw
 * angle brackets and then trying to unpick them.
 *
 * Design: `feed()` appends text and returns the segments parsed **so far**; a trailing
 * incomplete tag stays buffered and invisible until it completes (or is proven not to be
 * a tag). Fails closed — anything that doesn't match the grammar is dropped, never
 * rendered as markup and never guessed at.
 */

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "note"; ref: string; type: string; id: string }
  | { kind: "more"; topic: string; source: string };

const NOTE_RE = /^<note\s+ref="([A-Z_]+):([^"]+)"\s*\/?>/;
const MORE_RE = /^<more\s+topic="([^"]*)"\s+source="([^"]*)"\s*\/?>/;
/** Anything else that opens like one of our tags — consumed and dropped (fail closed). */
const UNKNOWN_TAG_RE = /^<(?:note|more)\b[^>]*>/;
/** A `<` that could still grow into one of our tags — hold, don't render. */
const MAYBE_TAG_RE = /^<(?:n(?:o(?:t(?:e)?)?)?|m(?:o(?:r(?:e)?)?)?)?(?:\s[^>]*)?$/;

export class SentinelParser {
  private buffer = "";
  private readonly segments: Segment[] = [];

  /** Append streamed text; returns every segment resolved so far (including earlier ones). */
  feed(chunk: string): Segment[] {
    this.buffer += chunk;
    this.drain();
    return this.segments;
  }

  /**
   * Flush at end-of-stream. Any still-incomplete tag was never a tag (the stream ended
   * mid-token, e.g. an aborted answer) — emit it as literal text so no words are lost.
   */
  end(): Segment[] {
    if (this.buffer) {
      this.pushText(this.buffer);
      this.buffer = "";
    }
    return this.segments;
  }

  private drain(): void {
    for (;;) {
      const open = this.buffer.indexOf("<");
      if (open === -1) {
        // No tag start anywhere — the whole buffer is text.
        if (this.buffer) {
          this.pushText(this.buffer);
          this.buffer = "";
        }
        return;
      }
      if (open > 0) {
        this.pushText(this.buffer.slice(0, open));
        this.buffer = this.buffer.slice(open);
      }

      const note = NOTE_RE.exec(this.buffer);
      if (note) {
        this.segments.push({
          kind: "note",
          ref: `${note[1]}:${note[2]}`,
          type: note[1],
          id: note[2],
        });
        this.buffer = this.buffer.slice(note[0].length);
        continue;
      }

      const more = MORE_RE.exec(this.buffer);
      if (more) {
        this.segments.push({ kind: "more", topic: more[1], source: more[2] });
        this.buffer = this.buffer.slice(more[0].length);
        continue;
      }

      const unknown = UNKNOWN_TAG_RE.exec(this.buffer);
      if (unknown) {
        // Complete but malformed (bad ref shape, missing attribute) — drop it silently.
        this.buffer = this.buffer.slice(unknown[0].length);
        continue;
      }

      if (MAYBE_TAG_RE.test(this.buffer)) return; // still growing — wait for more frames

      // A `<` that can't become one of our tags (e.g. "a < b", or an HTML tag the model
      // emitted). Emit it as text and carry on scanning after it.
      this.pushText("<");
      this.buffer = this.buffer.slice(1);
    }
  }

  /** Coalesce adjacent text so React renders one node per prose run, not one per frame. */
  private pushText(text: string): void {
    if (!text) return;
    const last = this.segments[this.segments.length - 1];
    if (last?.kind === "text") last.text += text;
    else this.segments.push({ kind: "text", text });
  }
}

/** One-shot parse of a complete answer (stored messages, tests). */
export function parseAnswer(answer: string): Segment[] {
  const parser = new SentinelParser();
  parser.feed(answer);
  return parser.end();
}
