import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RepositoryProvider } from "./react/RepositoryContext";
import { ShiftsProvider } from "./react/ShiftsContext";
import { AppLayout } from "./react/components/AppLayout";
import { HomePage } from "./react/components/HomePage";
import { HoursLogPage } from "./react/components/HoursLogPage";
import { PlannerPage } from "./react/components/PlannerPage";
import { PlacementDetailPage } from "./react/components/PlacementDetailPage";
import { MedicationNotesPage } from "./react/components/MedicationNotesPage";
import { NmcCompetenciesPage } from "./react/components/NmcCompetenciesPage";
import { SkillsPage } from "./react/components/SkillsPage";
import { ReflectionPage } from "./react/components/ReflectionPage";
import { RevisionPage } from "./react/components/RevisionPage";
import { SelfCarePage } from "./react/components/SelfCarePage";
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
              <Route path="/home" element={<HomePage />} />
              <Route path="/placement-hours" element={<HoursLogPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/planner/:shiftId" element={<PlannerPage />} />
              <Route path="/placements/:id" element={<PlacementDetailPage />} />
              <Route path="/medications/*" element={<MedicationNotesPage />} />
              <Route path="/competencies/*" element={<NmcCompetenciesPage />} />
              <Route path="/skills/*" element={<SkillsPage />} />
              <Route path="/reflection/*" element={<ReflectionPage />} />
              <Route path="/revision/*" element={<RevisionPage />} />
              <Route path="/self-care" element={<SelfCarePage />} />
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
