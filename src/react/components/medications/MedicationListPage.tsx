import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMedications } from "../../hooks";
import { distinctOptions, filterMedications } from "../../../logic/medications";
import {
  buildMedFilterPath,
  EMPTY_FILTERS,
  isFiltered as anyFilter,
  parseMedFilters,
  type MedFilters,
} from "../../../logic/medicationFilters";
import { Panel, btnPrimary } from "../ui";

const filterCtl =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

const chip = "rounded-full px-2 py-0.5 text-xs font-medium";

export function MedicationListPage() {
  const { medications, conditions } = useMedications();
  // Filters are shareable, path-based state (/medications/filter/<key>/<value>…).
  const params = useParams();
  const navigate = useNavigate();
  const filters = parseMedFilters(params["*"]);
  const { q, drugClass, bodySystem, condition } = filters;
  const setFilter = (patch: Partial<MedFilters>) =>
    navigate(buildMedFilterPath({ ...filters, ...patch }), { replace: true });
  const clearFilters = () => navigate("/medications", { replace: true });

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

  const isFiltered = anyFilter(filters);

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
            onChange={(e) => setFilter({ q: e.target.value })}
            placeholder="Search name or brand…"
            className={filterCtl + " min-w-[12rem] flex-1"}
            aria-label="Search medications"
          />
          <select
            value={drugClass}
            onChange={(e) => setFilter({ drugClass: e.target.value })}
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
            onChange={(e) => setFilter({ bodySystem: e.target.value })}
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
            onChange={(e) => setFilter({ condition: e.target.value })}
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
              // Stretched-link card: the cover Link makes the whole card open the
              // detail, while the class/system chips sit above it as filter links.
              <li
                key={m.id}
                className="relative flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30"
              >
                <Link
                  to={`/medications/${m.id}`}
                  className="absolute inset-0 rounded-xl"
                  aria-label={`Open ${m.name}`}
                />
                <p className="font-medium text-slate-900">
                  {m.name}
                  {m.highAlert && (
                    <span
                      className="ml-1.5 align-middle text-rose-500"
                      title="High-alert medication"
                      aria-label="High-alert medication"
                    >
                      ⚠
                    </span>
                  )}
                </p>
                {m.brandNames && <p className="text-xs text-slate-400">{m.brandNames}</p>}
                <div className="relative z-10 mt-2 flex flex-wrap gap-1.5">
                  {m.drugClass && (
                    <Link
                      to={buildMedFilterPath({ ...EMPTY_FILTERS, drugClass: m.drugClass })}
                      title={`Filter by ${m.drugClass}`}
                      className={`${chip} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition hover:ring-emerald-300`}
                    >
                      {m.drugClass}
                    </Link>
                  )}
                  {m.bodySystem && (
                    <Link
                      to={buildMedFilterPath({ ...EMPTY_FILTERS, bodySystem: m.bodySystem })}
                      title={`Filter by ${m.bodySystem}`}
                      className={`${chip} bg-slate-100 text-slate-600 transition hover:bg-slate-200`}
                    >
                      {m.bodySystem}
                    </Link>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {conds.length} condition{conds.length === 1 ? "" : "s"}
                  {m.routes ? ` · ${m.routes}` : ""}
                </p>
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
