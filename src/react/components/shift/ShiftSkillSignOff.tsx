import { useMemo, useState } from "react";
import {
  SKILL_STAGE_LABEL,
  SKILL_STAGES,
  type Shift,
  type SkillStage,
} from "../../../domain/types";
import { annexeCodeOf, annexeProficiencyIdOf } from "../../../data/seed/skills";
import { isoDate } from "../../../logic/calendar";
import { skillMatchesQuery, skillStageOf } from "../../../logic/skills";
import { useProficiencies, useSkills } from "../../hooks";
import { useSkillActions } from "../../useSkillActions";
import { SignedOffBadge, SkillStageBadge } from "../skills/shared";
import { btnPrimary, inputCls } from "../ui";

const todayIso = () => isoDate(new Date());
const MAX_RESULTS = 40;

/**
 * A compact skill capture scoped to one shift: search + pick a skill, nudge its
 * competence stage, or sign it off — the sign-off records this shift (the universal
 * `shiftId` join) and, for an Annexe B skill, attaches the 1:1 proficiency as
 * evidence in one step. Reuses `useSkillActions().signOff`, mirroring the two-page
 * `SkillsListPage → SkillDetailPage` flow in a single inline panel. `onChange` lets
 * the parent tab refresh its captured list.
 */
export function ShiftSkillSignOff({
  shift,
  onChange,
}: {
  shift: Shift;
  onChange: (message: string) => void;
}) {
  const { skills, progress, reload } = useSkills();
  const { setStage, signOff } = useSkillActions();
  const { evidenceLinks, reload: reloadProfs } = useProficiencies();

  const [q, setQ] = useState("");
  const [skillId, setSkillId] = useState<string | null>(null);
  const [byName, setByName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayIso());
  const [evidenceNote, setEvidenceNote] = useState("");
  const [alsoLink, setAlsoLink] = useState(true);

  const progressBySkill = useMemo(() => new Map(progress.map((p) => [p.skillId, p])), [progress]);
  const skill = skillId ? (skills.find((s) => s.id === skillId) ?? null) : null;
  const prog = skill ? progressBySkill.get(skill.id) : undefined;
  const currentStage = skillStageOf(prog);

  // Pickable = every skill not already signed off (sign-off is terminal), matching
  // the search. Newest sign-offs drop out so the picker is always "what's still open".
  const results = useMemo(
    () =>
      skills
        .filter((s) => !progressBySkill.get(s.id)?.signedOff && skillMatchesQuery(s, q))
        .slice(0, MAX_RESULTS),
    [skills, progressBySkill, q],
  );

  // The 1:1 Annexe B proficiency (if any) this sign-off can attach as evidence.
  const profId = skill ? annexeProficiencyIdOf(skill) : null;
  const profCode = skill ? annexeCodeOf(skill) : null;
  const alreadyLinked = !!(
    skill &&
    profId &&
    evidenceLinks.some(
      (l) => l.evidenceType === "SKILL" && l.evidenceId === skill.id && l.proficiencyId === profId,
    )
  );

  const reset = () => {
    setSkillId(null);
    setQ("");
    setByName("");
    setLocation("");
    setEvidenceNote("");
    setDate(todayIso());
    setAlsoLink(true);
  };

  const handleStage = async (stage: SkillStage) => {
    if (!skill) return;
    await setStage(skill, stage);
    await reload();
    onChange(`${skill.name} — marked ${SKILL_STAGE_LABEL[stage]}`);
  };

  const handleSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skill) return;
    const linkProficiency =
      profId && profCode && alsoLink && !alreadyLinked ? { id: profId, code: profCode } : undefined;
    await signOff(
      skill,
      {
        signOffByName: byName.trim() || undefined,
        signOffLocation: location.trim() || undefined,
        signOffDate: date || undefined,
        evidenceNote: evidenceNote.trim() || undefined,
        shiftId: shift.id,
      },
      linkProficiency,
    );
    await reload();
    await reloadProfs();
    onChange(`Signed off ${skill.name} on this shift`);
    reset();
  };

  // Step 1 — pick a skill.
  if (!skill) {
    return (
      <div>
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
                onClick={() => setSkillId(s.id)}
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
    );
  }

  // Step 2 — nudge the stage, or sign off (with the shift pinned).
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
          {profCode && <span className="mr-1.5 font-semibold text-slate-400">{profCode}</span>}
          {skill.name}
        </p>
        {prog?.signedOff ? <SignedOffBadge /> : <SkillStageBadge stage={currentStage} />}
        <button
          type="button"
          onClick={reset}
          className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Change
        </button>
      </div>

      <div>
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

      <form
        onSubmit={handleSignOff}
        className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Sign off — permanent
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Signed off by</span>
            <input
              value={byName}
              onChange={(e) => setByName(e.target.value)}
              className={inputCls}
              placeholder="Practice supervisor / assessor"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputCls}
              placeholder="Ward / placement"
            />
          </label>
        </div>
        <label className="block sm:max-w-[12rem]">
          <span className="mb-1 block text-xs font-medium text-slate-600">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Evidence</span>
          <textarea
            value={evidenceNote}
            onChange={(e) => setEvidenceNote(e.target.value)}
            rows={2}
            className={inputCls}
            placeholder="What demonstrated this skill? No patient-identifiable information."
          />
        </label>
        {profId && profCode && !alreadyLinked && (
          <label className="flex items-start gap-2 rounded-lg bg-sky-50 p-2.5 text-xs text-sky-800 ring-1 ring-sky-100">
            <input
              type="checkbox"
              checked={alsoLink}
              onChange={(e) => setAlsoLink(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              Also attach as evidence for proficiency <strong>{profCode}</strong>.
            </span>
          </label>
        )}
        {profId && profCode && alreadyLinked && (
          <p className="text-xs text-slate-400">Already attached as evidence for {profCode}.</p>
        )}
        <button type="submit" className={btnPrimary}>
          Sign off skill
        </button>
      </form>
    </div>
  );
}
