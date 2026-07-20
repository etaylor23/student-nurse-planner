import { useState } from "react";
import { Link } from "react-router-dom";
import type { Shift } from "../../../domain/types";
import { useReflections } from "../../hooks";
import { ReflectionEditor } from "../reflection/ReflectionEditor";
import { LockBadge } from "../reflection/shared";
import { addBtnCls, CaptureConfirmation, TabHeading, useCaptureFlash } from "./shared";

/**
 * The Reflections capture tab: the reflections already written about this shift,
 * plus the full Gibbs `ReflectionEditor` inline (shift pre-linked). Saving reloads
 * the list and stays in the modal — you never leave the shift to reflect on it.
 */
export function ShiftReflectionsTab({ shift }: { shift: Shift }) {
  const { reflections, reload } = useReflections();
  const [writing, setWriting] = useState(false);
  const { message, flash } = useCaptureFlash();

  const rows = reflections.filter((r) => r.shiftId === shift.id);

  const handleSaved = async () => {
    await reload();
    setWriting(false);
    flash("Reflection saved to this shift");
  };

  return (
    <div>
      <TabHeading
        label="Reflections"
        count={rows.length}
        action={
          !writing && (
            <button type="button" onClick={() => setWriting(true)} className={addBtnCls}>
              + Write a reflection
            </button>
          )
        }
      />

      <CaptureConfirmation message={message} />

      {rows.length === 0 ? (
        !writing && (
          <p className="text-sm text-slate-400">None yet — reflect on something from this shift.</p>
        )
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

      {writing && (
        <div className={rows.length > 0 ? "mt-4 border-t border-slate-100 pt-4" : ""}>
          <ReflectionEditor
            prefillShiftId={shift.id}
            onSaved={() => void handleSaved()}
            onCancel={() => setWriting(false)}
          />
        </div>
      )}
    </div>
  );
}
