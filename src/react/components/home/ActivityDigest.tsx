import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LogItem } from "../../../domain/types";
import { useShifts } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { LogList } from "../LogList";
import { Panel, btnGhostSm } from "../ui";

/**
 * "YOUR RECORD" — a short digest of the most recent captures, with the full
 * filterable log one click away (spec-home-redesign.md decision 9).
 *
 * Home used to carry the whole `ActivityLog`, filter tabs and all, which made the last
 * chapter of the page the largest thing on it. The tabs moved to `/activity`; what's
 * left here answers "did that save?" and nothing more.
 *
 * Asking your notes is excluded. It is a real audit event and it stays in the full log,
 * but it isn't a capture — a few questions in a row would otherwise push every actual
 * record off a six-row digest.
 */
const DIGEST_LIMIT = 6;

export function ActivityDigest() {
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

  const digest = useMemo(
    () => items.filter((it) => it.entityType !== "AI").slice(0, DIGEST_LIMIT),
    [items],
  );

  return (
    <Panel
      eyebrow="Your record"
      title="Activity"
      hint="Your most recent captures"
      action={
        <Link to="/activity" className={btnGhostSm}>
          See full audit log
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      }
    >
      {digest.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing yet. Log a med, or create, complete or edit a shift, and it&apos;ll show here.
        </p>
      ) : (
        <LogList items={digest} showLabel />
      )}
    </Panel>
  );
}
