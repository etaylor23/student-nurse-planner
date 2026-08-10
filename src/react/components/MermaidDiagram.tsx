import { useEffect, useRef, useState } from "react";

/**
 * Render model-generated Mermaid source, fail-closed (spec-note-capture.md P44).
 *
 * The source comes from a vision model rebuilding a hand-drawn diagram, so it is treated
 * as untrusted twice over: the server admits it only when every word is on the page, and
 * this component renders nothing at all if Mermaid can't parse it — the caller keeps the
 * plain transcription visible either way, so a bad rebuild costs a picture, never content.
 *
 * `mermaid` is ~1.5 MB, so it is imported lazily on first use rather than riding the app
 * bundle; the library is a singleton, so initialise runs once (strict security level:
 * no script/click payloads from the source, exactly because a model wrote it). The look
 * lives in index.css (`.pm-mermaid`): quiet white cards, an emerald hub, neutral edges.
 *
 * `highlight` marks the node matching a piece of text — the review screen passes the
 * focused block's text so the drawing lights up the branch being worked on. Deliberately
 * NOT a re-render: the SVG is rendered once per source and the highlight is a class
 * toggle on its node groups (`.pm-mm-active`, styles in index.css), so moving focus
 * through the blocks costs a DOM walk, not a layout engine run.
 */

/** The app's font stack, as a literal — mermaid measures text in a detached DOM where
 *  CSS variables don't resolve. Colour is NOT set here: the quiet card look lives in
 *  index.css (`.pm-mermaid` overrides), one source of truth for how a rebuild renders. */
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

let mermaidReady: Promise<typeof import("mermaid").default> | undefined;
function loadMermaid() {
  mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
      themeVariables: { fontFamily: FONT },
      mindmap: { useMaxWidth: true },
      flowchart: { useMaxWidth: true },
    });
    return mermaid;
  });
  return mermaidReady;
}

let renderSeq = 0;

/** Word-set form of a label, for highlight matching — same normalisation both sides. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * A node's label text. Labels wrap — as tspans or as HTML-label <br>s — and `textContent`
 * fuses the pieces without spaces ("SIXwithin"), so multi-line labels could never match.
 * Walk the text nodes and join them with spaces instead.
 */
function nodeText(g: SVGGElement): string {
  const walker = g.ownerDocument.createTreeWalker(g, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
  return parts.join(" ");
}

/** A block a rendered node can stand for — the review passes its pending sub-blocks. */
export interface DiagramTarget {
  id: string;
  text: string;
}

/**
 * Which block does this node's label name? The same mutual-containment rule the highlight
 * uses (labels wrap; block text may span several labels), tightened for the case highlight
 * never has: SEVERAL blocks matching one label. An exact match wins outright; otherwise the
 * closest length wins — "YES" must resolve to the block that says YES, not to the long
 * branch text that happens to contain the word.
 */
export function pickTarget(nodeText: string, targets: DiagramTarget[]): DiagramTarget | undefined {
  const label = norm(nodeText);
  if (!label) return undefined;
  let best: DiagramTarget | undefined;
  let bestGap = Number.MAX_SAFE_INTEGER;
  for (const t of targets) {
    const text = norm(t.text);
    if (!text) continue;
    if (text === label) return t;
    if (!label.includes(text) && !text.includes(label)) continue;
    const gap = Math.abs(text.length - label.length);
    if (gap < bestGap) {
      bestGap = gap;
      best = t;
    }
  }
  return best;
}

export function MermaidDiagram({
  source,
  label,
  highlight,
  targets,
  onSelect,
}: {
  source: string;
  label: string;
  /** Text of the note being worked on — the matching node gets the active treatment. */
  highlight?: string;
  /** Blocks the drawing's nodes can stand for. With `onSelect`, a node whose label names
   *  one becomes clickable — the third leg of the photo ↔ list ↔ drawing connection. */
  targets?: DiagramTarget[];
  onSelect?: (blockId: string) => void;
}) {
  const [svg, setSvg] = useState<string>();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(undefined);
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        // `render` throws on bad source — that's the fail-closed path.
        const { svg: rendered } = await mermaid.render(`pm-mermaid-${renderSeq++}`, source);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setSvg(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Highlight = class toggling on the rendered SVG, never a re-render. A node matches when
  // its label text and the focused note's text contain each other (labels wrap; block text
  // may span several labels).
  useEffect(() => {
    const root = host.current;
    if (!root || !svg) return;
    const wanted = norm(highlight ?? "");
    for (const g of root.querySelectorAll<SVGGElement>("g.mindmap-node, g.node")) {
      const text = norm(nodeText(g));
      const active =
        wanted.length > 0 && text.length > 0 && (wanted.includes(text) || text.includes(wanted));
      g.classList.toggle("pm-mm-active", active);
    }
  }, [svg, highlight]);

  // Clicking a node focuses its block — the drawing stops being the one read-only leg of
  // the photo ↔ list ↔ drawing connection. Listeners are attached to the rendered SVG and
  // removed on cleanup, same never-re-render rule as the highlight. Pointer-only on
  // purpose: the identical action is already keyboard-reachable through the list (↑/↓),
  // so the nodes are a shortcut, not the only route.
  useEffect(() => {
    const root = host.current;
    if (!root || !svg || !onSelect || !targets?.length) return;
    const undo: (() => void)[] = [];
    for (const g of root.querySelectorAll<SVGGElement>("g.mindmap-node, g.node")) {
      const match = pickTarget(nodeText(g), targets);
      if (!match) continue;
      const click = (e: Event) => {
        // The Enlarge overlay closes on backdrop clicks — a node click is not one.
        e.stopPropagation();
        onSelect(match.id);
      };
      g.classList.add("pm-mm-link");
      g.addEventListener("click", click);
      undo.push(() => {
        g.classList.remove("pm-mm-link");
        g.removeEventListener("click", click);
      });
    }
    return () => undo.forEach((fn) => fn());
  }, [svg, targets, onSelect]);

  if (!svg) return null;

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className="pm-mermaid overflow-x-auto rounded-xl bg-white p-3 ring-1 ring-slate-200 [&_svg]:mx-auto [&_svg]:max-w-full"
      // Mermaid's own sanitised output (securityLevel: strict). Never the model's raw text.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
