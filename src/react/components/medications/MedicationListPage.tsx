import { Link, useNavigate, useParams } from "react-router-dom";
import {
  buildMedFilterPath,
  parseMedFilters,
  type MedFilters,
} from "../../../logic/medicationFilters";
import { Panel, btnPrimary } from "../ui";
import { MedicationCatalog } from "./MedicationCatalog";

/**
 * The standalone medication catalog page. Owns shareable, path-based filter state
 * (/medications/filter/<key>/<value>…) and delegates the search/filter/grid to the
 * shared `MedicationCatalog`. The shift modal reuses that same catalog with local
 * filter state.
 */
export function MedicationListPage() {
  const params = useParams();
  const navigate = useNavigate();
  const filters = parseMedFilters(params["*"]);
  const setFilter = (patch: Partial<MedFilters>) =>
    navigate(buildMedFilterPath({ ...filters, ...patch }), { replace: true });
  const clearFilters = () => navigate("/medications", { replace: true });

  return (
    <Panel
      title="Your medications"
      hint="Search and filter your reference cards"
      action={
        <Link to="/medications/new" className={btnPrimary}>
          Add medication
        </Link>
      }
    >
      <MedicationCatalog filters={filters} onFilterChange={setFilter} onClear={clearFilters} />
    </Panel>
  );
}
