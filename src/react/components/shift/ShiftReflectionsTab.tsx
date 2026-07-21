import { Link, Route, Routes, useNavigate } from "react-router-dom";
import type { Shift } from "../../../domain/types";
import { useReflections } from "../../hooks";
import { ReflectionEditor } from "../reflection/ReflectionEditor";
import { LockBadge } from "../reflection/shared";
import { addBtnCls, CaptureConfirmation, SeeFullLink, TabHeading, useCaptureFlash } from "./shared";

/**
 * The Reflections capture tab. URL-driven: /planner/:id/reflection lists this
 * shift's reflections; /planner/:id/reflection/new writes one inline (the full
 * Gibbs ReflectionEditor, shift pre-linked). Saving returns to the list — which
 * refetches on mount — and flashes a confirmation, all in the modal.
 */
export function ShiftReflectionsTab({ shift }: { shift: Shift }) {
  const base = `/planner/${shift.id}/reflection`;
  const navigate = useNavigate();
  const { message, flash } = useCaptureFlash();

  return (
    <div>
      <CaptureConfirmation message={message} />
      <Routes>
        <Route index element={<ReflectionListView shift={shift} base={base} />} />
        <Route
          path="new"
          element={
            <ReflectionNewView
              shift={shift}
              onSaved={() => {
                flash("Reflection saved to this shift");
                navigate(base);
              }}
              onCancel={() => navigate(base)}
            />
          }
        />
      </Routes>
    </div>
  );
}

function ReflectionListView({ shift, base }: { shift: Shift; base: string }) {
  const { reflections } = useReflections();
  const rows = reflections.filter((r) => r.shiftId === shift.id);

  return (
    <div>
      <TabHeading
        label="Reflections"
        count={rows.length}
        action={
          <div className="flex items-center gap-3">
            <Link to={`${base}/new`} className={addBtnCls}>
              + Write a reflection
            </Link>
            <SeeFullLink to="/reflection">See full reflections</SeeFullLink>
          </div>
        }
      />
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">None yet — reflect on something from this shift.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <Link
                to={`/reflection/${r.id}`}
                className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700"
              >
                {r.title}
              </Link>
              {r.isLocked && <LockBadge />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReflectionNewView({
  shift,
  onSaved,
  onCancel,
}: {
  shift: Shift;
  onSaved: () => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Write a reflection
        </p>
        <SeeFullLink to="/reflection">See full reflections</SeeFullLink>
      </div>
      <ReflectionEditor prefillShiftId={shift.id} onSaved={onSaved} onCancel={onCancel} />
    </div>
  );
}
