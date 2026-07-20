import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  GIBBS_STAGE_LABEL,
  GIBBS_STAGES,
  type Proficiency,
  type Shift,
} from "../../../domain/types";
import { formatHumanDate, hhmm } from "../../../logic/calendar";
import { GIBBS_PROMPT_LIST, gibbsCompleteness } from "../../../logic/gibbs";
import { usePlacements, useProficiencies, useReflection, useShifts } from "../../hooks";
import { useReflectionLock } from "../../reflectionLock";
import { useReflectionActions } from "../../useReflectionActions";
import { ProficiencyPicker } from "../competencies/ProficiencyPicker";
import { AttachEvidenceNudge } from "../AttachEvidenceNudge";
import { Panel, btnGhostSm, btnPrimary, inputCls } from "../ui";
import { CompletenessMeter, LockBadge, ModelBadge, TagPills } from "./shared";
import { ReflectionEditor } from "./ReflectionEditor";

const PROMPT_BY_STAGE = new Map(GIBBS_PROMPT_LIST.map((p) => [p.stage, p]));

function shiftLabel(s: Shift, placeName: Map<string, string>): string {
  const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
  const times =
    s.startAt && s.endAt ? ` ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
  return `${formatHumanDate(s.date)} · ${place}${times}`;
}

export function ReflectionDetailPage() {
  const { id } = useParams();
  const { reflection, sections, tags, reload } = useReflection(id);
  const { proficiencies, evidenceLinks, reload: reloadProfs } = useProficiencies();
  const { linkProficiency, unlinkProficiency, remove } = useReflectionActions();
  const { pinSet, unlocked, tryUnlock, reveal } = useReflectionLock();
  const { shifts } = useShifts();
  const { placements } = usePlacements();
  const navigate = useNavigate();
  const justCreated = (useLocation().state as { justCreated?: boolean } | null)?.justCreated;

  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [saved, setSaved] = useState(!!justCreated);

  const placeName = useMemo(() => new Map(placements.map((p) => [p.id, p.name])), [placements]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const profById = useMemo(() => new Map(proficiencies.map((p) => [p.id, p])), [proficiencies]);

  // Proficiencies this reflection is attached to (as REFLECTION evidence), with the
  // link id for unlinking — mirrors how SkillDetailPage resolves its SKILL links.
  const linkedProficiencies = useMemo(() => {
    if (!reflection) return [];
    return evidenceLinks
      .filter((l) => l.evidenceType === "REFLECTION" && l.evidenceId === reflection.id)
      .map((l) => ({ link: l, prof: profById.get(l.proficiencyId) }))
      .filter((x): x is { link: (typeof evidenceLinks)[number]; prof: Proficiency } => !!x.prof)
      .sort((a, b) => a.prof.code.localeCompare(b.prof.code));
  }, [evidenceLinks, reflection, profById]);
  const linkedProfIds = useMemo(
    () => new Set(linkedProficiencies.map((x) => x.prof.id)),
    [linkedProficiencies],
  );

  if (!reflection) {
    return (
      <Panel title="Reflection">
        <p className="text-sm text-slate-400">Loading…</p>
      </Panel>
    );
  }

  const completeness = gibbsCompleteness(sections);
  const contentByStage = new Map(sections.map((s) => [s.stage, s.content]));
  const linkedShift = reflection.shiftId ? shiftById.get(reflection.shiftId) : undefined;
  const gated = reflection.isLocked && !unlocked;

  const handleLink = async (p: Proficiency) => {
    await linkProficiency(reflection, p);
    setPickerOpen(false);
    await reloadProfs();
  };
  const handleUnlink = async (linkId: string, p: Proficiency) => {
    await unlinkProficiency(linkId, p);
    await reloadProfs();
  };
  const handleDelete = async () => {
    if (!window.confirm(`Delete the reflection “${reflection.title}”? This can't be undone.`))
      return;
    await remove(reflection);
    navigate("/reflection");
  };

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{reflection.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <ModelBadge />
          {reflection.isLocked && <LockBadge />}
          {reflection.occurredOn && (
            <span className="text-xs text-slate-400">{formatHumanDate(reflection.occurredOn)}</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link to="/reflection" className="text-sm font-medium text-emerald-700">
        ← All reflections
      </Link>

      {saved && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
          <span>
            Reflection saved.{" "}
            {linkedProficiencies.length === 0 && !gated
              ? "Link it to a proficiency below to feed your PAD."
              : "It's part of your record now."}
          </span>
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="shrink-0 font-medium text-emerald-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {gated ? (
        <Panel title="Locked reflection" hint="This reflection is private">
          {header}
          <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
            {pinSet ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tryUnlock(pin)) {
                    setPin("");
                    setPinError(false);
                  } else {
                    setPinError(true);
                  }
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter device PIN"
                  className={inputCls + " max-w-[12rem] py-2"}
                  autoFocus
                />
                <button type="submit" className={btnPrimary}>
                  Unlock
                </button>
                {pinError && <span className="text-sm text-rose-600">Incorrect PIN.</span>}
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-500">
                  Hidden on this screen. No device PIN is set, so this is a soft gate.
                </p>
                <button type="button" onClick={reveal} className={btnPrimary}>
                  Reveal
                </button>
              </div>
            )}
          </div>
        </Panel>
      ) : editing ? (
        <Panel title="Edit reflection">
          <ReflectionEditor
            initial={{ reflection, sections, tags }}
            onSaved={async () => {
              await reload();
              setEditing(false);
              setSaved(true);
            }}
            onCancel={() => setEditing(false)}
          />
        </Panel>
      ) : (
        <>
          <Panel
            title="Reflection"
            action={
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(true)} className={btnGhostSm}>
                  Edit
                </button>
                <button type="button" onClick={() => void handleDelete()} className={btnGhostSm}>
                  Delete
                </button>
              </div>
            }
          >
            {header}
            <div className="mt-3">
              <CompletenessMeter completeness={completeness} />
            </div>
            {linkedShift && (
              <p className="mt-3 text-sm text-slate-600">
                Reflects on shift:{" "}
                <Link
                  to={`/planner/${linkedShift.id}`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  {shiftLabel(linkedShift, placeName)} →
                </Link>
              </p>
            )}
            {tags.length > 0 && (
              <div className="mt-3">
                <TagPills labels={tags.map((t) => t.label)} />
              </div>
            )}
          </Panel>

          <Panel title="Gibbs reflective cycle" hint="Six stages, guided">
            <ol className="space-y-4">
              {GIBBS_STAGES.map((stage, i) => {
                const value = (contentByStage.get(stage) ?? "").trim();
                const prompt = PROMPT_BY_STAGE.get(stage);
                return (
                  <li key={stage}>
                    <div className="flex items-baseline gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {GIBBS_STAGE_LABEL[stage]}
                      </span>
                      <span className="text-xs text-slate-400">· {prompt?.prompt}</span>
                    </div>
                    <p
                      className={
                        "mt-1 ml-7 whitespace-pre-wrap text-sm " +
                        (value ? "text-slate-600" : "text-slate-300")
                      }
                    >
                      {value || "Not written yet."}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel
            title="Linked proficiencies"
            hint="Attach this reflection as evidence for your PAD"
          >
            {linkedProficiencies.length === 0 ? (
              <AttachEvidenceNudge message="Not linked to a proficiency yet — attach it below as evidence to feed your PAD." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {linkedProficiencies.map(({ link, prof }) => (
                  <li key={link.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                      {prof.code}
                    </span>
                    <Link
                      to={`/competencies/proficiency/${prof.id}`}
                      className="min-w-0 flex-1 truncate text-sm text-emerald-700 hover:underline"
                    >
                      {prof.statement}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleUnlink(link.id, prof)}
                      className="shrink-0 text-xs font-medium text-rose-600"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pickerOpen ? (
              <ProficiencyPicker
                excludeIds={linkedProfIds}
                onPick={(p) => void handleLink(p)}
                onClose={() => setPickerOpen(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={btnGhostSm + " mt-3"}
              >
                Link to a proficiency
              </button>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
