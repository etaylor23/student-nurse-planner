import { useMemo } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReflectionSection } from "../../domain/types";
import { gibbsCompleteness } from "../../logic/gibbs";
import { useReflections } from "../hooks";
import { PageHero } from "./ui";
import { NewReflectionPage } from "./reflection/NewReflectionPage";
import { ReflectionDetailPage } from "./reflection/ReflectionDetailPage";
import { ReflectionListPage } from "./reflection/ReflectionListPage";

const TABS = [
  { key: "all", to: "/reflection", label: "All reflections" },
  { key: "new", to: "/reflection/new", label: "New reflection" },
];

/**
 * Reflection-on-practice shell: structured Gibbs reflections, private and lockable,
 * linkable to proficiencies as evidence. Segmented tab nav + nested routes so every
 * view is reachable by URL. See spec-reflection.md.
 */
export function ReflectionPage() {
  const { pathname } = useLocation();
  const { reflections, sections } = useReflections();
  const active = pathname.startsWith("/reflection/new") ? "new" : "all";

  // Hero summary: how many reflections, and how many are complete across all six stages.
  const complete = useMemo(() => {
    const byReflection = new Map<string, ReflectionSection[]>();
    for (const s of sections) {
      const arr = byReflection.get(s.reflectionId) ?? [];
      arr.push(s);
      byReflection.set(s.reflectionId, arr);
    }
    return reflections.filter((r) => gibbsCompleteness(byReflection.get(r.id) ?? []).complete)
      .length;
  }, [reflections, sections]);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Practice development"
        title="Reflection on practice"
        subtitle="Turn placement experiences into structured Gibbs reflections — private, lockable, and attachable to your proficiencies as evidence."
        aside={
          reflections.length > 0 ? (
            <div>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
                {reflections.length}
              </div>
              <div className="text-xs text-slate-400">
                reflection{reflections.length === 1 ? "" : "s"} · {complete} complete
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
        <Route index element={<ReflectionListPage />} />
        <Route path="new" element={<NewReflectionPage />} />
        <Route path=":id" element={<ReflectionDetailPage />} />
        <Route path="*" element={<Navigate to="/reflection" replace />} />
      </Routes>
    </div>
  );
}
