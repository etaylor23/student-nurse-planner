import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Shift } from "../../../domain/types";
import { skillStageOf } from "../../../logic/skills";
import { useSkills } from "../../hooks";
import { SignedOffBadge, SkillStageBadge } from "../skills/shared";
import { ShiftSkillSignOff } from "./ShiftSkillSignOff";
import { CaptureConfirmation, TabHeading, useCaptureFlash } from "./shared";

/**
 * The Skills capture tab: the skills signed off against this shift, plus the
 * compact `ShiftSkillSignOff` composite (skill picker + stage/sign-off) inline.
 * Signing off records the shift and refreshes the list — all in the modal.
 */
export function ShiftSkillsTab({ shift }: { shift: Shift }) {
  const { skills, progress, reload } = useSkills();
  const { message, flash } = useCaptureFlash();

  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const rows = progress.filter((p) => p.shiftId === shift.id && skillById.has(p.skillId));

  return (
    <div>
      <TabHeading label="Skills signed off" count={rows.length} />

      <CaptureConfirmation message={message} />

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
        <ShiftSkillSignOff
          shift={shift}
          onChange={(msg) => {
            void reload();
            flash(msg);
          }}
        />
      </div>
    </div>
  );
}
