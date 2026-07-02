import { Link, useNavigate } from "react-router-dom";
import type { Shift } from "../../domain/types";
import { skillStageOf } from "../../logic/skills";
import { useSkills } from "../hooks";
import { SignedOffBadge, SkillStageBadge } from "./skills/shared";

/**
 * The clinical skills signed off during a shift — the skill capture's "actions happen
 * in a shift" link (U8, mirroring `ShiftMedications`). Shown in the shift editor
 * (planner + hours log). Always renders so the "Sign off a skill" shortcut (opens the
 * skills tracker pinned to this shift) is available even before anything is recorded.
 */
export function ShiftSkills({ shift }: { shift: Shift }) {
  const { skills, progress } = useSkills();
  const navigate = useNavigate();

  const skillById = new Map(skills.map((s) => [s.id, s]));
  const rows = progress.filter((p) => p.shiftId === shift.id && skillById.has(p.skillId));

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Skills signed off{rows.length > 0 ? ` · ${rows.length}` : ""}
        </p>
        <button
          type="button"
          onClick={() => navigate("/skills", { state: { prefillShiftId: shift.id } })}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
        >
          + Sign off a skill
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">None yet — sign off a skill against this shift.</p>
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
    </div>
  );
}
