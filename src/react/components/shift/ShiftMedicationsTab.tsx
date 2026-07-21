import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { MED_LOG_TYPE_LABEL, type MedicationLog, type Shift } from "../../../domain/types";
import { EMPTY_FILTERS, type MedFilters } from "../../../logic/medicationFilters";
import { useMedications } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { MedicationCatalog } from "../medications/MedicationCatalog";
import { MedicationFormPage } from "../medications/MedicationFormPage";
import { ShiftMedLogForm } from "../medications/ShiftMedLogForm";
import { Tabs } from "../Tabs";
import { btnGhostSm } from "../ui";
import { CaptureConfirmation, SeeFullLink, TabHeading, useCaptureFlash } from "./shared";

/**
 * The Medications capture tab — two sub-tabs (shared <Tabs>): "Log" (this shift's
 * logged meds + the pinned log form) and "Medications" (the global reference
 * catalog). URL-driven: /planner/:id/medications (Log, index) and .../catalog.
 */
export function ShiftMedicationsTab({ shift }: { shift: Shift }) {
  const base = `/planner/${shift.id}/medications`;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Tabs
          items={[
            { to: base, label: "Log", end: true },
            { to: `${base}/catalog`, label: "Medications" },
          ]}
          variant="segmented"
          ariaLabel="Medications sections"
        />
        <SeeFullLink to="/medications">See full medication notes</SeeFullLink>
      </div>

      <Routes>
        <Route index element={<MedLogView shift={shift} />} />
        <Route path="catalog" element={<CatalogView base={base} />} />
        <Route path="catalog/new" element={<MedAddView base={base} />} />
      </Routes>
    </div>
  );
}

/** Sub-tab 1: this shift's logged meds + the shift-pinned log form. */
function MedLogView({ shift }: { shift: Shift }) {
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

/** Sub-tab 2: the global medication catalog (local filter state; details open out).
 *  "Add medication" opens the form inline at .../catalog/new — no navigating away. */
function CatalogView({ base }: { base: string }) {
  const [filters, setFilters] = useState<MedFilters>(EMPTY_FILTERS);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Link to={`${base}/catalog/new`} className={btnGhostSm}>
          + Add medication
        </Link>
      </div>
      <MedicationCatalog
        filters={filters}
        onFilterChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />
    </div>
  );
}

/** Add a new reference card inline (reuses the standalone MedicationFormPage,
 *  embedded); saving or cancelling returns to the catalog. */
function MedAddView({ base }: { base: string }) {
  const navigate = useNavigate();
  const backToCatalog = () => navigate(`${base}/catalog`);
  return <MedicationFormPage onSaved={backToCatalog} onCancel={backToCatalog} />;
}
