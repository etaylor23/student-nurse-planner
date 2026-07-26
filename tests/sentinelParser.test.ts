import { describe, expect, it } from "vitest";
import {
  parseAnswer,
  SentinelParser,
  type Segment,
} from "../src/react/components/ai/sentinelParser";

// The incremental answer parser (spec-ai-recall.md D17). The load-bearing case is a tag
// arriving split across SSE frames — observed live in Phase 1, where one note tag came
// through as three deltas.

/** Feed a string one character at a time — the worst-case frame split. */
function feedCharByChar(text: string): Segment[] {
  const parser = new SentinelParser();
  for (const ch of text) parser.feed(ch);
  return parser.end();
}

describe("SentinelParser — note tags", () => {
  it("parses a note tag and the prose around it", () => {
    const segs = parseAnswer('Here it is:\n<note ref="SHIFT:abc-123"/>\nGood work.');
    expect(segs).toEqual([
      { kind: "text", text: "Here it is:\n" },
      { kind: "note", ref: "SHIFT:abc-123", type: "SHIFT", id: "abc-123" },
      { kind: "text", text: "\nGood work." },
    ]);
  });

  it("gives the same result however the stream is chopped up", () => {
    const answer =
      'The sequence you recorded was:<note ref="SHIFT:a08cb226-9180-4603-a233-c64f9ab13132"/>\n\nYou\'ve noted the key points.';
    const whole = parseAnswer(answer);

    // The exact three-way split seen live in Phase 1.
    const live = new SentinelParser();
    live.feed('The sequence you recorded was:<note ref="SHIFT');
    live.feed(":a08cb226-9180-4603-a233-c");
    live.feed("64f9ab13132\"/>\n\nYou've noted the key points.");
    expect(live.end()).toEqual(whole);

    // And the pathological case: one character per frame.
    expect(feedCharByChar(answer)).toEqual(whole);
  });

  it("never leaks a partial tag as visible text mid-stream", () => {
    const parser = new SentinelParser();
    const mid = parser.feed('Your note: <note ref="REFLEC');
    // The half-written tag must not appear — that's the raw-markup flash we're avoiding.
    expect(mid.map((s) => (s.kind === "text" ? s.text : `[${s.kind}]`)).join("")).toBe(
      "Your note: ",
    );
    const done = parser.feed('TION:xyz"/> there.');
    expect(done).toEqual([
      { kind: "text", text: "Your note: " },
      { kind: "note", ref: "REFLECTION:xyz", type: "REFLECTION", id: "xyz" },
      { kind: "text", text: " there." },
    ]);
  });

  it("handles every entity type and both self-closing spellings", () => {
    const segs = parseAnswer(
      '<note ref="MED_LOG:1"/><note ref="PROFICIENCY:2" /><note ref="REFLECTION:3">',
    );
    expect(segs.map((s) => (s.kind === "note" ? s.type : s.kind))).toEqual([
      "MED_LOG",
      "PROFICIENCY",
      "REFLECTION",
    ]);
  });

  it("emits several notes in order", () => {
    const segs = parseAnswer('a<note ref="SHIFT:1"/>b<note ref="SHIFT:2"/>c');
    expect(segs.filter((s) => s.kind === "note").map((s) => (s as { id: string }).id)).toEqual([
      "1",
      "2",
    ]);
  });
});

describe("SentinelParser — more chips", () => {
  it("parses topic + source", () => {
    const segs = parseAnswer('Read up: <more topic="manual blood pressure" source="nice-cks"/>');
    expect(segs[1]).toEqual({
      kind: "more",
      topic: "manual blood pressure",
      source: "nice-cks",
    });
  });

  it("tolerates an empty topic without breaking the stream", () => {
    const segs = parseAnswer('x<more topic="" source="nmc"/>y');
    expect(segs.filter((s) => s.kind === "more")).toHaveLength(1);
  });
});

describe("SentinelParser — fails closed", () => {
  it("drops malformed tags rather than rendering markup", () => {
    for (const bad of [
      '<note ref="lowercase:1"/>', // type must be A-Z
      '<note ref="noColon"/>',
      "<note/>", // no ref at all
      "<note ref=SHIFT:1/>", // unquoted
      '<more topic="x"/>', // missing source
    ]) {
      const segs = parseAnswer(`before${bad}after`);
      expect(segs).toEqual([{ kind: "text", text: "beforeafter" }]);
    }
  });

  it("leaves unrelated angle brackets as text", () => {
    expect(parseAnswer("if a < b and c > d")).toEqual([
      { kind: "text", text: "if a < b and c > d" },
    ]);
    expect(parseAnswer("<script>alert(1)</script>")).toEqual([
      { kind: "text", text: "<script>alert(1)</script>" },
    ]);
  });

  it("does not treat note text that mimics a tag as a real ref (injection)", () => {
    // A student's own note could contain tag-looking text; the model is told to ignore
    // it, but if it echoed one through, an id that doesn't exist locally renders nothing
    // (NoteCard's own guard). The parser's job is only to not crash or lose prose.
    const segs = parseAnswer('note said: <note ref="SHIFT:../../etc/passwd"/> ok');
    const note = segs.find((s) => s.kind === "note") as { id: string };
    expect(note.id).toBe("../../etc/passwd"); // passed through verbatim for the UI to reject
    expect(segs.at(-1)).toEqual({ kind: "text", text: " ok" });
  });

  it("recovers an unterminated tag at end-of-stream as literal text", () => {
    const parser = new SentinelParser();
    parser.feed('answer text <note ref="SHIFT:incomp');
    // An aborted answer must not silently swallow the words already streamed. The
    // recovered fragment coalesces with the preceding prose into one text node.
    expect(parser.end()).toEqual([{ kind: "text", text: 'answer text <note ref="SHIFT:incomp' }]);
  });
});

describe("SentinelParser — text coalescing", () => {
  it("merges adjacent frames into one text node", () => {
    const parser = new SentinelParser();
    parser.feed("one ");
    parser.feed("two ");
    parser.feed("three");
    expect(parser.end()).toEqual([{ kind: "text", text: "one two three" }]);
  });

  it("returns an empty list for an empty answer", () => {
    expect(parseAnswer("")).toEqual([]);
  });
});
