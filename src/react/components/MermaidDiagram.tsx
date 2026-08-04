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
 * no script/click payloads from the source, exactly because a model wrote it). The theme
 * is the brand palette (`brand-palette.css` is the source of truth for these hexes).
 *
 * `highlight` marks the node matching a piece of text — the review screen passes the
 * focused block's text so the drawing lights up the branch being worked on. Deliberately
 * NOT a re-render: the SVG is rendered once per source and the highlight is a class
 * toggle on its node groups (`.pm-mm-active`, styles in index.css), so moving focus
 * through the blocks costs a DOM walk, not a layout engine run.
 */

/** Brand tokens, mirrored from brand-palette.css (SVGs can't read CSS variables at
 *  mermaid's render time — it measures text in a detached DOM). */
const BRAND = {
  ink: "#16212f",
  cScale0: "#047857", // primary-600 emerald
  cScale1: "#005eb8", // secondary-600 NHS blue
  cScale2: "#e11d48", // accent-600 coral
  cScale3: "#10b981", // primary-500
  cScale4: "#0072ce", // secondary-500
  cScale5: "#f43f5e", // accent-500
  cScale6: "#6ee7b7", // primary-300
  cScale7: "#6badde", // secondary-300
};
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

let mermaidReady: Promise<typeof import("mermaid").default> | undefined;
function loadMermaid() {
  mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        fontFamily: FONT,
        primaryColor: BRAND.cScale6,
        primaryBorderColor: BRAND.cScale0,
        primaryTextColor: BRAND.ink,
        lineColor: BRAND.cScale0,
        // Mind-map sections cycle through the scale — brand colours, darkest first,
        // with label colours picked for contrast on each fill.
        cScale0: BRAND.cScale0,
        cScale1: BRAND.cScale1,
        cScale2: BRAND.cScale2,
        cScale3: BRAND.cScale6,
        cScale4: BRAND.cScale7,
        cScale5: BRAND.cScale3,
        cScale6: BRAND.cScale4,
        cScale7: BRAND.cScale5,
        cScaleLabel0: "#ffffff",
        cScaleLabel1: "#ffffff",
        cScaleLabel2: "#ffffff",
        cScaleLabel3: BRAND.ink,
        cScaleLabel4: BRAND.ink,
        cScaleLabel5: "#ffffff",
        cScaleLabel6: "#ffffff",
        cScaleLabel7: "#ffffff",
      },
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

export function MermaidDiagram({
  source,
  label,
  highlight,
}: {
  source: string;
  label: string;
  /** Text of the note being worked on — the matching node gets the active treatment. */
  highlight?: string;
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
    let any = false;
    for (const g of root.querySelectorAll<SVGGElement>("g.mindmap-node, g.node")) {
      // Labels wrap — as tspans or as HTML-label <br>s — and textContent fuses the pieces
      // without spaces ("SIXwithin"), so multi-line labels could never match. Walk the text
      // nodes and join them with spaces instead.
      const walker = g.ownerDocument.createTreeWalker(g, NodeFilter.SHOW_TEXT);
      const parts: string[] = [];
      while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
      const text = norm(parts.join(" "));
      const active =
        wanted.length > 0 && text.length > 0 && (wanted.includes(text) || text.includes(wanted));
      g.classList.toggle("pm-mm-active", active);
      any = any || active;
    }
    root.classList.toggle("pm-has-active", any);
  }, [svg, highlight]);

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
