import { type KeyboardEvent, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProficiencies, useReflections, useShifts, useSkills } from "../../hooks";

/**
 * "Capture once — feed everything": a left-to-right flow showing how a shift feeds the
 * user's real records, all pointing at one destination (NMC registration / the PAD).
 *
 * It's live + personal — each node shows the user's own counts — and doubles as
 * navigation (every node deep-links, keyboard-operable, with a hover description). The
 * connectors carry a motion-safe directional "flow" toward registration; under
 * prefers-reduced-motion they render as static arrowed lines. Shown on Home for everyone
 * (not just onboarding), so it stays a compact at-a-glance map of the connected record.
 */
interface FlowNode {
  key: string;
  label: string;
  sub: string;
  desc: string;
  href: string;
  dot: string;
  cy: number;
}

// Geometry (viewBox 0 0 700 320): hub on the left, four capture nodes down the middle,
// the registration destination on the right.
const HUB = { cx: 84, cy: 156 };
const REG = { cx: 622, cy: 156 };
const NODE = { cx: 352, halfW: 94, halfH: 24, leftX: 258, rightX: 446 };

export function MindmapBand() {
  const navigate = useNavigate();
  const { progress: skillProgress } = useSkills();
  const { summary } = useShifts();
  const { reflections } = useReflections();
  const { evidenceLinks } = useProficiencies();

  const nodes: FlowNode[] = useMemo(() => {
    const evidenced = new Set(evidenceLinks.map((l) => l.proficiencyId)).size;
    return [
      {
        key: "skills",
        label: "Clinical skills",
        sub: `${skillProgress.length} tracked`,
        desc: "Your growing clinical-skills record.",
        href: "/skills",
        dot: "var(--color-primary-600)",
        cy: 54,
      },
      {
        key: "competencies",
        label: "NMC competencies",
        sub: `${evidenced} evidenced`,
        desc: "Evidence building toward the NMC proficiencies.",
        href: "/competencies",
        dot: "var(--color-secondary-600)",
        cy: 122,
      },
      {
        key: "hours",
        label: "Practice hours",
        sub: `${summary.practiceHours} / ${summary.targetHours.toLocaleString()} h`,
        desc: "Hours counting toward your 2,300.",
        href: "/placement-hours",
        dot: "var(--color-primary-500)",
        cy: 190,
      },
      {
        key: "reflections",
        label: "Reflections",
        sub: `${reflections.length} written`,
        desc: "Turning shifts into learning.",
        href: "/reflection",
        dot: "var(--color-accent-400)",
        cy: 258,
      },
    ];
  }, [skillProgress, summary, reflections, evidenceLinks]);

  const onKey = (href: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(href);
    }
  };

  const connectorCls =
    "motion-safe:[animation:mm-flow_0.9s_linear_infinite] transition-colors group-hover:stroke-primary-500";

  return (
    <section
      aria-label="How PlaceMate connects"
      className="rounded-2xl bg-gradient-to-br from-primary-50/70 to-secondary-50/40 p-5 ring-1 ring-primary-100"
    >
      <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-primary-600">
        How it all connects
      </p>
      <h2 className="mt-1 text-center text-lg font-semibold tracking-tight text-ink">
        Capture once — feed everything
      </h2>

      <div className="mx-auto mt-3 max-w-[620px]">
        <svg viewBox="0 0 700 320" className="w-full">
          <defs>
            <marker
              id="mm-arrow"
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

          {/* Capture nodes: hub → node → registration, each a clickable group. */}
          {nodes.map((n) => (
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
              <line
                x1={HUB.cx + 60}
                y1={HUB.cy}
                x2={NODE.leftX}
                y2={n.cy}
                stroke="#a7f3d0"
                strokeWidth={1.75}
                strokeDasharray="1.5 5"
                strokeLinecap="round"
                markerEnd="url(#mm-arrow)"
                className={connectorCls}
              />
              <line
                x1={NODE.rightX}
                y1={n.cy}
                x2={REG.cx - 70}
                y2={REG.cy}
                stroke="#a7f3d0"
                strokeWidth={1.75}
                strokeDasharray="1.5 5"
                strokeLinecap="round"
                markerEnd="url(#mm-arrow)"
                className={connectorCls}
              />
              <rect
                x={NODE.cx - NODE.halfW}
                y={n.cy - NODE.halfH}
                width={NODE.halfW * 2}
                height={NODE.halfH * 2}
                rx={12}
                fill="#ffffff"
                stroke="#e2e8f0"
                className="transition-colors group-hover:fill-primary-50 group-hover:stroke-primary-300 group-focus-visible:stroke-primary-500"
              />
              <circle cx={NODE.cx - NODE.halfW + 18} cy={n.cy} r={4} fill={n.dot} />
              <text
                x={NODE.cx - NODE.halfW + 32}
                y={n.cy - 4}
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
                y={n.cy + 11}
                textAnchor="start"
                dominantBaseline="central"
                fontSize={10.5}
                fill="#94a3b8"
              >
                {n.sub}
              </text>
            </g>
          ))}

          {/* Hub — every shift. Links to the planner. */}
          <g
            role="link"
            tabIndex={0}
            aria-label="Go to the planner"
            onClick={() => navigate("/planner")}
            onKeyDown={onKey("/planner")}
            className="group cursor-pointer"
          >
            <title>Every shift you work on placement.</title>
            <rect
              x={HUB.cx - 60}
              y={HUB.cy - 26}
              width={120}
              height={52}
              rx={26}
              className="fill-primary-600 transition-colors group-hover:fill-primary-700"
            />
            <text
              x={HUB.cx}
              y={HUB.cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={15}
              fontWeight={700}
              fill="#ffffff"
            >
              A shift
            </text>
          </g>

          {/* Destination — NMC registration / the PAD. */}
          <g
            role="link"
            tabIndex={0}
            aria-label="Go to your competencies"
            onClick={() => navigate("/competencies")}
            onKeyDown={onKey("/competencies")}
            className="group cursor-pointer"
          >
            <title>The NMC register — where it's all heading.</title>
            <rect
              x={REG.cx - 68}
              y={REG.cy - 28}
              width={136}
              height={56}
              rx={16}
              className="fill-secondary-600 transition-colors group-hover:fill-secondary-700"
            />
            <text
              x={REG.cx}
              y={REG.cy - 5}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13.5}
              fontWeight={700}
              fill="#ffffff"
            >
              Registration
            </text>
            <text
              x={REG.cx}
              y={REG.cy + 12}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fill="#cfe4f7"
            >
              your PAD
            </text>
          </g>
        </svg>
      </div>

      <p className="mx-auto mt-2 max-w-md text-center text-sm text-slate-500">
        Log something once on a shift and it flows to your skills, competency evidence,
        hours and reflections — all heading toward registration.
      </p>
    </section>
  );
}
