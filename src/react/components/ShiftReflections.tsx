import { Link, useNavigate } from "react-router-dom";
import type { Shift } from "../../domain/types";
import { useReflections } from "../hooks";
import { LockBadge } from "./reflection/shared";

/**
 * The reflections written about a shift — the reflection capture's "actions happen in
 * a shift" link (mirroring `ShiftMedications` / `ShiftSkills`). Shown in the shift
 * editor (planner + hours log). Always renders so the "Write a reflection" shortcut
 * (opens the editor seeded with this shift) is available even before anything exists.
 */
export function ShiftReflections({ shift }: { shift: Shift }) {
  const { reflections } = useReflections();
  const navigate = useNavigate();

  const rows = reflections.filter((r) => r.shiftId === shift.id);

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Reflections{rows.length > 0 ? ` · ${rows.length}` : ""}
        </p>
        <button
          type="button"
          onClick={() => navigate("/reflection/new", { state: { prefillShiftId: shift.id } })}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
        >
          + Write a reflection
        </button>
      </div>
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
