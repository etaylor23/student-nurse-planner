import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MED_LOG_TYPE_LABEL, type MedicationLog, type Shift } from "../../../domain/types";
import { useMedications } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { ShiftMedLogForm } from "../medications/ShiftMedLogForm";
import { CaptureConfirmation, TabHeading, useCaptureFlash } from "./shared";

/**
 * The Medications capture tab: the meds already logged on this shift, plus the
 * embeddable `ShiftMedLogForm` inline (shift pinned, no picker). Logging refreshes
 * the list and stays in the modal — quick to log several against one shift.
 */
export function ShiftMedicationsTab({ shift }: { shift: Shift }) {
  const { repo } = useRepository();
  const { medications } = useMedications();
  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const { message, flash } = useCaptureFlash();

  const refetch = useCallback(async () => {
    setLogs(await repo.listMedicationLogsForShift(shift.id));
  }, [repo, shift.id]);

  useEffect(() => {
    void refetch();
  }, [refetch, shift.updatedAt]);

  const medName = useMemo(() => new Map(medications.map((m) => [m.id, m.name])), [medications]);

  return (
    <div>
      <TabHeading label="Medications logged" count={logs.length} />

      <CaptureConfirmation message={message} />

      {logs.length === 0 ? (
        <p className="text-sm text-slate-400">None yet — log one against this shift below.</p>
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

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Log a medication
        </p>
        <ShiftMedLogForm
          shiftId={shift.id}
          onLogged={() => {
            void refetch();
            flash("Medication logged to this shift");
          }}
        />
      </div>
    </div>
  );
}
