import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMedications } from "../../hooks";
import { distinctOptions, filterMedications } from "../../../logic/medications";
import { Panel, btnPrimary } from "../ui";

const filterCtl =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

const chip = "rounded-full px-2 py-0.5 text-xs font-medium";

export function MedicationListPage() {
  const { medications, conditions } = useMedications();
  // Search + filters are local UI refinements (not in the URL — they don't map to a
  // clean path; the rest of the app is path-based).
  const [q, setQ] = useState("");
  const [drugClass, setDrugClass] = useState("");
  const [bodySystem, setBodySystem] = useState("");
  const [condition, setCondition] = useState("");
  const clearFilters = () => {
    setQ("");
    setDrugClass("");
    setBodySystem("");
    setCondition("");
  };

  const conditionsByMed = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of conditions) {
      const arr = m.get(c.medicationId) ?? [];
      arr.push(c.condition);
      m.set(c.medicationId, arr);
    }
    return m;
  }, [conditions]);

  const options = useMemo(
    () => distinctOptions(medications, conditions),
    [medications, conditions],
  );
  const rows = useMemo(
    () => filterMedications(medications, conditionsByMed, { q, drugClass, bodySystem, condition }),
    [medications, conditionsByMed, q, drugClass, bodySystem, condition],
  );

  const isFiltered = !!(q || drugClass || bodySystem || condition);

  return (
    <Panel
      title="Your medications"
      hint="Search and filter your reference cards"
      action={
        <Link to="/medications/new" className={btnPrimary}>
          Add medication
        </Link>
      }
    >
      {medications.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or brand…"
            className={filterCtl + " min-w-[12rem] flex-1"}
            aria-label="Search medications"
          />
          <select
            value={drugClass}
            onChange={(e) => setDrugClass(e.target.value)}
            className={filterCtl}
            aria-label="Filter by drug class"
          >
            <option value="">All classes</option>
            {options.classes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={bodySystem}
            onChange={(e) => setBodySystem(e.target.value)}
            className={filterCtl}
            aria-label="Filter by body system"
          >
            <option value="">All systems</option>
            {options.systems.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className={filterCtl}
            aria-label="Filter by condition"
          >
            <option value="">All conditions</option>
            {options.conditions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-emerald-600"
            >
              Clear ({rows.length} of {medications.length})
            </button>
          )}
        </div>
      )}

      {medications.length === 0 ? (
        <EmptyState />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          No medications match these filters.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => {
            const conds = conditionsByMed.get(m.id) ?? [];
            return (
              <li key={m.id}>
                <Link
                  to={`/medications/${m.id}`}
                  className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30"
                >
                  <p className="font-medium text-slate-900">{m.name}</p>
                  {m.brandNames && <p className="text-xs text-slate-400">{m.brandNames}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.drugClass && (
                      <span
                        className={`${chip} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100`}
                      >
                        {m.drugClass}
                      </span>
                    )}
                    {m.bodySystem && (
                      <span className={`${chip} bg-slate-100 text-slate-600`}>{m.bodySystem}</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {conds.length} condition{conds.length === 1 ? "" : "s"}
                    {m.routes ? ` · ${m.routes}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
      <p className="text-sm font-medium text-slate-500">No medications yet</p>
      <p className="text-xs text-slate-400">
        Add your first reference card to start building your notes.
      </p>
      <Link to="/medications/new" className={`${btnPrimary} mt-2`}>
        Add your first medication
      </Link>
    </div>
  );
}
