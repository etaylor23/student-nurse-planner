import { useEffect, useMemo, useState } from "react";
import type { LogItem } from "../../domain/types";
import { useShifts } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { LogList } from "./LogList";
import { Panel } from "./ui";

/** Feed filter chips → the entity types each one shows. `all` shows everything. */
type FeedFilter =
  | "all"
  | "shifts"
  | "meds"
  | "competencies"
  | "skills"
  | "reflections"
  | "revision";
const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "shifts", label: "Shifts" },
  { key: "meds", label: "Meds" },
  { key: "competencies", label: "Competencies" },
  { key: "skills", label: "Skills" },
  { key: "reflections", label: "Reflections" },
  { key: "revision", label: "Revision" },
];
/** Which chip an entity type falls under (types with no chip only show under "All"). */
const FEED_CATEGORY: Record<string, FeedFilter> = {
  SHIFT: "shifts",
  MEDICATION: "meds",
  MEDICATION_LOG: "meds",
  PROFICIENCY: "competencies",
  SKILL: "skills",
  REFLECTION: "reflections",
  REVISION: "revision",
};

/**
 * A global, newest-first feed of everything done across all shifts — a "history of
 * what you've done", like Jira's activity stream. Re-fetches whenever the shared
 * shift list changes (a proxy for "an action happened"), so it stays live. Deleted
 * shifts keep their entries here even though they're gone from the calendar. Entries
 * are clickable (see `LogList`) and filterable by area.
 */
export function ActivityLog() {
  const { repo, user } = useRepository();
  const { shifts } = useShifts();
  const [items, setItems] = useState<LogItem[]>([]);
  const [filter, setFilter] = useState<FeedFilter>("all");

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

  const visible = useMemo(
    () =>
      filter === "all" ? items : items.filter((it) => FEED_CATEGORY[it.entityType] === filter),
    [items, filter],
  );

  return (
    <Panel title="Activity" hint="A running history of what you've done">
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing yet — log a med, or create, complete or edit a shift, and it'll show here.
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition " +
                  (filter === f.key
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing in this area yet.</p>
          ) : (
            <LogList items={visible} showLabel />
          )}
        </>
      )}
    </Panel>
  );
}
