import { type KeyboardEvent, useId } from "react";
import { useNavigate } from "react-router-dom";

/**
 * "Capture once — feed everything": a left-to-right flow showing how one shift feeds
 * the student's real records, all pointing at a single destination (NMC registration
 * / the PAD).
 *
 * Pure props — the caller supplies the nodes and their live counts — so the same
 * diagram serves the full first-run band and the compact strip it collapses to. It
 * doubles as navigation: every node deep-links, is keyboard-operable, and carries a
 * hover description. The connectors run a motion-safe "flow" toward registration and
 * fall back to static arrowed lines under `prefers-reduced-motion`.
 */
export interface CaptureFlowNode {
  key: string;
  label: string;
  /** The student's own live count for this record ("6 tracked", "5.5 / 2,300 h"). */
  sub: string;
  /** Hover/`<title>` description. */
  desc: string;
  href: string;
  /** CSS colour for the leading dot — a brand token, e.g. `var(--color-primary-600)`. */
  dot: string;
}

export interface CaptureFlowEnd {
  label: string;
  sub?: string;
  desc: string;
  href: string;
}

// Geometry. The hub sits left, the capture nodes run down the middle one per row,
// and the destination sits right; rows are 68 apart and the whole set is centred on
// the hub, so the diagram stays symmetrical for any number of nodes.
const ROW = 68;
const NODE = { cx: 352, halfW: 94, halfH: 24, leftX: 258, rightX: 446 };
const HUB_X = 84;
const DEST_X = 622;
const MIN_HEIGHT = 320;

export function CaptureFlowDiagram({
  nodes,
  hub,
  destination,
  compact = false,
}: {
  nodes: CaptureFlowNode[];
  hub: CaptureFlowEnd;
  destination: CaptureFlowEnd;
  /** Caps the rendered height, for the collapsed band. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  // Two instances on one page would otherwise share (and fight over) one marker id.
  const markerId = `mm-arrow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const height = Math.max(MIN_HEIGHT, (nodes.length - 1) * ROW + 2 * NODE.halfH + 60);
  const midY = height / 2;
  const rowY = (i: number) => midY + (i - (nodes.length - 1) / 2) * ROW;

  const onKey = (href: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(href);
    }
  };

  const connectorCls =
    "motion-safe:[animation:mm-flow_0.9s_linear_infinite] transition-colors group-hover:stroke-primary-500";

  const connector = (x1: number, y1: number, x2: number, y2: number) => (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#a7f3d0"
      strokeWidth={1.75}
      strokeDasharray="1.5 5"
      strokeLinecap="round"
      markerEnd={`url(#${markerId})`}
      className={connectorCls}
    />
  );

  return (
    <svg
      viewBox={`0 0 700 ${height}`}
      className="w-full"
      style={compact ? { maxHeight: 220 } : undefined}
      role="group"
      aria-label="How a shift feeds your records"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#6ee7b7" />
        </marker>
      </defs>

      {/* Capture nodes: hub → node → destination, each a clickable group. */}
      {nodes.map((n, i) => {
        const cy = rowY(i);
        return (
          <g
            key={n.key}
            role="link"
            tabIndex={0}
            aria-label={`Go to ${n.label}`}
            onClick={() => navigate(n.href)}
            onKeyDown={onKey(n.href)}
            className="group cursor-pointer"
          >
            <title>{n.desc}</title>
            {connector(HUB_X + 60, midY, NODE.leftX, cy)}
            {connector(NODE.rightX, cy, DEST_X - 70, midY)}
            <rect
              x={NODE.cx - NODE.halfW}
              y={cy - NODE.halfH}
              width={NODE.halfW * 2}
              height={NODE.halfH * 2}
              rx={12}
              fill="#ffffff"
              stroke="#e2e8f0"
              className="transition-colors group-hover:fill-primary-50 group-hover:stroke-primary-300 group-focus-visible:stroke-primary-500"
            />
            <circle cx={NODE.cx - NODE.halfW + 18} cy={cy} r={4} fill={n.dot} />
            <text
              x={NODE.cx - NODE.halfW + 32}
              y={cy - 4}
              textAnchor="start"
              dominantBaseline="central"
              fontSize={12.5}
              fontWeight={600}
              fill="#334155"
            >
              {n.label}
            </text>
            <text
              x={NODE.cx - NODE.halfW + 32}
              y={cy + 11}
              textAnchor="start"
              dominantBaseline="central"
              fontSize={10.5}
              fill="#94a3b8"
            >
              {n.sub}
            </text>
          </g>
        );
      })}

      {/* Hub — every shift. */}
      <g
        role="link"
        tabIndex={0}
        aria-label={`Go to ${hub.label}`}
        onClick={() => navigate(hub.href)}
        onKeyDown={onKey(hub.href)}
        className="group cursor-pointer"
      >
        <title>{hub.desc}</title>
        <rect
          x={HUB_X - 60}
          y={midY - 26}
          width={120}
          height={52}
          rx={26}
          className="fill-primary-600 transition-colors group-hover:fill-primary-700"
        />
        <text
          x={HUB_X}
          y={midY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={15}
          fontWeight={700}
          fill="#ffffff"
        >
          {hub.label}
        </text>
      </g>

      {/* Destination — where it's all heading. */}
      <g
        role="link"
        tabIndex={0}
        aria-label={`Go to ${destination.label}`}
        onClick={() => navigate(destination.href)}
        onKeyDown={onKey(destination.href)}
        className="group cursor-pointer"
      >
        <title>{destination.desc}</title>
        <rect
          x={DEST_X - 68}
          y={midY - 28}
          width={136}
          height={56}
          rx={16}
          className="fill-secondary-600 transition-colors group-hover:fill-secondary-700"
        />
        <text
          x={DEST_X}
          y={destination.sub ? midY - 5 : midY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13.5}
          fontWeight={700}
          fill="#ffffff"
        >
          {destination.label}
        </text>
        {destination.sub && (
          <text
            x={DEST_X}
            y={midY + 12}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fill="#cfe4f7"
          >
            {destination.sub}
          </text>
        )}
      </g>
    </svg>
  );
}
