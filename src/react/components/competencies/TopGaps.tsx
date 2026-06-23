import { Link } from "react-router-dom";
import { surfaceGaps } from "../../../logic/proficiencies";
import { useProficiencies } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { Panel, btnGhostSm } from "../ui";
import { StatusPill } from "./shared";

/**
 * The most urgent competency gaps, surfaced on the landing page so they're visible
 * without opening the tracker. Renders nothing when there are no gaps for the
 * student's current part. Ordering matches the Gaps view (escalating first).
 */
export function TopGaps({ limit = 3 }: { limit?: number }) {
  const { user } = useRepository();
  const { proficiencies, progress } = useProficiencies();

  if (!user || proficiencies.length === 0) return null;
  const gaps = surfaceGaps(proficiencies, progress, user);
  if (gaps.length === 0) return null;

  return (
    <Panel
      title="Top competency gaps"
      hint={`${gaps.length} outstanding for part ${user.currentPart} of ${user.totalParts}`}
      action={
        <Link to="/competencies/gaps" className={btnGhostSm}>
          View all
        </Link>
      }
    >
      <ul className="divide-y divide-slate-100">
        {gaps.slice(0, limit).map((g) => (
          <li key={g.proficiency.id}>
            <Link
              to={`/competencies/proficiency/${g.proficiency.id}`}
              className="flex items-start gap-3 py-2.5 transition hover:bg-slate-50"
            >
              <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                {g.proficiency.code}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 text-sm text-slate-700">
                {g.proficiency.statement}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill status={g.status} />
                {g.escalating && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-100">
                    Due now
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
