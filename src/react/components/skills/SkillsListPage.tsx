import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SKILL_STAGE_LABEL, type SkillStage } from "../../../domain/types";
import { annexeCodeOf } from "../../../data/seed/skills";
import {
  groupSkillsByCategory,
  progressBySkill,
  skillMatchesFilter,
  skillMatchesQuery,
  skillStageOf,
  type SkillFilter,
} from "../../../logic/skills";
import { useSkills } from "../../hooks";
import { Panel, btnPrimary, inputCls } from "../ui";
import { SignedOffBadge, SkillStageBadge } from "./shared";

const STAGE_FILTERS: SkillStage[] = ["OBSERVED", "ASSISTED", "PERFORMED_UNDER_SUPERVISION"];
const FILTERS: { key: SkillFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  ...STAGE_FILTERS.map((s) => ({ key: s as SkillFilter, label: SKILL_STAGE_LABEL[s] })),
  { key: "SIGNED_OFF", label: "Signed off" },
];

/** Skills list — searchable + stage-filtered, grouped by category. */
export function SkillsListPage() {
  const { skills, progress } = useSkills();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("ALL");

  const bySkill = useMemo(() => progressBySkill(progress), [progress]);
  const groups = useMemo(() => {
    const matching = skills.filter(
      (s) => skillMatchesQuery(s, q) && skillMatchesFilter(bySkill.get(s.id), filter),
    );
    return groupSkillsByCategory(matching);
  }, [skills, q, filter, bySkill]);

  if (skills.length === 0) {
    return (
      <Panel title="Skills">
        <p className="text-sm text-slate-400">Loading the Annexe B baseline skills…</p>
      </Panel>
    );
  }

  const totalMatching = groups.reduce((n, g) => n + g.skills.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search skills by name or category…"
          className={inputCls + " sm:max-w-md"}
        />
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition " +
                (filter === f.key
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link to="/skills/new" className={btnPrimary + " sm:ml-auto"}>
          Add custom skill
        </Link>
      </div>

      {totalMatching === 0 ? (
        <Panel title="No skills match">
          <p className="text-sm text-slate-400">Try a different search term or filter.</p>
        </Panel>
      ) : (
        groups.map((g) => (
          <Panel
            key={g.category}
            title={g.category}
            hint={`${g.skills.length} skill${g.skills.length === 1 ? "" : "s"}`}
          >
            <ul className="divide-y divide-slate-100">
              {g.skills.map((s) => {
                const prog = bySkill.get(s.id);
                return (
                  <li key={s.id}>
                    <Link
                      to={`/skills/${s.id}`}
                      className="flex items-start gap-3 py-3 transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 text-sm text-slate-700">
                        {annexeCodeOf(s) && (
                          <span
                            className="mr-2 font-semibold tabular-nums text-slate-400"
                            title="Maps 1:1 to this Annexe B proficiency"
                          >
                            {annexeCodeOf(s)}
                          </span>
                        )}
                        {s.name}
                        {s.source === "CUSTOM" && (
                          <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Custom
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {prog?.signedOff ? (
                          <SignedOffBadge />
                        ) : (
                          <SkillStageBadge stage={skillStageOf(prog)} />
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))
      )}
    </div>
  );
}
