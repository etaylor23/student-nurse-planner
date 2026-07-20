import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
import { useProficiencies, useSkills } from "../../hooks";
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
  const { evidenceLinks } = useProficiencies();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("ALL");
  // Carried in from a shift editor's "Sign off a skill" CTA — passed on to the chosen
  // skill so its sign-off form pre-selects the shift (U8).
  const prefillShiftId = (useLocation().state as { prefillShiftId?: string } | null)
    ?.prefillShiftId;
  const linkState = prefillShiftId ? { prefillShiftId } : undefined;

  const bySkill = useMemo(() => progressBySkill(progress), [progress]);
  // How many NMC proficiencies each skill evidences — the "this counts" signpost, so the
  // link to the PAD is visible from the list, not just the skill's detail page.
  const evidenceCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of evidenceLinks) {
      if (l.evidenceType === "SKILL") m.set(l.evidenceId, (m.get(l.evidenceId) ?? 0) + 1);
    }
    return m;
  }, [evidenceLinks]);
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
      {prefillShiftId && (
        <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-800 ring-1 ring-sky-100">
          Pick a skill to sign off — it'll be linked to the shift you came from.
        </p>
      )}
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
                const evCount = evidenceCount.get(s.id) ?? 0;
                return (
                  <li key={s.id}>
                    <Link
                      to={`/skills/${s.id}`}
                      state={linkState}
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
                        {evCount > 0 && (
                          <span
                            title={`Evidences ${evCount} NMC proficienc${evCount === 1 ? "y" : "ies"}`}
                            className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700 ring-1 ring-primary-100"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-2.5 w-2.5"
                              aria-hidden="true"
                            >
                              <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" />
                            </svg>
                            {evCount}
                          </span>
                        )}
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
