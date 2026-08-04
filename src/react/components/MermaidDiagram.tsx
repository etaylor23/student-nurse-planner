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
 * no script/click payloads from the source, exactly because a model wrote it).
 */

let mermaidReady: Promise<typeof import("mermaid").default> | undefined;
function loadMermaid() {
  mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
    return mermaid;
  });
  return mermaidReady;
}

let renderSeq = 0;

export function MermaidDiagram({ source, label }: { source: string; label: string }) {
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

  if (!svg) return null;

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className="overflow-x-auto rounded-xl bg-white p-3 ring-1 ring-slate-200 [&_svg]:mx-auto [&_svg]:max-w-full"
      // Mermaid's own sanitised output (securityLevel: strict). Never the model's raw text.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
