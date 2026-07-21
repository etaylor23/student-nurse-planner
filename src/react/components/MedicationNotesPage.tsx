import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PageHero } from "./ui";
import { Tabs } from "./Tabs";
import { MedicationListPage } from "./medications/MedicationListPage";
import { MedicationDetailPage } from "./medications/MedicationDetailPage";
import { MedicationFormPage } from "./medications/MedicationFormPage";
import { CalcPracticePage } from "./medications/CalcPracticePage";
import { MedLogPage } from "./medications/MedLogPage";

const TABS = [
  { key: "meds", to: "/medications", label: "Medications" },
  { key: "calc", to: "/medications/calc", label: "Calc practice" },
  { key: "log", to: "/medications/log", label: "Med log" },
];

/**
 * Medication Notes shell: a study aid + log. Persistent safety banner and a
 * segmented tab nav, then nested routes so every major view/state is reachable by
 * URL. See spec-medication-notes.md.
 */
export function MedicationNotesPage() {
  const { pathname } = useLocation();
  const active = pathname.startsWith("/medications/calc")
    ? "calc"
    : pathname.startsWith("/medications/log")
      ? "log"
      : "meds";
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Study aid"
        title="Medication notes"
        subtitle="A revision reference and a personal log of meds you've observed or administered."
      />

      <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <span>
          <span className="font-semibold">Study tool only.</span> For learning — never a clinical
          dosing reference, and it holds no patient-identifiable information.
        </span>
      </div>

      <Tabs
        variant="segmented"
        ariaLabel="Medication notes sections"
        items={TABS.map((t) => ({ to: t.to, label: t.label, active: active === t.key }))}
      />

      <Routes>
        <Route index element={<MedicationListPage />} />
        <Route path="filter/*" element={<MedicationListPage />} />
        <Route path="new" element={<MedicationFormPage />} />
        <Route path=":id" element={<MedicationDetailPage />} />
        <Route path=":id/edit" element={<MedicationFormPage />} />
        <Route path="calc" element={<CalcPracticePage />} />
        <Route path="calc/:type" element={<CalcPracticePage />} />
        <Route path="log" element={<MedLogPage />} />
        <Route path="log/:type" element={<MedLogPage />} />
        <Route path="*" element={<Navigate to="/medications" replace />} />
      </Routes>
    </div>
  );
}
