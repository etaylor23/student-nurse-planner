import { useState } from "react";
import { MED_LOG_TYPE_LABEL, type MedLogType, type Shift } from "../../../domain/types";
import { ADMIN_ROUTES } from "../../../data/bnf";
import { formatHumanDate, hhmm, isoDate } from "../../../logic/calendar";
import { useMedications, usePlacements, useShifts } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { btnPrimary, inputCls } from "../ui";

const todayIso = () => isoDate(new Date());

function shiftLabel(s: Shift, placeName: Map<string, string>): string {
  const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
  const times =
    s.startAt && s.endAt
      ? ` ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}`
      : " (all day)";
  return `${formatHumanDate(s.date)} · ${place}${times}`;
}

/**
 * The embeddable med-log form — medication, type, date, route and notes, with the
 * shift **fixed** by the `shiftId` prop (no picker) and no navigation on save. It
 * writes the log + its Activity entry, resets, and calls `onLogged`. Shared by the
 * standalone `/medications/log` page (which supplies its own shift picker above)
 * and the shift modal's Medications tab (which pins the open shift). An empty
 * `shiftId` logs with no shift.
 */
export function ShiftMedLogForm({
  shiftId,
  prefillMedicationId,
  onLogged,
}: {
  shiftId: string;
  prefillMedicationId?: string;
  onLogged?: () => void;
}) {
  const { repo, user } = useRepository();
  const { medications } = useMedications();
  const { shifts } = useShifts();
  const { placements } = usePlacements();

  const [medicationId, setMedicationId] = useState(prefillMedicationId ?? "");
  const [type, setType] = useState<MedLogType>("OBSERVED");
  const [date, setDate] = useState(todayIso());
  const [route, setRoute] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const created = await repo.createMedicationLog({
      userId: user.id,
      medicationId: medicationId || undefined,
      shiftId: shiftId || undefined,
      type,
      date,
      route: route || undefined,
      notes: notes.trim() || undefined,
    });
    // Audit: med logs are actions-in-a-shift, so they join the global Activity feed.
    const medName = new Map(medications.map((m) => [m.id, m.name]));
    const placeName = new Map(placements.map((p) => [p.id, p.name]));
    const shiftById = new Map(shifts.map((s) => [s.id, s]));
    const loggedMed = medicationId ? (medName.get(medicationId) ?? "a medication") : "a medication";
    const linked = shiftId ? shiftById.get(shiftId) : undefined;
    await repo.createLogItem({
      userId: user.id,
      entityType: "MEDICATION_LOG",
      entityId: created.id,
      entityLabel: loggedMed,
      action: "MED_LOGGED",
      summary: `${MED_LOG_TYPE_LABEL[type]} ${loggedMed}${linked ? ` in ${shiftLabel(linked, placeName)}` : ""}`,
    });
    setMedicationId("");
    setRoute("");
    setNotes("");
    setDate(todayIso());
    onLogged?.();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Medication</span>
          <select
            value={medicationId}
            onChange={(e) => setMedicationId(e.target.value)}
            className={inputCls}
          >
            <option value="">Not linked</option>
            {medications.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MedLogType)}
            className={inputCls}
          >
            <option value="OBSERVED">Observed</option>
            <option value="ADMINISTERED">Administered</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Route</span>
          <select value={route} onChange={(e) => setRoute(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {ADMIN_ROUTES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="What you learned — no patient-identifiable information."
        />
        <span className="mt-1 block text-xs text-amber-700">
          Never record anything that could identify a patient.
        </span>
      </label>
      <button type="submit" className={btnPrimary}>
        Add to log
      </button>
    </form>
  );
}
