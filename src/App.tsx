import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RepositoryProvider } from "./react/RepositoryContext";
import { AppLayout } from "./react/components/AppLayout";
import { HoursLogPage } from "./react/components/HoursLogPage";
import { PlannerPage } from "./react/components/PlannerPage";
import { DEFAULT_ROUTE } from "./react/nav";

export function App() {
  return (
    <RepositoryProvider>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/placement-hours" element={<HoursLogPage />} />
            <Route path="/planner" element={<PlannerPage />} />
            {/* `/` and any unknown path land on the first enabled feature. */}
            <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </RepositoryProvider>
  );
}
