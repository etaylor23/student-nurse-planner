import { useMemo, useState } from "react";
import { seedProficiencies } from "../../../data/seed/proficiencies";

/**
 * The full NMC taxonomy, reachable when none of the shortlist fits (P28).
 *
 * The shortlist is a suggestion, and P28 only holds if there is a way past it — otherwise a
 * student whose note evidences something the classifier missed has no route to record it, and
 * the shortlist stops being a suggestion and becomes a cage.
 *
 * 219 statements is far too many to scroll, so this searches code AND statement text, and
 * shows nothing until asked: the picker is the exception path, not the default one.
 */

const ALL = seedProficiencies.map((p) => ({
  id: p.id,
  code: p.code,
  statement: p.statement,
  group: p.annexe !== "NONE" ? `Annexe ${p.annexe}` : `Platform ${p.platform}`,
}));

const MAX_SHOWN = 30;

export function ProficiencyPicker({ onPick }: { onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ALL.slice(0, MAX_SHOWN);
    return ALL.filter(
      (p) => p.code.toLowerCase().includes(needle) || p.statement.toLowerCase().includes(needle),
    ).slice(0, MAX_SHOWN);
  }, [q]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 block text-xs font-medium text-secondary-700 hover:underline"
      >
        Find a different proficiency
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <input
        type="search"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search all 219 — e.g. “medicines”, “4.15”, “handover”"
        aria-label="Search NMC proficiencies"
        className="block w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-ink-900"
      />
      <ul className="mt-1.5 max-h-52 space-y-1 overflow-y-auto">
        {results.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                onPick(p.code);
                setOpen(false);
                setQ("");
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-left hover:border-secondary-300"
            >
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {p.group} · {p.code}
              </span>
              <span className="block text-xs leading-snug text-slate-700">{p.statement}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-1 py-2 text-xs text-slate-500">Nothing matches “{q}”.</li>
        )}
      </ul>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {q.trim()
            ? `${results.length} shown`
            : `first ${Math.min(MAX_SHOWN, ALL.length)} of ${ALL.length}`}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
        >
          Close
        </button>
      </div>
    </div>
  );
}
