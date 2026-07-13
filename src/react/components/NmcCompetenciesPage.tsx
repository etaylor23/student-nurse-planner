import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { overallPercentAchieved, surfaceGaps } from "../../logic/proficiencies";
import { useProficiencies } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { PageHero } from "./ui";
import { PlatformOverviewPage } from "./competencies/PlatformOverviewPage";
import { PlatformDetailPage } from "./competencies/PlatformDetailPage";
import { ProficiencyDetailPage } from "./competencies/ProficiencyDetailPage";
import { GapsPage } from "./competencies/GapsPage";

const TABS = [
  { key: "overview", to: "/competencies", label: "Overview" },
  { key: "gaps", to: "/competencies/gaps", label: "Gaps" },
];

/**
 * NMC competency tracker shell: a PAD-style tracker over the national proficiency
 * list. Segmented tab nav + nested routes so every view is reachable by URL.
 * See spec-competency-tracker.md.
 */
export function NmcCompetenciesPage() {
  const { pathname } = useLocation();
  const { user } = useRepository();
  const { proficiencies, progress } = useProficiencies();
  const active = pathname.startsWith("/competencies/gaps") ? "gaps" : "overview";

  const percent = overallPercentAchieved(proficiencies, progress);
  const gapCount = user ? surfaceGaps(proficiencies, progress, user).length : 0;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Practice assessment"
        title="NMC competencies"
        subtitle="Track the national proficiencies PAD-style: not yet achieved → developing → achieved, with a dated history and evidence."
        aside={
          proficiencies.length > 0 ? (
            <div>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
                {percent}%
              </div>
              <div className="text-xs text-slate-400">achieved · {gapCount} gaps</div>
            </div>
          ) : undefined
        }
      />

      <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            className={
              "rounded-lg px-3.5 py-2 text-sm font-medium transition " +
              (active === t.key
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700")
            }
          >
            {t.label}
            {t.key === "gaps" && gapCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                {gapCount}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <Routes>
        <Route index element={<PlatformOverviewPage />} />
        <Route path="platform/:group" element={<PlatformDetailPage />} />
        <Route path="proficiency/:id" element={<ProficiencyDetailPage />} />
        <Route path="gaps" element={<GapsPage />} />
        <Route path="*" element={<Navigate to="/competencies" replace />} />
      </Routes>
    </div>
  );
}
