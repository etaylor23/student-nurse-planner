import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  SKILL_SOURCE_LABEL,
  SKILL_STAGE_LABEL,
  SKILL_STAGES,
  type Proficiency,
  type Shift,
  type SkillStage,
} from "../../../domain/types";
import { annexeCodeOf, annexeProficiencyIdOf } from "../../../data/seed/skills";
import { formatHumanDate, hhmm, isoDate } from "../../../logic/calendar";
import { findCurrentShift, recentShifts } from "../../../logic/shiftContext";
import { usePlacements, useProficiencies, useShifts, useSkill } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { useSkillActions } from "../../useSkillActions";
import { ProficiencyPicker } from "../competencies/ProficiencyPicker";
import { Panel, btnGhostSm, btnPrimary, inputCls } from "../ui";
import { SignedOffBadge, SkillStageBadge } from "./shared";

const todayIso = () => isoDate(new Date());

/** "18 Jun 2026 · Ward 7 09:00–17:00" — the shift picker's option label. */
function shiftLabel(s: Shift, placeName: Map<string, string>): string {
  const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
  const times =
    s.startAt && s.endAt ? ` ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
  return `${formatHumanDate(s.date)} · ${place}${times}`;
}

export function SkillDetailPage() {
  const { id } = useParams();
  const { skill, progress, reload } = useSkill(id);
  const { repo, user } = useRepository();
  const { setStage, signOff, linkSkillToProficiency, deleteCustomSkill } = useSkillActions();
  // The user's proficiencies + all evidence links — used to show which proficiencies
  // this skill already evidences and to resolve their codes.
  const { proficiencies, evidenceLinks, reload: reloadProfs } = useProficiencies();
  const { shifts } = useShifts();
  const { placements } = usePlacements();
  const navigate = useNavigate();
  // A shift editor's "Sign off a skill" CTA rides a prefillShiftId through the list.
  const prefillShiftId = (useLocation().state as { prefillShiftId?: string } | null)
    ?.prefillShiftId;

  const [byName, setByName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayIso());
  const [evidenceNote, setEvidenceNote] = useState("");
  const [alsoLink, setAlsoLink] = useState(true);
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  // Optional shift the sign-off happened in (U8). `null` = auto-follow the current
  // timed shift (derived live); once the user picks, their choice wins ("" = none).
  const [pickedShift, setPickedShift] = useState<string | null>(prefillShiftId ?? null);

  const placeName = useMemo(() => new Map(placements.map((p) => [p.id, p.name])), [placements]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const currentShift = useMemo(() => findCurrentShift(shifts, Date.now()), [shifts]);
  const recent = useMemo(() => recentShifts(shifts, todayIso()), [shifts]);
  const signOffShiftId = pickedShift === null ? (currentShift?.id ?? "") : pickedShift;
  const selectedShift = signOffShiftId ? shiftById.get(signOffShiftId) : undefined;
  // Recent shifts, plus the selected one if it's older than the 7-day window (e.g.
  // pinned from a shift editor) so it still shows as chosen.
  const shiftOptions = useMemo(() => {
    if (selectedShift && !recent.some((s) => s.id === selectedShift.id)) {
      return [selectedShift, ...recent];
    }
    return recent;
  }, [recent, selectedShift]);
  // The "Link to a proficiency" picker on the detail (any skill), and the proficiency
  // a custom skill's sign-off form will also attach.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signOffProf, setSignOffProf] = useState<Proficiency | null>(null);
  const [signOffPickerOpen, setSignOffPickerOpen] = useState(false);
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

  const handleSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    // Custom skills attach the proficiency the student picked in the form; Annexe B
    // skills auto-attach their 1:1 proficiency unless it's already linked / opted out.
    const linkProficiency =
      skill.source === "CUSTOM"
        ? signOffProf
          ? { id: signOffProf.id, code: signOffProf.code }
          : undefined
        : profId && profCode && alsoLink && !alreadyLinked
          ? { id: profId, code: profCode }
          : undefined;
    await signOff(
      skill,
      {
        signOffByName: byName.trim() || undefined,
        signOffLocation: location.trim() || undefined,
        signOffDate: date || undefined,
        evidenceNote: evidenceNote.trim() || undefined,
        shiftId: signOffShiftId || undefined,
      },
      linkProficiency,
    );
    setSignOffProf(null);
    setSignOffPickerOpen(false);
    await reload();
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
            <p className="text-sm text-slate-400">
              Not yet attached as evidence for any proficiency.
            </p>
          )}
          {pickerOpen ? (
            <ProficiencyPicker
              excludeIds={linkedProfIds}
              onPick={(p) => void handleLink(p)}
              onClose={() => setPickerOpen(false)}
            />
          ) : (
            <button type="button" onClick={() => setPickerOpen(true)} className={btnGhostSm}>
              Link to a proficiency
            </button>
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
              <form onSubmit={handleSignOff} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Shift</span>
                  <select
                    value={signOffShiftId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPickedShift(v);
                      const s = v ? shiftById.get(v) : undefined;
                      const place = s?.placementId ? placeName.get(s.placementId) : undefined;
                      if (place && !location.trim()) setLocation(place);
                    }}
                    className={inputCls}
                  >
                    <option value="">No shift</option>
                    {shiftOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {shiftLabel(s, placeName)}
                        {s.id === currentShift?.id ? " — now" : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-400">
                    {currentShift ? (
                      <span className="text-emerald-700">
                        You're in a shift now — linked automatically. Change it here if you meant a
                        recent one.
                      </span>
                    ) : recent.length > 0 ? (
                      "Optionally link the shift this was signed off in (last 7 days)."
                    ) : (
                      "No recent shifts to link — sign-off can have no shift."
                    )}
                  </span>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Signed off by
                    </span>
                    <input
                      value={byName}
                      onChange={(e) => setByName(e.target.value)}
                      className={inputCls}
                      placeholder="Practice supervisor / assessor"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Location
                    </span>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={inputCls}
                      placeholder="Ward / placement"
                    />
                  </label>
                </div>
                <label className="block sm:max-w-[12rem]">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Evidence</span>
                  <textarea
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder="What demonstrated this skill? No patient-identifiable information."
                  />
                </label>
                {profId && profCode && !alreadyLinked && (
                  <label className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-100">
                    <input
                      type="checkbox"
                      checked={alsoLink}
                      onChange={(e) => setAlsoLink(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      Also attach this as evidence for proficiency <strong>{profCode}</strong> in
                      your competency tracker.
                    </span>
                  </label>
                )}
                {profId && profCode && alreadyLinked && (
                  <p className="text-xs text-slate-400">
                    Already attached as evidence for {profCode}.
                  </p>
                )}
                {skill.source === "CUSTOM" &&
                  (signOffProf ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-100">
                      <span>
                        Will also attach as evidence for <strong>{signOffProf.code}</strong> when
                        you sign off.
                      </span>
                      <button
                        type="button"
                        onClick={() => setSignOffProf(null)}
                        className="font-medium text-sky-700 underline"
                      >
                        Remove
                      </button>
                    </div>
                  ) : signOffPickerOpen ? (
                    <ProficiencyPicker
                      excludeIds={linkedProfIds}
                      onPick={(p) => {
                        setSignOffProf(p);
                        setSignOffPickerOpen(false);
                      }}
                      onClose={() => setSignOffPickerOpen(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSignOffPickerOpen(true)}
                      className="text-sm font-medium text-emerald-700"
                    >
                      + Also attach as evidence for a proficiency…
                    </button>
                  ))}
                <p className="text-xs text-slate-400">
                  Sign-off is permanent — once signed off, a skill stays signed off.
                </p>
                <button type="submit" className={btnPrimary}>
                  Sign off skill
                </button>
              </form>
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
