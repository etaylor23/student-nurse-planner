import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ADMIN_ROUTES,
  MED_LOG_TYPE_LABEL,
  type MedLogType,
  type Shift,
} from "../../../domain/types";
import { formatHumanDate, hhmm, isoDate } from "../../../logic/calendar";
import { findCurrentShift, recentShifts } from "../../../logic/shiftContext";
import { useMedicationLogs, useMedications, usePlacements, useShifts } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { Panel, btnPrimary, inputCls } from "../ui";

const todayIso = () => isoDate(new Date());

function shiftLabel(s: Shift, placeName: Map<string, string>): string {
  const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
  const times =
    s.startAt && s.endAt
      ? ` ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}`
      : " (all day)";
  return `${formatHumanDate(s.date)} · ${place}${times}`;
}

export function MedLogPage() {
  const { logs, reload } = useMedicationLogs();
  const { medications } = useMedications();
  const { shifts } = useShifts();
  const { placements } = usePlacements();
  const { repo, user } = useRepository();
  const { type: typeSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Optional prefill passed via router state (e.g. "Log again" from a med detail,
  // or "Log a medication" from a shift editor) — not a query string.
  const prefill = (location.state ?? {}) as {
    prefillMedicationId?: string;
    prefillShiftId?: string;
  };
  const typeFilter: MedLogType | null =
    typeSlug === "observed" ? "OBSERVED" : typeSlug === "administered" ? "ADMINISTERED" : null;

  const placeName = useMemo(() => new Map(placements.map((p) => [p.id, p.name])), [placements]);
  const medName = useMemo(() => new Map(medications.map((m) => [m.id, m.name])), [medications]);
  const currentShift = useMemo(() => findCurrentShift(shifts, Date.now()), [shifts]);
  const recent = useMemo(() => recentShifts(shifts, todayIso()), [shifts]);

  const [medicationId, setMedicationId] = useState(prefill.prefillMedicationId ?? "");
  const [type, setType] = useState<MedLogType>("OBSERVED");
  const [date, setDate] = useState(todayIso());
  const [route, setRoute] = useState("");
  const [notes, setNotes] = useState("");
  // `picked === null` means "auto-follow the current shift" (derived live so it's
  // right once shifts load); once the user chooses, their pick wins ("" = no shift).
  // A prefilled shift (from a shift editor's "Log a medication") pins that shift.
  const [picked, setPicked] = useState<string | null>(prefill.prefillShiftId ?? null);
  const shiftId = picked === null ? (currentShift?.id ?? "") : picked;

  const rows = typeFilter ? logs.filter((l) => l.type === typeFilter) : logs;
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  // Options = recent shifts, plus the currently-selected shift if it's older than
  // 7 days (e.g. pinned from a shift editor) so it always shows as selected.
  const selectedShift = shiftId ? shiftById.get(shiftId) : undefined;
  const shiftOptions = useMemo(() => {
    if (selectedShift && !recent.some((s) => s.id === selectedShift.id)) {
      return [selectedShift, ...recent];
    }
    return recent;
  }, [recent, selectedShift]);

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
    setPicked(null); // re-default to the current shift
    await reload();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this log entry?")) return;
    await repo.deleteMedicationLog(id);
    await reload();
  };

  return (
    <div className="space-y-6">
      <Panel
        step="1"
        title="Log a med"
        hint="Observed or administered — no patient-identifiable info"
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Shift</span>
            <select
              value={shiftId}
              onChange={(e) => setPicked(e.target.value)}
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
                  You're in a shift now ({shiftLabel(currentShift, placeName)}) — linked
                  automatically. Change it here if you meant a recent one.
                </span>
              ) : recent.length > 0 ? (
                "Not in a shift — optionally link one from the last 7 days."
              ) : (
                "No shifts in the last 7 days to link to."
              )}
            </span>
          </label>

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
      </Panel>

      <Panel
        title="Your med log"
        hint="Everything you've observed or administered"
        action={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {[
              { slug: "", label: "All" },
              { slug: "observed", label: "Observed" },
              { slug: "administered", label: "Administered" },
            ].map((f) => (
              <button
                key={f.slug}
                type="button"
                onClick={() => navigate(f.slug ? `/medications/log/${f.slug}` : "/medications/log")}
                className={
                  "rounded-md px-2.5 py-1 text-xs font-medium transition " +
                  ((typeSlug ?? "") === f.slug
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            No log entries yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((l) => {
              const linked = l.shiftId ? shiftById.get(l.shiftId) : undefined;
              return (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (l.type === "ADMINISTERED"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : "bg-sky-50 text-sky-700 ring-1 ring-sky-100")
                    }
                  >
                    {MED_LOG_TYPE_LABEL[l.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {l.medicationId ? (medName.get(l.medicationId) ?? "Unknown med") : "Unlinked"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatHumanDate(l.date)}
                      {l.route ? ` · ${l.route}` : ""}
                      {linked ? ` · in ${shiftLabel(linked, placeName)}` : ""}
                      {l.notes ? ` · ${l.notes}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(l.id)}
                    aria-label="Delete entry"
                    className="text-xs font-medium text-rose-600"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
