import { useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  SKILL_STAGE_LABEL,
  SKILL_STAGES,
  type Shift,
  type SkillStage,
} from "../../../domain/types";
import { annexeCodeOf } from "../../../data/seed/skills";
import { skillMatchesQuery, skillStageOf } from "../../../logic/skills";
import { useSkill, useSkills } from "../../hooks";
import { useSkillActions } from "../../useSkillActions";
import { SkillSignOffForm } from "../skills/SkillSignOffForm";
import { SignedOffBadge, SkillStageBadge } from "../skills/shared";
import { CaptureConfirmation, SeeFullLink, TabHeading, useCaptureFlash } from "./shared";
import { inputCls } from "../ui";

const MAX_RESULTS = 40;

/**
 * The Skills capture tab. URL-driven: /planner/:id/skills lists this shift's
 * signed-off skills and lets you pick one to sign off; /planner/:id/skills/:skillId
 * signs it off inline against this shift, reusing the shared SkillSignOffForm
 * (shift-pinned). Saving returns to the list with a confirmation.
 */
export function ShiftSkillsTab({ shift }: { shift: Shift }) {
  const base = `/planner/${shift.id}/skills`;
  const navigate = useNavigate();
  const { message, flash } = useCaptureFlash();

  return (
    <div>
      <CaptureConfirmation message={message} />
      <Routes>
        <Route index element={<SkillsIndexView shift={shift} base={base} />} />
        <Route
          path=":skillId"
          element={
            <SkillSignOffView
              shift={shift}
              base={base}
              onSignedOff={(name) => {
                flash(`Signed off ${name} on this shift`);
                navigate(base);
              }}
            />
          }
        />
      </Routes>
    </div>
  );
}

function SkillsIndexView({ shift, base }: { shift: Shift; base: string }) {
  const { skills, progress } = useSkills();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const progressBySkill = useMemo(() => new Map(progress.map((p) => [p.skillId, p])), [progress]);
  const rows = progress.filter((p) => p.shiftId === shift.id && skillById.has(p.skillId));

  // Pickable = every skill not already signed off, matching the search.
  const results = useMemo(
    () =>
      skills
        .filter((s) => !progressBySkill.get(s.id)?.signedOff && skillMatchesQuery(s, q))
        .slice(0, MAX_RESULTS),
    [skills, progressBySkill, q],
  );

  return (
    <div>
      <TabHeading
        label="Skills signed off"
        count={rows.length}
        action={<SeeFullLink to="/skills">See full skills tracker</SeeFullLink>}
      />

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">
          None yet — sign off a skill against this shift below.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => {
            const skill = skillById.get(p.skillId)!;
            return (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <Link
                  to={`/skills/${skill.id}`}
                  className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700"
                >
                  {skill.name}
                </Link>
                {p.signedOff ? <SignedOffBadge /> : <SkillStageBadge stage={skillStageOf(p)} />}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Sign off a skill
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a skill by name or code…"
          className={inputCls}
        />
        <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => navigate(`${base}/${s.id}`)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50"
              >
                {annexeCodeOf(s) && (
                  <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                    {annexeCodeOf(s)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{s.name}</span>
                <SkillStageBadge stage={skillStageOf(progressBySkill.get(s.id))} />
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-slate-400">
              No matching skills to sign off.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function SkillSignOffView({
  shift,
  base,
  onSignedOff,
}: {
  shift: Shift;
  base: string;
  onSignedOff: (skillName: string) => void;
}) {
  const { skillId } = useParams();
  const { skill, progress, reload } = useSkill(skillId);
  const { setStage } = useSkillActions();

  if (!skill) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  const signedOff = progress?.signedOff === true;
  const currentStage = skillStageOf(progress);
  const code = annexeCodeOf(skill);

  const handleStage = async (stage: SkillStage) => {
    await setStage(skill, stage);
    await reload();
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link
          to={base}
          className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          ← Skills
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
          {code && <span className="mr-1.5 font-semibold text-slate-400">{code}</span>}
          {skill.name}
        </p>
        {signedOff ? <SignedOffBadge /> : <SkillStageBadge stage={currentStage} />}
      </div>

      {signedOff ? (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
          This skill is signed off — a permanent record. See the full skills tracker for its
          details.
        </p>
      ) : (
        <>
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Where are you with it?</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {SKILL_STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => void handleStage(stage)}
                  className={
                    "rounded-lg px-2 py-1.5 text-xs font-medium transition " +
                    (currentStage === stage
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {SKILL_STAGE_LABEL[stage]}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sign off — permanent
            </p>
            <SkillSignOffForm
              skill={skill}
              pinnedShiftId={shift.id}
              onSignedOff={() => onSignedOff(skill.name)}
            />
          </div>
        </>
      )}
    </div>
  );
}
