import { useMemo, useState } from "react";
import type { Proficiency, Shift, Skill } from "../../../domain/types";
import { annexeCodeOf, annexeProficiencyIdOf } from "../../../data/seed/skills";
import { formatHumanDate, hhmm, isoDate } from "../../../logic/calendar";
import { findCurrentShift, recentShifts } from "../../../logic/shiftContext";
import { usePlacements, useProficiencies, useShifts } from "../../hooks";
import { useSkillActions } from "../../useSkillActions";
import { ProficiencyPicker } from "../competencies/ProficiencyPicker";
import { btnPrimary, inputCls } from "../ui";

const todayIso = () => isoDate(new Date());

function shiftLabel(s: Shift, placeName: Map<string, string>): string {
  const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
  const times =
    s.startAt && s.endAt ? ` ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
  return `${formatHumanDate(s.date)} · ${place}${times}`;
}

/**
 * The permanent sign-off form for one skill — who / where / when / evidence, with
 * the Annexe B 1:1 proficiency auto-attached (or a chosen proficiency for a custom
 * skill) so a sign-off feeds the PAD in one step. Reuses `useSkillActions().signOff`.
 *
 * Shared by the standalone skill detail (its own shift picker) and the shift
 * modal's Skills tab (`pinnedShiftId` fixes the shift, hiding the picker). Calls
 * `onSignedOff` once done.
 */
export function SkillSignOffForm({
  skill,
  pinnedShiftId,
  onSignedOff,
}: {
  skill: Skill;
  /** When set, the sign-off records this shift and the shift picker is hidden. */
  pinnedShiftId?: string;
  onSignedOff?: () => void;
}) {
  const { signOff } = useSkillActions();
  const { evidenceLinks, reload: reloadProfs } = useProficiencies();
  const { shifts } = useShifts();
  const { placements } = usePlacements();

  const [byName, setByName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayIso());
  const [evidenceNote, setEvidenceNote] = useState("");
  const [alsoLink, setAlsoLink] = useState(true);
  // `null` = auto-follow the current timed shift; once picked, the choice wins.
  const [pickedShift, setPickedShift] = useState<string | null>(null);
  const [signOffProf, setSignOffProf] = useState<Proficiency | null>(null);
  const [signOffPickerOpen, setSignOffPickerOpen] = useState(false);

  const placeName = useMemo(() => new Map(placements.map((p) => [p.id, p.name])), [placements]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const currentShift = useMemo(() => findCurrentShift(shifts, Date.now()), [shifts]);
  const recent = useMemo(() => recentShifts(shifts, todayIso()), [shifts]);
  const signOffShiftId =
    pinnedShiftId ?? (pickedShift === null ? (currentShift?.id ?? "") : pickedShift);
  const selectedShift = signOffShiftId ? shiftById.get(signOffShiftId) : undefined;
  const shiftOptions = useMemo(() => {
    if (selectedShift && !recent.some((s) => s.id === selectedShift.id)) {
      return [selectedShift, ...recent];
    }
    return recent;
  }, [recent, selectedShift]);

  const profId = annexeProficiencyIdOf(skill);
  const profCode = annexeCodeOf(skill);
  // Proficiencies this skill already evidences — excluded from the custom-skill picker.
  const linkedProfIds = useMemo(
    () =>
      new Set(
        evidenceLinks
          .filter((l) => l.evidenceType === "SKILL" && l.evidenceId === skill.id)
          .map((l) => l.proficiencyId),
      ),
    [evidenceLinks, skill.id],
  );
  const alreadyLinked = !!(profId && linkedProfIds.has(profId));

  const handleSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    // Custom skills attach the proficiency the student picked; Annexe B skills
    // auto-attach their 1:1 proficiency unless it's already linked / opted out.
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
    await reloadProfs();
    onSignedOff?.();
  };

  return (
    <form onSubmit={handleSignOff} className="space-y-4">
      {!pinnedShiftId && (
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
                You're in a shift now — linked automatically. Change it here if you meant a recent
                one.
              </span>
            ) : recent.length > 0 ? (
              "Optionally link the shift this was signed off in (last 7 days)."
            ) : (
              "No recent shifts to link — sign-off can have no shift."
            )}
          </span>
        </label>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Signed off by</span>
          <input
            value={byName}
            onChange={(e) => setByName(e.target.value)}
            className={inputCls}
            placeholder="Practice supervisor / assessor"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Location</span>
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
            Also attach this as evidence for proficiency <strong>{profCode}</strong> in your
            competency tracker.
          </span>
        </label>
      )}
      {profId && profCode && alreadyLinked && (
        <p className="text-xs text-slate-400">Already attached as evidence for {profCode}.</p>
      )}
      {skill.source === "CUSTOM" &&
        (signOffProf ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-100">
            <span>
              Will also attach as evidence for <strong>{signOffProf.code}</strong> when you sign
              off.
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
  );
}
