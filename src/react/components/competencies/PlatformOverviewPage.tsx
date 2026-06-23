import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PLATFORM_DESCRIPTIONS } from "../../../data/seed/proficiencies";
import { PROFICIENCY_STATUS_LABEL, type ProficiencyStatus } from "../../../domain/types";
import {
  evidenceCountByProficiency,
  matchesQuery,
  progressByProficiency,
  statusOf,
  summarisePlatforms,
} from "../../../logic/proficiencies";
import { useProficiencies } from "../../hooks";
import { Panel, inputCls } from "../ui";
import { EvidenceBadge, ProgressBar, SourceCredit, StatusPill } from "./shared";

type StatusFilter = "ALL" | ProficiencyStatus;
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NOT_YET_ACHIEVED", label: PROFICIENCY_STATUS_LABEL.NOT_YET_ACHIEVED },
  { key: "DEVELOPING", label: PROFICIENCY_STATUS_LABEL.DEVELOPING },
  { key: "ACHIEVED", label: PROFICIENCY_STATUS_LABEL.ACHIEVED },
];

/** Platform overview — searchable; 7 platform cards + Annexe A/B, each with % achieved. */
export function PlatformOverviewPage() {
  const { proficiencies, progress, evidenceLinks } = useProficiencies();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const byProf = useMemo(() => progressByProficiency(progress), [progress]);
  const counts = useMemo(() => evidenceCountByProficiency(evidenceLinks), [evidenceLinks]);
  const summaries = useMemo(
    () => summarisePlatforms(proficiencies, progress),
    [proficiencies, progress],
  );

  const filtering = q.trim() !== "" || statusFilter !== "ALL";
  const results = useMemo(
    () =>
      filtering
        ? proficiencies.filter(
            (p) =>
              matchesQuery(p, q) &&
              (statusFilter === "ALL" || statusOf(p.id, byProf) === statusFilter),
          )
        : [],
    [filtering, proficiencies, q, statusFilter, byProf],
  );

  if (proficiencies.length === 0) {
    return (
      <Panel title="Proficiencies">
        <p className="text-sm text-slate-400">Loading the proficiency list…</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search + status filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search proficiencies by code or keyword…"
          className={inputCls + " sm:max-w-md"}
        />
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition " +
                (statusFilter === f.key
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtering ? (
        <Panel title="Results" hint={`${results.length} matching`}>
          {results.length === 0 ? (
            <p className="text-sm text-slate-400">No proficiencies match.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.slice(0, 100).map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/competencies/proficiency/${p.id}`}
                    className="flex items-start gap-3 py-3 transition hover:bg-slate-50"
                  >
                    <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                      {p.code}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-slate-700">{p.statement}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <EvidenceBadge count={counts.get(p.id) ?? 0} />
                      <StatusPill status={statusOf(p.id, byProf)} />
                    </span>
                  </Link>
                </li>
              ))}
              {results.length > 100 && (
                <li className="py-2 text-xs text-slate-400">
                  Showing 100 of {results.length} — refine your search.
                </li>
              )}
            </ul>
          )}
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summaries.map((g) => (
            <Link
              key={g.key}
              to={`/competencies/platform/${g.key}`}
              className="group min-w-0 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-28px_rgba(16,24,40,0.22)] transition hover:ring-emerald-200"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                  {g.annexe === "NONE" ? `Platform ${g.platform}` : `Annexe ${g.annexe}`}
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {g.percentAchieved}%
                </span>
              </div>
              <h3 className="mt-1 text-sm font-semibold text-slate-800 group-hover:text-emerald-700">
                {g.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                {PLATFORM_DESCRIPTIONS[g.key]}
              </p>
              <div className="mt-3">
                <ProgressBar percent={g.percentAchieved} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {g.achieved}/{g.total} achieved
                {g.developing > 0 ? ` · ${g.developing} developing` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Panel title="About this list" hint="Where these statements come from">
        <SourceCredit />
      </Panel>
    </div>
  );
}
