/**
 * Illustrative onboarding mindmap — "capture once, it feeds everything". A hub-and-spoke
 * concept diagram shown above the getting-started tour on Home, teaching the connected
 * model before the user has any data of their own. (Later: swap for the user's live graph.)
 *
 * The spokes reveal with a gentle stagger via the `motion-safe:` variant only, so under
 * prefers-reduced-motion the diagram is simply shown, fully and statically.
 */
interface Spoke {
  label: string;
  x: number;
  y: number;
  dot: string;
}

const HUB = { x: 300, y: 160 };
const SPOKES: Spoke[] = [
  { label: "Clinical skills", x: 300, y: 48, dot: "#059669" },
  { label: "NMC competencies", x: 496, y: 160, dot: "#005eb8" },
  { label: "Practice hours", x: 300, y: 272, dot: "#10b981" },
  { label: "Reflections", x: 104, y: 160, dot: "#fb7185" },
];

export function MindmapBand() {
  return (
    <section
      aria-label="How PlaceMate connects"
      className="rounded-2xl bg-gradient-to-br from-primary-50/70 to-secondary-50/40 p-5 ring-1 ring-primary-100"
    >
      <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-primary-600">
        How it all connects
      </p>
      <h2 className="mt-1 text-center text-lg font-semibold tracking-tight text-ink">
        Capture once — it feeds everything
      </h2>

      <div className="mx-auto mt-3 max-w-[560px]">
        <svg
          viewBox="0 0 600 320"
          className="w-full"
          role="img"
          aria-label="A shift connects to clinical skills, NMC competencies, practice hours and reflections"
        >
          {SPOKES.map((s, i) => (
            <g
              key={s.label}
              className="motion-safe:[animation:mm-reveal_0.6s_ease-out_both]"
              style={{ animationDelay: `${0.25 + i * 0.22}s` }}
            >
              <line
                x1={HUB.x}
                y1={HUB.y}
                x2={s.x}
                y2={s.y}
                stroke="#a7f3d0"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <rect
                x={s.x - 90}
                y={s.y - 22}
                width={180}
                height={44}
                rx={22}
                fill="#ffffff"
                stroke="#e2e8f0"
              />
              <circle cx={s.x - 70} cy={s.y} r={4} fill={s.dot} />
              <text
                x={s.x - 56}
                y={s.y}
                textAnchor="start"
                dominantBaseline="central"
                fontSize={13}
                fontWeight={500}
                fill="#334155"
              >
                {s.label}
              </text>
            </g>
          ))}

          {/* Hub, drawn on top of the connectors. */}
          <rect x={HUB.x - 66} y={HUB.y - 26} width={132} height={52} rx={26} fill="#059669" />
          <text
            x={HUB.x}
            y={HUB.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            fontWeight={700}
            fill="#ffffff"
          >
            A shift
          </text>
        </svg>
      </div>

      <p className="mx-auto mt-2 max-w-md text-center text-sm text-slate-500">
        Log something once on a shift and it flows to your skills record, NMC evidence,
        practice hours and reflections — all counting toward registration.
      </p>
    </section>
  );
}
