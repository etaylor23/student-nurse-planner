import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MED_LOG_TYPE_LABEL, type MedicationLog, type Shift } from "../../domain/types";
import { useMedications } from "../hooks";
import { useRepository } from "../RepositoryContext";

/**
 * The medications logged during a shift — the "actions happen in a shift" link.
 * Shown in the shift editor (planner + hours log). Always renders so the
 * "Log a medication" shortcut (opens the med log pinned to this shift) is available
 * even before anything is logged.
 */
export function ShiftMedications({ shift }: { shift: Shift }) {
  const { repo } = useRepository();
  const { medications } = useMedications();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<MedicationLog[]>([]);

  useEffect(() => {
    let active = true;
    void repo.listMedicationLogsForShift(shift.id).then((rows) => {
      if (active) setLogs(rows);
    });
    return () => {
      active = false;
    };
  }, [repo, shift.id, shift.updatedAt]);

  const medName = new Map(medications.map((m) => [m.id, m.name]));

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Medications logged
        </p>
        <button
          type="button"
          onClick={() => navigate("/medications/log", { state: { prefillShiftId: shift.id } })}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
        >
          + Log a medication
        </button>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-slate-400">None yet — log one against this shift.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-sm">
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
              {l.medicationId ? (
                <Link
                  to={`/medications/${l.medicationId}`}
                  className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700"
                >
                  {medName.get(l.medicationId) ?? "Medication"}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate text-slate-500">Unlinked</span>
              )}
              {l.route && <span className="shrink-0 text-xs text-slate-400">{l.route}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
