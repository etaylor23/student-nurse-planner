import { useEffect, useState } from "react";
import type { BreakRule } from "../../domain/types";
import { useBreakRules } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { btnGhostSm, btnPrimary, inputCls } from "./ui";

const SENTINEL = Number.MAX_SAFE_INTEGER;

/** One bounded band in the editor: "shifts up to `upto` hours → `brk` min break". */
type Threshold = { upto: string; brk: string };

function summarise(rules: BreakRule[]): string {
  return [...rules]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((r) => {
      const label = r.maxShiftMins >= SENTINEL ? "Longer" : `≤${r.maxShiftMins / 60} h`;
      return `${label}: ${r.breakMins ? `${r.breakMins} min` : "no break"}`;
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
      sorted.slice(0, -1).map((r) => ({ upto: String(r.maxShiftMins / 60), brk: String(r.breakMins) })),
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{summarise(rules)}</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className={btnGhostSm}>
          {open ? "Done" : "Customise"}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="space-y-2">
            {thresholds.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>Up to</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={t.upto}
                  onChange={(e) => setThreshold(i, "upto", e.target.value)}
                  className={`${inputCls} w-20`}
                  aria-label="Shift length threshold (hours)"
                />
                <span>h →</span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={t.brk}
                  onChange={(e) => setThreshold(i, "brk", e.target.value)}
                  className={`${inputCls} w-20`}
                  aria-label="Break (minutes)"
                />
                <span>min break</span>
                <button
                  type="button"
                  onClick={() => removeThreshold(i)}
                  aria-label="Remove band"
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M5 12h14" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>Longer shifts →</span>
              <input
                type="number"
                min="0"
                step="5"
                value={aboveBrk}
                onChange={(e) => {
                  setSaved(false);
                  setAboveBrk(e.target.value);
                }}
                className={`${inputCls} w-20`}
                aria-label="Break for longer shifts (minutes)"
              />
              <span>min break</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={addThreshold} className={btnGhostSm}>
              + Add band
            </button>
            <button type="button" onClick={save} className={btnPrimary}>
              Save rules
            </button>
            <button type="button" onClick={reset} className={btnGhostSm}>
              Reset to defaults
            </button>
            {saved && <span className="text-xs font-medium text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
