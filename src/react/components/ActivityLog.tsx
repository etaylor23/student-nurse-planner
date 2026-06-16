import { useEffect, useState } from "react";
import type { LogItem } from "../../domain/types";
import { useShifts } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { LogList } from "./LogList";
import { Panel } from "./ui";

/**
 * A global, newest-first feed of everything done across all shifts — a "history of
 * what you've done", like Jira's activity stream. Re-fetches whenever the shared
 * shift list changes (a proxy for "an action happened"), so it stays live. Deleted
 * shifts keep their entries here even though they're gone from the calendar.
 */
export function ActivityLog() {
  const { repo, user } = useRepository();
  const { shifts } = useShifts();
  const [items, setItems] = useState<LogItem[]>([]);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void repo.listLogItems(user.id).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
    // `shifts` is the refetch trigger: it gets a new reference on every reload.
  }, [repo, user, shifts]);

  return (
    <Panel title="Activity" hint="A running history of changes to your shifts">
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing yet — log, complete or edit a shift and it'll show here.
        </p>
      ) : (
        <LogList items={items} showLabel />
      )}
    </Panel>
  );
}
