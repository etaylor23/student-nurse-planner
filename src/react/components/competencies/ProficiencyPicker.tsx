import { useMemo, useState } from "react";
import type { Proficiency } from "../../../domain/types";
import { matchesQuery } from "../../../logic/proficiencies";
import { useProficiencies } from "../../hooks";
import { inputCls } from "../ui";

const MAX_RESULTS = 50;

/**
 * A searchable proficiency selector — pick one to attach as evidence. Shared by
 * the shift editor and the medication competency panel so "link to a proficiency"
 * works the same everywhere. `excludeIds` hides proficiencies already linked here.
 */
export function ProficiencyPicker({
  excludeIds,
  onPick,
  onClose,
}: {
  excludeIds?: Set<string>;
  onPick: (p: Proficiency) => void;
  onClose: () => void;
}) {
  const { proficiencies } = useProficiencies();
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const filtered = proficiencies.filter((p) => !excludeIds?.has(p.id) && matchesQuery(p, q));
    return { rows: filtered.slice(0, MAX_RESULTS), total: filtered.length };
  }, [proficiencies, excludeIds, q]);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by code or keyword…"
          className={inputCls + " py-2"}
        />
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      <ul className="max-h-64 space-y-0.5 overflow-y-auto">
        {results.rows.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white"
            >
              <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                {p.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.statement}</span>
            </button>
          </li>
        ))}
        {results.rows.length === 0 && (
          <li className="px-2 py-4 text-center text-sm text-slate-400">
            No matching proficiencies.
          </li>
        )}
      </ul>
      {results.total > MAX_RESULTS && (
        <p className="mt-1.5 px-2 text-xs text-slate-400">
          Showing {MAX_RESULTS} of {results.total} — refine your search.
        </p>
      )}
    </div>
  );
}
