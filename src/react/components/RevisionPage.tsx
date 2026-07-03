import { useMemo } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isoDate } from "../../logic/calendar";
import { daysUntil, resurfaceTopics } from "../../logic/revision";
import { useRevision } from "../hooks";
import { PageHero } from "./ui";
import { DueNowPage } from "./revision/DueNowPage";
import { SubjectsPage } from "./revision/SubjectsPage";
import { TargetsPage } from "./revision/TargetsPage";
import { TimetablePage } from "./revision/TimetablePage";

const TABS = [
  { key: "due", to: "/revision", label: "Due now" },
  { key: "subjects", to: "/revision/subjects", label: "Subjects" },
  { key: "timetable", to: "/revision/timetable", label: "Timetable" },
  { key: "targets", to: "/revision/targets", label: "Targets" },
];

const todayIso = () => isoDate(new Date());

function activeTab(pathname: string): string {
  if (pathname.startsWith("/revision/subjects")) return "subjects";
  if (pathname.startsWith("/revision/timetable")) return "timetable";
  if (pathname.startsWith("/revision/targets")) return "targets";
  return "due";
}

/**
 * Revision-timetable shell: targets, subjects → topics with confidence, spaced-
 * repetition resurfacing, and study sessions scheduled around placement shifts.
 * Segmented tab nav + nested routes. See spec-revision-timetable.md.
 */
export function RevisionPage() {
  const { pathname } = useLocation();
  const { topics, targets } = useRevision();
  const active = activeTab(pathname);

  const dueCount = useMemo(() => resurfaceTopics(topics, todayIso()).length, [topics]);
  const nextTarget = targets[0]; // repository returns soonest-first

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Study & wellbeing"
        title="Revision timetable"
        subtitle="Plan revision around your placement shifts, track confidence per topic, and let weak areas resurface before they bite."
        aside={
          topics.length > 0 || targets.length > 0 ? (
            <div>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                {dueCount}
              </div>
              <div className="text-xs text-slate-400">
                due now
                {nextTarget &&
                  ` · next: ${nextTarget.title} in ${daysUntil(nextTarget.date, todayIso())}d`}
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
        <Route index element={<DueNowPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="targets" element={<TargetsPage />} />
        <Route path="*" element={<Navigate to="/revision" replace />} />
      </Routes>
    </div>
  );
}
