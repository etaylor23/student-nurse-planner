import { useEffect, useState } from "react";
import type { BreakRule } from "../../domain/types";
import { useBreakRules } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { btnGhostSm, btnPrimary } from "./ui";

const SENTINEL = Number.MAX_SAFE_INTEGER;

// Compact, right-sized number field (no `w-full`, unlike the shared inputCls).
const numInput =
  "w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

/** One bounded band in the editor: "shifts up to `upto` hours → `brk` min break". */
type Threshold = { upto: string; brk: string };

/** Friendly read-only summary: "Up to 6h: none · 6–9h: 30 min · Over 9h: 60 min". */
function summarise(rules: BreakRule[]): string {
  const sorted = [...rules].sort((a, b) => a.orderIndex - b.orderIndex);
  let prev = 0;
  return sorted
    .map((r, i) => {
      const isLast = r.maxShiftMins >= SENTINEL;
      const lo = prev / 60;
      const hi = r.maxShiftMins / 60;
      prev = r.maxShiftMins;
      const range = isLast ? `Over ${lo}h` : i === 0 ? `Up to ${hi}h` : `${lo}–${hi}h`;
      return `${range}: ${r.breakMins ? `${r.breakMins} min` : "none"}`;
    })
    .join("  ·  ");
}

export function BreakRulesEditor() {
  const { repo, user } = useRepository();
  const { rules, reload } = useBreakRules();
  const [open, setOpen] = useState(false);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [aboveBrk, setAboveBrk] = useState("0");
  const [saved, setSaved] = useState(false);

  // Keep the editable rows in sync with the effective rules (on load / save / reset).
  useEffect(() => {
    if (rules.length === 0) return;
    const sorted = [...rules].sort((a, b) => a.orderIndex - b.orderIndex);
    const last = sorted[sorted.length - 1];
    setThresholds(
      sorted
        .slice(0, -1)
        .map((r) => ({ upto: String(r.maxShiftMins / 60), brk: String(r.breakMins) })),
    );
    setAboveBrk(String(last.breakMins));
  }, [rules]);

  const setThreshold = (i: number, field: keyof Threshold, val: string) => {
    setSaved(false);
    setThresholds((ts) => ts.map((t, j) => (j === i ? { ...t, [field]: val } : t)));
  };
  const removeThreshold = (i: number) => {
    setSaved(false);
    setThresholds((ts) => ts.filter((_, j) => j !== i));
  };
  const addThreshold = () => {
    setSaved(false);
    setThresholds((ts) => [...ts, { upto: "", brk: "0" }]);
  };

  const buildRules = (): Array<Pick<BreakRule, "minShiftMins" | "maxShiftMins" | "breakMins">> => {
    const parsed = thresholds
      .map((t) => ({
        upto: Math.round((parseFloat(t.upto) || 0) * 60),
        brk: Math.max(0, Math.round(parseFloat(t.brk) || 0)),
      }))
      .filter((p) => p.upto > 0)
      .sort((a, b) => a.upto - b.upto);

    const out: Array<Pick<BreakRule, "minShiftMins" | "maxShiftMins" | "breakMins">> = [];
    let prevMax = -1;
    for (const p of parsed) {
      out.push({ minShiftMins: Math.max(0, prevMax + 1), maxShiftMins: p.upto, breakMins: p.brk });
      prevMax = p.upto;
    }
    out.push({
      minShiftMins: Math.max(0, prevMax + 1),
      maxShiftMins: SENTINEL,
      breakMins: Math.max(0, Math.round(parseFloat(aboveBrk) || 0)),
    });
    return out;
  };

  const save = async () => {
    if (!user) return;
    await repo.saveBreakRules(user.id, buildRules());
    await reload();
    setSaved(true);
  };

  const reset = async () => {
    if (!user) return;
    await repo.resetBreakRules(user.id);
    await reload();
    setSaved(false);
  };

  const lastUpto = thresholds.length ? thresholds[thresholds.length - 1].upto || "?" : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{summarise(rules)}</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className={btnGhostSm}>
          {open ? "Done" : "Customise"}
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400">
            Break time taken off a shift before it counts, by how long the shift is.
          </p>

          <div className="max-w-sm overflow-hidden rounded-xl ring-1 ring-slate-200/70">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Shift length</th>
                  <th className="px-3 py-2 font-medium">Break</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {thresholds.map((t, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        {i === 0 ? (
                          <span>Up to</span>
                        ) : (
                          <span className="tabular-nums text-slate-400">
                            {thresholds[i - 1].upto || "?"}–
                          </span>
                        )}
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={t.upto}
                          onChange={(e) => setThreshold(i, "upto", e.target.value)}
                          className={numInput}
                          aria-label="Upper shift length (hours)"
                        />
                        <span>h</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={t.brk}
                          onChange={(e) => setThreshold(i, "brk", e.target.value)}
                          className={numInput}
                          aria-label="Break (minutes)"
                        />
                        <span>min</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeThreshold(i)}
                        aria-label="Remove band"
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="M5 12h14" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2 text-slate-600">
                    {lastUpto === null ? "All shifts" : `Over ${lastUpto} h`}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={aboveBrk}
                        onChange={(e) => {
                          setSaved(false);
                          setAboveBrk(e.target.value);
                        }}
                        className={numInput}
                        aria-label="Break for longer shifts (minutes)"
                      />
                      <span>min</span>
                    </div>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={addThreshold} className={btnGhostSm}>
              + Add band
            </button>
            <button type="button" onClick={reset} className={btnGhostSm}>
              Reset
            </button>
            <button type="button" onClick={save} className={btnPrimary}>
              Save
            </button>
            {saved && <span className="text-xs font-medium text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
