import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { overallPercentAchieved, surfaceGaps } from "../../logic/proficiencies";
import { useProficiencies } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { PageHero } from "./ui";
import { Tabs } from "./Tabs";
import { PlatformOverviewPage } from "./competencies/PlatformOverviewPage";
import { PlatformDetailPage } from "./competencies/PlatformDetailPage";
import { ProficiencyDetailPage } from "./competencies/ProficiencyDetailPage";
import { GapsPage } from "./competencies/GapsPage";
import { ReadyToSignOffPage } from "./competencies/ReadyToSignOffPage";

const TABS = [
  { key: "overview", to: "/competencies", label: "Overview" },
  { key: "ready", to: "/competencies/ready", label: "Ready to sign off" },
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
  const { proficiencies, progress, evidenceLinks } = useProficiencies();
  const active = pathname.startsWith("/competencies/gaps")
    ? "gaps"
    : pathname.startsWith("/competencies/ready")
      ? "ready"
      : "overview";

  const percent = overallPercentAchieved(proficiencies, progress);
  const gapCount = user ? surfaceGaps(proficiencies, progress, user).length : 0;
  // Evidence gathered but not yet signed off in the PAD → ready for the assessor.
  const signedOffIds = new Set(progress.filter((p) => p.padSignedOff).map((p) => p.proficiencyId));
  const evidencedIds = new Set(evidenceLinks.map((l) => l.proficiencyId));
  const readyCount = [...evidencedIds].filter((id) => !signedOffIds.has(id)).length;

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

      <Tabs
        variant="segmented"
        ariaLabel="Competency sections"
        items={TABS.map((t) => ({
          to: t.to,
          active: active === t.key,
          label:
            t.key === "gaps" && gapCount > 0 ? (
              <>
                {t.label}
                <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                  {gapCount}
                </span>
              </>
            ) : t.key === "ready" && readyCount > 0 ? (
              <>
                {t.label}
                <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {readyCount}
                </span>
              </>
            ) : (
              t.label
            ),
        }))}
      />

      <Routes>
        <Route index element={<PlatformOverviewPage />} />
        <Route path="platform/:group" element={<PlatformDetailPage />} />
        <Route path="proficiency/:id" element={<ProficiencyDetailPage />} />
        <Route path="ready" element={<ReadyToSignOffPage />} />
        <Route path="gaps" element={<GapsPage />} />
        <Route path="*" element={<Navigate to="/competencies" replace />} />
      </Routes>
    </div>
  );
}
