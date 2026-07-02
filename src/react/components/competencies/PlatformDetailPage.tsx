import { Fragment, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { PLATFORM_DESCRIPTIONS } from "../../../data/seed/proficiencies";
import {
  evidenceCountByProficiency,
  groupKeyOf,
  progressByProficiency,
  statusOf,
} from "../../../logic/proficiencies";
import { progressBySkill, skillStageOf } from "../../../logic/skills";
import { useProficiencies, useSkills } from "../../hooks";
import { SignedOffBadge, SkillStageBadge } from "../skills/shared";
import { Panel, btnGhostSm } from "../ui";
import { EvidenceBadge, StatusPill } from "./shared";

/** Platform / annexe detail — the proficiency list with status pills + target tags. */
export function PlatformDetailPage() {
  const { group } = useParams();
  const { proficiencies, progress, evidenceLinks } = useProficiencies();
  // Annexe B proficiencies map 1:1 to a baseline skill by code (prof_B2.1 ↔ skill_B2.1);
  // surface that skill's stage/sign-off here so the two trackers read as one journey.
  const { skills, progress: skillProgress } = useSkills();

  const byProf = useMemo(() => progressByProficiency(progress), [progress]);
  const counts = useMemo(() => evidenceCountByProficiency(evidenceLinks), [evidenceLinks]);
  const skillProgressBy = useMemo(() => progressBySkill(skillProgress), [skillProgress]);
  const skillIds = useMemo(() => new Set(skills.map((s) => s.id)), [skills]);
  const rows = useMemo(
    () => proficiencies.filter((p) => groupKeyOf(p) === group),
    [proficiencies, group],
  );

  if (proficiencies.length === 0) {
    return (
      <Panel title="Proficiencies">
        <p className="text-sm text-slate-400">Loading…</p>
      </Panel>
    );
  }
  if (rows.length === 0) {
    return (
      <Panel title="Not found">
        <p className="text-sm text-slate-400">No proficiencies for this section.</p>
        <Link to="/competencies" className={btnGhostSm + " mt-3"}>
          Back to overview
        </Link>
      </Panel>
    );
  }

  const isAnnexe = rows[0].annexe !== "NONE";
  const heading = isAnnexe
    ? `Annexe ${rows[0].annexe}`
    : `Platform ${rows[0].platform} · ${rows[0].platformTitle}`;

  return (
    <div className="space-y-4">
      <Link to="/competencies" className="text-sm font-medium text-emerald-700">
        ← Overview
      </Link>
      <Panel title={heading} hint={PLATFORM_DESCRIPTIONS[group ?? ""]}>
        <ul className="divide-y divide-slate-100">
          {rows.map((p, i) => {
            // For annexes, show a Part subheading whenever the part title changes.
            const showSubhead =
              isAnnexe && (i === 0 || rows[i - 1].platformTitle !== p.platformTitle);
            const progressRow = byProf.get(p.id);
            // The 1:1 baseline skill for an Annexe B proficiency, if it exists.
            const skillId = p.annexe === "B" ? `skill_${p.code}` : null;
            const hasSkill = skillId != null && skillIds.has(skillId);
            const skillProg = skillId ? skillProgressBy.get(skillId) : undefined;
            return (
              <Fragment key={p.id}>
                {showSubhead && (
                  <li className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {p.platformTitle.replace(/^Annexe [AB] /, "")}
                  </li>
                )}
                <li>
                  <Link
                    to={`/competencies/proficiency/${p.id}`}
                    className={
                      "flex items-start gap-3 pt-3 transition hover:bg-slate-50 " +
                      (hasSkill ? "pb-1" : "pb-3")
                    }
                  >
                    <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                      {p.code}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-slate-700">{p.statement}</span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="flex items-center gap-1.5">
                        <EvidenceBadge count={counts.get(p.id) ?? 0} />
                        <StatusPill status={statusOf(p.id, byProf)} />
                      </span>
                      {progressRow?.targetPart != null && (
                        <span className="text-[10px] font-medium text-slate-400">
                          Target: Part {progressRow.targetPart}
                        </span>
                      )}
                    </span>
                  </Link>
                  {hasSkill && (
                    <Link
                      to={`/skills/${skillId}`}
                      className="mb-3 ml-[3.75rem] flex w-fit items-center gap-1.5 text-xs text-slate-400 transition hover:text-emerald-700"
                      title="Open the matching clinical skill"
                    >
                      <span>Skill</span>
                      {skillProg?.signedOff ? (
                        <SignedOffBadge />
                      ) : (
                        <SkillStageBadge stage={skillStageOf(skillProg)} />
                      )}
                      <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
