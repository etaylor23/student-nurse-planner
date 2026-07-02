import { Link } from "react-router-dom";
import { surfaceGaps } from "../../../logic/proficiencies";
import { useProficiencies } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { Panel, btnGhostSm } from "../ui";
import { StatusPill } from "./shared";

/** Gaps view — not-yet-achieved / developing, filtered by the student's current part. */
export function GapsPage() {
  const { user } = useRepository();
  const { proficiencies, progress } = useProficiencies();

  if (!user || proficiencies.length === 0) {
    return (
      <Panel title="Gaps">
        <p className="text-sm text-slate-400">Loading…</p>
      </Panel>
    );
  }

  const gaps = surfaceGaps(proficiencies, progress, user);

  return (
    <div className="space-y-4">
      <Panel
        title="Outstanding gaps"
        hint={`Based on part ${user.currentPart} of ${user.totalParts}`}
        action={
          <Link to="/profile" className={btnGhostSm}>
            Change part
          </Link>
        }
      >
        {gaps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-600">No gaps surfaced for this part.</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
              Gaps appear for any proficiency not yet achieved once you've reached its target part —
              or, if untagged, once you're in your final part ({user.totalParts}). Tag a
              proficiency's target part on its page, or update your{" "}
              <Link to="/profile" className="font-medium text-emerald-700">
                current part
              </Link>
              , to sharpen these warnings.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {gaps.map((g) => {
              // An Annexe B gap has a 1:1 baseline skill — the concrete way to close it.
              const skillId = g.proficiency.annexe === "B" ? `skill_${g.proficiency.code}` : null;
              return (
                <li key={g.proficiency.id}>
                  <Link
                    to={`/competencies/proficiency/${g.proficiency.id}`}
                    className={
                      "flex items-start gap-3 pt-3 transition hover:bg-slate-50 " +
                      (skillId ? "pb-1" : "pb-3")
                    }
                  >
                    <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                      {g.proficiency.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-700">
                        {g.proficiency.statement}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {g.proficiency.annexe === "NONE"
                          ? `Platform ${g.proficiency.platform}`
                          : `Annexe ${g.proficiency.annexe}`}
                        {g.progress?.targetPart != null
                          ? ` · target Part ${g.progress.targetPart}`
                          : ""}
                      </span>
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
                  {skillId && (
                    <Link
                      to={`/skills/${skillId}`}
                      className="mb-3 ml-[3.75rem] flex w-fit items-center gap-1 text-xs font-medium text-emerald-700 transition hover:underline"
                    >
                      Practise the skill →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
