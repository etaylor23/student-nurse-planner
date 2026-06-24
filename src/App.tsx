import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RepositoryProvider } from "./react/RepositoryContext";
import { ShiftsProvider } from "./react/ShiftsContext";
import { AppLayout } from "./react/components/AppLayout";
import { HoursLogPage } from "./react/components/HoursLogPage";
import { PlannerPage } from "./react/components/PlannerPage";
import { MedicationNotesPage } from "./react/components/MedicationNotesPage";
import { NmcCompetenciesPage } from "./react/components/NmcCompetenciesPage";
import { ProfilePage } from "./react/components/ProfilePage";
import { DEFAULT_ROUTE } from "./react/nav";

// "/" locally, "/student-nurse-planner" on GitHub Pages (from Vite's base).
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export function App() {
  return (
    <RepositoryProvider>
      <ShiftsProvider>
        <BrowserRouter basename={basename}>
          <AppLayout>
            <Routes>
              <Route path="/placement-hours" element={<HoursLogPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/planner/:shiftId" element={<PlannerPage />} />
              <Route path="/medications/*" element={<MedicationNotesPage />} />
              <Route path="/competencies/*" element={<NmcCompetenciesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              {/* `/` and any unknown path land on the first enabled feature. */}
              <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </ShiftsProvider>
    </RepositoryProvider>
  );
}
