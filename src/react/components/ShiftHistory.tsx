import { useEffect, useState } from "react";
import type { LogItem, Shift } from "../../domain/types";
import { useRepository } from "../RepositoryContext";
import { LogList } from "./LogList";

/**
 * A single shift's audit history (newest first), in the style of Jira's issue
 * history. Refetches whenever the shift is mutated — `updatedAt` bumps on every
 * action — so a freshly logged entry appears without closing the editor.
 */
export function ShiftHistory({ shift }: { shift: Shift }) {
  const { repo, user } = useRepository();
  const [items, setItems] = useState<LogItem[]>([]);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void repo.listLogItems(user.id, { entityType: "SHIFT", entityId: shift.id }).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [repo, user, shift.id, shift.updatedAt]);

  if (items.length === 0) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
      <LogList items={items} />
    </div>
  );
}
