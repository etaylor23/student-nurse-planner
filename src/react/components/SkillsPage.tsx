import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { summariseSkills } from "../../logic/skills";
import { useSkills } from "../hooks";
import { PageHero } from "./ui";
import { SkillDetailPage } from "./skills/SkillDetailPage";
import { SkillFormPage } from "./skills/SkillFormPage";
import { SkillsListPage } from "./skills/SkillsListPage";

const TABS = [
  { key: "all", to: "/skills", label: "All skills" },
  { key: "new", to: "/skills/new", label: "Add custom skill" },
];

/**
 * Clinical skills tracker shell: the Annexe B baseline + custom skills, each tracked
 * through supervised stages to a permanent sign-off. Segmented tab nav + nested
 * routes so every view is reachable by URL. See spec-clinical-skills.md.
 */
export function SkillsPage() {
  const { pathname } = useLocation();
  const { skills, progress } = useSkills();
  const active = pathname.startsWith("/skills/new") ? "new" : "all";

  const summary = summariseSkills(skills, progress);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Practice development"
        title="Clinical skills"
        subtitle="Track each skill from observed → assisted → performed under supervision, then capture a permanent sign-off."
        aside={
          skills.length > 0 ? (
            <div>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
                {summary.signedOff}/{summary.total}
              </div>
              <div className="text-xs text-slate-400">
                signed off · {summary.inProgress} in progress
              </div>
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
          </Link>
        ))}
      </nav>

      <Routes>
        <Route index element={<SkillsListPage />} />
        <Route path="new" element={<SkillFormPage />} />
        <Route path=":id" element={<SkillDetailPage />} />
        <Route path="*" element={<Navigate to="/skills" replace />} />
      </Routes>
    </div>
  );
}
