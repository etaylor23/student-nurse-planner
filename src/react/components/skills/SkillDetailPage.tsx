import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  SKILL_SOURCE_LABEL,
  SKILL_STAGE_LABEL,
  SKILL_STAGES,
  type Proficiency,
  type SkillStage,
} from "../../../domain/types";
import { annexeCodeOf, annexeProficiencyIdOf } from "../../../data/seed/skills";
import { formatHumanDate } from "../../../logic/calendar";
import { useProficiencies, useSkill } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { useSkillActions } from "../../useSkillActions";
import { ProficiencyPicker } from "../competencies/ProficiencyPicker";
import { AttachEvidenceNudge } from "../AttachEvidenceNudge";
import { Panel, btnGhostSm } from "../ui";
import { SignedOffBadge, SkillStageBadge } from "./shared";
import { SkillSignOffForm } from "./SkillSignOffForm";

export function SkillDetailPage() {
  const { id } = useParams();
  const { skill, progress, reload } = useSkill(id);
  const { repo, user } = useRepository();
  const { setStage, linkSkillToProficiency, deleteCustomSkill } = useSkillActions();
  // The user's proficiencies + all evidence links — used to show which proficiencies
  // this skill already evidences and to resolve their codes.
  const { proficiencies, evidenceLinks, reload: reloadProfs } = useProficiencies();
  const navigate = useNavigate();

  const [alreadyLinked, setAlreadyLinked] = useState(false);
  // The "Link to a proficiency" picker on the detail (any skill).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedTo, setAdvancedTo] = useState<SkillStage | null>(null); // transient stage confirmation (U9)

  const profId = skill ? annexeProficiencyIdOf(skill) : null;
  const profCode = skill ? annexeCodeOf(skill) : null;

  const profById = useMemo(() => new Map(proficiencies.map((p) => [p.id, p])), [proficiencies]);
  // The proficiencies this skill is already attached to (as SKILL evidence), sorted by
  // code; plus the id set to exclude from the pickers so you can't double-link.
  const linkedProficiencies = useMemo(() => {
    if (!skill) return [];
    return evidenceLinks
      .filter((l) => l.evidenceType === "SKILL" && l.evidenceId === skill.id)
      .map((l) => profById.get(l.proficiencyId))
      .filter((p): p is Proficiency => !!p)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [evidenceLinks, skill, profById]);
  const linkedProfIds = useMemo(
    () => new Set(linkedProficiencies.map((p) => p.id)),
    [linkedProficiencies],
  );

  // Has this skill already been attached as evidence to its matching proficiency?
  // (If so, we don't offer to attach it again on sign-off.)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!profId || !skill) {
        setAlreadyLinked(false);
        return;
      }
      const links = await repo.listEvidenceLinks(profId);
      if (!cancelled) {
        setAlreadyLinked(
          links.some((l) => l.evidenceType === "SKILL" && l.evidenceId === skill.id),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, profId, skill]);

  if (!skill || !user) {
    return (
      <Panel title="Skill">
        <p className="text-sm text-slate-400">Loading…</p>
      </Panel>
    );
  }

  const signedOff = progress?.signedOff === true;
  const currentStage: SkillStage | null = progress?.stage ?? null;

  const handleStage = async (stage: SkillStage) => {
    if (signedOff) return;
    await setStage(skill, stage);
    await reload();
    setAdvancedTo(stage); // transient confirmation (U9)
    setTimeout(() => setAdvancedTo(null), 2500);
  };

  // Attach this skill to a proficiency from the detail page (available for any skill,
  // any time — before or after sign-off).
  const handleLink = async (p: Proficiency) => {
    await linkSkillToProficiency(skill, { id: p.id, code: p.code });
    setPickerOpen(false);
    await reloadProfs();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete the custom skill “${skill.name}”? This can't be undone.`)) return;
    await deleteCustomSkill(skill);
    navigate("/skills");
  };

  return (
    <div className="space-y-6">
      <Link to="/skills" className="text-sm font-medium text-emerald-700">
        ← All skills
      </Link>

      <Panel
        title={skill.name}
        action={
          skill.source === "CUSTOM" ? (
            <button type="button" onClick={() => void handleDelete()} className={btnGhostSm}>
              Delete skill
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {skill.category}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {SKILL_SOURCE_LABEL[skill.source]}
          </span>
          {signedOff ? <SignedOffBadge /> : <SkillStageBadge stage={currentStage} />}
        </div>
        {/* Proficiency evidence — the 1:1 mapping hint (Annexe B) plus any real links
            this skill now evidences, and a way to attach it to any proficiency. */}
        <div className="mt-4 space-y-2">
          {profId && profCode && (
            <p className="text-sm text-slate-500">
              Maps 1:1 to proficiency{" "}
              <Link
                to={`/competencies/proficiency/${profId}`}
                className="font-medium text-emerald-700"
              >
                {profCode}
              </Link>
              {linkedProfIds.has(profId)
                ? "."
                : " — sign off, or link below, to attach it as evidence."}
            </p>
          )}
          {linkedProficiencies.length > 0 ? (
            <p className="text-sm text-slate-600">
              Evidences{" "}
              {linkedProficiencies.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link
                    to={`/competencies/proficiency/${p.id}`}
                    className="font-medium text-emerald-700"
                  >
                    {p.code}
                  </Link>
                </span>
              ))}{" "}
              →
            </p>
          ) : (
            <AttachEvidenceNudge message="Not yet attached as evidence — link it below to feed your PAD." />
          )}
          {pickerOpen ? (
            <ProficiencyPicker
              excludeIds={linkedProfIds}
              onPick={(p) => void handleLink(p)}
              onClose={() => setPickerOpen(false)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPickerOpen(true)} className={btnGhostSm}>
                Link to a proficiency
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate("/reflection/new", {
                    state: {
                      prefillTitle: `Reflecting on ${skill.name}`,
                      prefillTags: [skill.category],
                    },
                  })
                }
                className={btnGhostSm}
              >
                Reflect on this skill
              </button>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-1">
          <Panel
            step="1"
            title="Competence stage"
            hint={
              signedOff ? "Locked — this skill is signed off" : "Where are you with this skill?"
            }
          >
            <ol className="space-y-2">
              {SKILL_STAGES.map((stage, i) => {
                const active = currentStage === stage;
                return (
                  <li key={stage}>
                    <button
                      type="button"
                      disabled={signedOff}
                      onClick={() => void handleStage(stage)}
                      aria-pressed={active}
                      className={
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition " +
                        (active
                          ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50") +
                        (signedOff ? " cursor-not-allowed opacity-70" : "")
                      }
                    >
                      <span
                        className={
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 " +
                          (active
                            ? "bg-emerald-600 text-white ring-emerald-600"
                            : "bg-slate-50 text-slate-500 ring-slate-200")
                        }
                      >
                        {i + 1}
                      </span>
                      {SKILL_STAGE_LABEL[stage]}
                    </button>
                  </li>
                );
              })}
            </ol>
            {advancedTo && !signedOff && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
                Advanced to {SKILL_STAGE_LABEL[advancedTo]} ✓
              </p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-2">
          {signedOff ? (
            <Panel
              step="2"
              title="Signed off"
              hint="Permanent — no refresh needed at student level"
            >
              <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                <div className="flex items-center gap-2">
                  <SignedOffBadge />
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Detail label="Signed off by" value={progress?.signOffByName} />
                  <Detail label="Where" value={progress?.signOffLocation} />
                  <Detail
                    label="Date"
                    value={
                      progress?.signOffDate ? formatHumanDate(progress.signOffDate) : undefined
                    }
                  />
                  <Detail label="Evidence" value={progress?.evidenceNote} />
                </dl>
              </div>
              {profId && profCode && alreadyLinked && (
                <p className="mt-3 text-sm text-slate-600">
                  This skill now counts as evidence for{" "}
                  <Link
                    to={`/competencies/proficiency/${profId}`}
                    className="font-medium text-emerald-700"
                  >
                    {profCode}
                  </Link>{" "}
                  → view proficiency.
                </p>
              )}
            </Panel>
          ) : (
            <Panel step="2" title="Sign off" hint="Capture who, where, when and the evidence">
              <SkillSignOffForm
                skill={skill}
                onSignedOff={async () => {
                  await reload();
                  await reloadProfs();
                }}
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">
        {value || <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}
