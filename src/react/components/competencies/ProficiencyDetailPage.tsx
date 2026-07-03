import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  EVIDENCE_TYPE_LABEL,
  PROFICIENCY_STATUS_LABEL,
  type EvidenceLink,
  type EvidenceType,
  type Placement,
  type ProficiencyStatus,
  type Shift,
} from "../../../domain/types";
import { formatHumanDate, hhmm, isoDate } from "../../../logic/calendar";
import { hasEvidenceSuggestion, suggestEvidence } from "../../../logic/evidenceSuggestions";
import {
  isDrugCalcProficiency,
  overallPercentAchieved,
  surfaceGaps,
} from "../../../logic/proficiencies";
import {
  useMedicationLogs,
  useMedications,
  usePlacements,
  useProficiencies,
  useProficiency,
  useReflections,
  useShifts,
  useSkills,
} from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { Panel, btnGhostSm, btnPrimary, inputCls } from "../ui";
import { NumeracyPanel } from "./NumeracyPanel";
import { SourceCredit, StatusPill } from "./shared";

const STATUSES: ProficiencyStatus[] = ["NOT_YET_ACHIEVED", "DEVELOPING", "ACHIEVED"];
const todayIso = () => isoDate(new Date());

function shiftLabel(s: Shift, placeName: Map<string, string>): string {
  const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
  const times =
    s.startAt && s.endAt ? ` ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
  return `${formatHumanDate(s.date)} · ${place}${times}`;
}

export function ProficiencyDetailPage() {
  const { id } = useParams();
  const { proficiency, progress, events, links, reload } = useProficiency(id);
  // The whole list too, for the post-save "overall %" + "next gap" golden moment (U9).
  const { proficiencies: allProfs, progress: allProgress, reload: reloadAll } = useProficiencies();
  const { repo, user } = useRepository();
  const { shifts } = useShifts();
  const { logs } = useMedicationLogs();
  const { medications } = useMedications();
  const { placements } = usePlacements();
  const { skills, progress: skillProgress } = useSkills();
  const { reflections } = useReflections();

  const placeName = useMemo(
    () => new Map(placements.map((p: Placement) => [p.id, p.name])),
    [placements],
  );
  const medName = useMemo(() => new Map(medications.map((m) => [m.id, m.name])), [medications]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const logById = useMemo(() => new Map(logs.map((l) => [l.id, l])), [logs]);
  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const reflectionById = useMemo(() => new Map(reflections.map((r) => [r.id, r])), [reflections]);

  const [status, setStatus] = useState<ProficiencyStatus>("DEVELOPING");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [assessorName, setAssessorName] = useState("");
  const [note, setNote] = useState("");
  const [evTab, setEvTab] = useState<EvidenceType>("SHIFT");
  const [saved, setSaved] = useState(false); // transient post-save confirmation (U9)

  if (!proficiency || !user) {
    return (
      <Panel title="Proficiency">
        <p className="text-sm text-slate-400">Loading…</p>
      </Panel>
    );
  }

  const currentStatus = progress?.status ?? "NOT_YET_ACHIEVED";
  const partIndex = user.currentPart;

  // "You already have evidence for this" — records the student could attach in one
  // click, derived from their activity (U4). Pure logic in `evidenceSuggestions.ts`.
  const suggestion = suggestEvidence(proficiency, {
    shifts,
    medLogs: logs,
    skills,
    skillProgress,
    reflections,
    links,
  });
  const suggestedSkill = suggestion.skill; // narrowed const for the strip's closure

  // Post-save golden moment (U9): overall % + the next gap to chase.
  const overallPct = overallPercentAchieved(allProfs, allProgress);
  const nextGap =
    surfaceGaps(allProfs, allProgress, user).find((g) => g.proficiency.id !== proficiency.id) ??
    null;

  const saveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    await repo.setProficiencyStatus(user.id, proficiency.id, {
      status,
      partIndex,
      occurredAt,
      assessorName: assessorName.trim() || undefined,
      note: note.trim() || undefined,
    });
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: proficiency.id,
      entityLabel: proficiency.code,
      action: "PROFICIENCY_STATUS_CHANGED",
      summary: `${proficiency.code} marked ${PROFICIENCY_STATUS_LABEL[status]} (Part ${partIndex})`,
    });
    setAssessorName("");
    setNote("");
    setOccurredAt(todayIso());
    await reload();
    await reloadAll();
    setSaved(true);
  };

  const setTargetPart = async (value: number | undefined) => {
    await repo.setProficiencyTargetPart(user.id, proficiency.id, value);
    await reload();
  };

  const linkedFor = (type: EvidenceType) =>
    new Set(links.filter((l) => l.evidenceType === type).map((l) => l.evidenceId));

  const addEvidence = async (type: EvidenceType, evidenceId: string) => {
    await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: proficiency.id,
      evidenceType: type,
      evidenceId,
    });
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: proficiency.id,
      entityLabel: proficiency.code,
      action: "EVIDENCE_LINKED",
      summary: `Linked a ${EVIDENCE_TYPE_LABEL[type].toLowerCase()} as evidence for ${proficiency.code}`,
    });
    await reload();
  };

  const removeEvidence = async (link: EvidenceLink) => {
    await repo.deleteEvidenceLink(link.id);
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: proficiency.id,
      entityLabel: proficiency.code,
      action: "EVIDENCE_UNLINKED",
      summary: `Removed a ${EVIDENCE_TYPE_LABEL[link.evidenceType].toLowerCase()} from ${proficiency.code}`,
    });
    await reload();
  };

  const evidenceLabel = (link: EvidenceLink): string => {
    if (link.evidenceType === "SHIFT") {
      const s = shiftById.get(link.evidenceId);
      return s ? shiftLabel(s, placeName) : "Shift (not found)";
    }
    if (link.evidenceType === "MED_LOG") {
      const l = logById.get(link.evidenceId);
      if (!l) return "Med log (not found)";
      const name = l.medicationId ? (medName.get(l.medicationId) ?? "medication") : "medication";
      return `${name} · ${formatHumanDate(l.date)}`;
    }
    if (link.evidenceType === "SKILL") {
      const s = skillById.get(link.evidenceId);
      return s ? s.name : "Clinical skill (not found)";
    }
    if (link.evidenceType === "REFLECTION") {
      const r = reflectionById.get(link.evidenceId);
      return r ? r.title : "Reflection (not found)";
    }
    return EVIDENCE_TYPE_LABEL[link.evidenceType];
  };

  // Where clicking a piece of evidence goes: a shift opens on the planner (calendar
  // jumps to its week + the shift editor opens, which shows this competency back);
  // a med log opens its medication. Stub types have no destination yet.
  const evidenceHref = (link: EvidenceLink): string | null => {
    if (link.evidenceType === "SHIFT") return `/planner/${link.evidenceId}`;
    if (link.evidenceType === "MED_LOG") {
      const medicationId = logById.get(link.evidenceId)?.medicationId;
      return medicationId ? `/medications/${medicationId}` : null;
    }
    if (link.evidenceType === "SKILL") return `/skills/${link.evidenceId}`;
    if (link.evidenceType === "REFLECTION") return `/reflection/${link.evidenceId}`;
    return null;
  };

  const groupLabel =
    proficiency.annexe === "NONE"
      ? `Platform ${proficiency.platform}`
      : `Annexe ${proficiency.annexe}`;
  const backTo = `/competencies/platform/${proficiency.annexe === "NONE" ? proficiency.platform : proficiency.annexe}`;

  return (
    <div className="space-y-6">
      <Link to={backTo} className="text-sm font-medium text-emerald-700">
        ← {groupLabel}
      </Link>

      <Panel title={`${proficiency.code} · ${groupLabel}`}>
        <p className="text-sm leading-relaxed text-slate-700">{proficiency.statement}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPill status={currentStatus} />
          <span className="text-xs text-slate-400">
            Target part:{" "}
            <select
              value={progress?.targetPart ?? ""}
              onChange={(e) => setTargetPart(e.target.value ? Number(e.target.value) : undefined)}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700"
            >
              <option value="">none</option>
              {Array.from({ length: user.totalParts }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  Part {p}
                </option>
              ))}
            </select>
          </span>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-1">
          <Panel step="1" title="Record a status change" hint="Appends to the dated history">
            <form onSubmit={saveStatus} onChange={() => setSaved(false)} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProficiencyStatus)}
                  className={inputCls}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PROFICIENCY_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Date</span>
                  <input
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Part</span>
                  <input
                    value={partIndex}
                    readOnly
                    className={inputCls + " bg-slate-50 text-slate-500"}
                    title="From your profile's current part"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Assessor (optional)
                </span>
                <input
                  value={assessorName}
                  onChange={(e) => setAssessorName(e.target.value)}
                  className={inputCls}
                  placeholder="Practice supervisor / assessor"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Note (optional)
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="No patient-identifiable information."
                />
              </label>
              <button type="submit" className={btnPrimary}>
                Save status
              </button>
              {saved && (
                <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
                  Saved — you're at <strong>{overallPct}%</strong> achieved overall.
                  {nextGap && (
                    <>
                      {" "}
                      <Link
                        to={`/competencies/proficiency/${nextGap.proficiency.id}`}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        Next gap: {nextGap.proficiency.code} →
                      </Link>
                    </>
                  )}
                </div>
              )}
            </form>
          </Panel>

          <Panel title="History" hint="Preserved across programme parts">
            {events.length === 0 ? (
              <p className="text-sm text-slate-400">No status changes recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((ev) => (
                  <li key={ev.id} className="flex gap-3 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700">
                        {PROFICIENCY_STATUS_LABEL[ev.status]}{" "}
                        <span className="font-normal text-slate-400">· Part {ev.partIndex}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatHumanDate(ev.occurredAt)}
                        {ev.assessorName ? ` · ${ev.assessorName}` : ""}
                      </p>
                      {ev.note && <p className="mt-0.5 text-xs text-slate-500">{ev.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {isDrugCalcProficiency(proficiency.code) && <NumeracyPanel />}
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel step="2" title="Evidence" hint="Attach what demonstrates this proficiency">
            {hasEvidenceSuggestion(suggestion) && (
              <div className="mb-4 rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-100">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Suggested from your activity
                </p>
                <ul className="space-y-1.5">
                  {suggestedSkill && (
                    <SuggestionRow
                      tag="Skill"
                      label={suggestedSkill.skill.name}
                      onAttach={() => void addEvidence("SKILL", suggestedSkill.skill.id)}
                    />
                  )}
                  {suggestion.medLogs.map((l) => (
                    <SuggestionRow
                      key={l.id}
                      tag="Med log"
                      label={`${l.medicationId ? (medName.get(l.medicationId) ?? "medication") : "medication"} · ${formatHumanDate(l.date)}`}
                      onAttach={() => void addEvidence("MED_LOG", l.id)}
                    />
                  ))}
                  {suggestion.shifts.map((s) => (
                    <SuggestionRow
                      key={s.id}
                      tag="Shift"
                      label={shiftLabel(s, placeName)}
                      onAttach={() => void addEvidence("SHIFT", s.id)}
                    />
                  ))}
                  {suggestion.reflections.map((r) => (
                    <SuggestionRow
                      key={r.id}
                      tag="Reflection"
                      label={r.title}
                      onAttach={() => void addEvidence("REFLECTION", r.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {links.length === 0 ? (
              <p className="text-sm text-slate-400">No evidence attached yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {links.map((l) => {
                  const href = evidenceHref(l);
                  const label = evidenceLabel(l);
                  return (
                    <li key={l.id} className="flex items-center gap-3 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {EVIDENCE_TYPE_LABEL[l.evidenceType]}
                      </span>
                      {href ? (
                        <Link
                          to={href}
                          className="min-w-0 flex-1 truncate text-sm text-emerald-700 hover:underline"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                          {label}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeEvidence(l)}
                        className="text-xs font-medium text-rose-600"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Add evidence
              </p>
              <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5">
                {(["SHIFT", "MED_LOG", "REFLECTION", "SKILL"] as EvidenceType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEvTab(t)}
                    className={
                      "rounded-md px-2.5 py-1 text-xs font-medium transition " +
                      (evTab === t
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")
                    }
                  >
                    {EVIDENCE_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {evTab === "SHIFT" && (
                  <EvidencePicker
                    rows={shifts.filter((s) => s.status === "COMPLETED")}
                    linked={linkedFor("SHIFT")}
                    getId={(s) => s.id}
                    getLabel={(s) => shiftLabel(s, placeName)}
                    emptyText="No completed shifts yet — complete a shift in the planner to use it as evidence."
                    onAdd={(s) => addEvidence("SHIFT", s.id)}
                  />
                )}
                {evTab === "MED_LOG" && (
                  <EvidencePicker
                    rows={logs}
                    linked={linkedFor("MED_LOG")}
                    getId={(l) => l.id}
                    getLabel={(l) =>
                      `${l.medicationId ? (medName.get(l.medicationId) ?? "medication") : "medication"} · ${formatHumanDate(l.date)}`
                    }
                    emptyText={
                      <>
                        No medication logs yet —{" "}
                        <Link
                          to="/medications/log"
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          log a med
                        </Link>{" "}
                        to use it as evidence (e.g. for Platform 4).
                      </>
                    }
                    onAdd={(l) => addEvidence("MED_LOG", l.id)}
                  />
                )}
                {evTab === "SKILL" && (
                  <EvidencePicker
                    rows={skills}
                    linked={linkedFor("SKILL")}
                    getId={(s) => s.id}
                    getLabel={(s) => s.name}
                    emptyText={
                      <>
                        No skills yet — open the{" "}
                        <Link to="/skills" className="font-medium text-emerald-700 hover:underline">
                          clinical skills tracker
                        </Link>{" "}
                        to use one as evidence.
                      </>
                    }
                    searchPlaceholder="Search skills…"
                    onAdd={(s) => addEvidence("SKILL", s.id)}
                  />
                )}
                {evTab === "REFLECTION" && (
                  <EvidencePicker
                    rows={reflections}
                    linked={linkedFor("REFLECTION")}
                    getId={(r) => r.id}
                    getLabel={(r) => r.title}
                    emptyText={
                      <>
                        No reflections yet —{" "}
                        <Link
                          to="/reflection/new"
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          write a reflection
                        </Link>{" "}
                        to attach it as evidence.
                      </>
                    }
                    searchPlaceholder="Search reflections…"
                    onAdd={(r) => addEvidence("REFLECTION", r.id)}
                  />
                )}
              </div>
            </div>
          </Panel>

          <Panel title="About this statement" hint="Source">
            <SourceCredit />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * A compact "pick one to attach" list shared by the evidence tabs. Pass
 * `searchPlaceholder` to add a filter box (used by the skills tab, which is long).
 */
function EvidencePicker<T>({
  rows,
  linked,
  getId,
  getLabel,
  emptyText,
  onAdd,
  searchPlaceholder,
}: {
  rows: T[];
  linked: Set<string>;
  getId: (row: T) => string;
  getLabel: (row: T) => string;
  emptyText: React.ReactNode;
  onAdd: (row: T) => void;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const available = rows.filter((r) => !linked.has(getId(r)));
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">{emptyText}</p>;
  }
  if (available.length === 0) {
    return <p className="text-sm text-slate-400">All of these are already attached.</p>;
  }
  const filtered = searchPlaceholder
    ? available.filter((r) => getLabel(r).toLowerCase().includes(q.trim().toLowerCase()))
    : available;
  return (
    <div>
      {searchPlaceholder && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className={inputCls + " mb-2 py-2"}
        />
      )}
      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {filtered.map((r) => (
          <li key={getId(r)} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{getLabel(r)}</span>
            <button type="button" onClick={() => onAdd(r)} className={btnGhostSm}>
              Attach
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="py-2 text-sm text-slate-400">No matches.</li>}
      </ul>
    </div>
  );
}

/** One row in the "Suggested from your activity" strip — a tag, a label, one-click Attach. */
function SuggestionRow({
  tag,
  label,
  onAttach,
}: {
  tag: string;
  label: string;
  onAttach: () => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
        {tag}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{label}</span>
      <button type="button" onClick={onAttach} className={btnGhostSm}>
        Attach
      </button>
    </li>
  );
}
