import { Link } from "react-router-dom";
import {
  evidenceCountByProficiency,
  statusOf,
  progressByProficiency,
} from "../../../logic/proficiencies";
import { sentenceCase } from "../../../logic/text";
import { useProficiencies } from "../../hooks";
import { Panel } from "../ui";
import { StatusPill } from "./shared";

/**
 * "Ready to take to your assessor" (ethos D8): the honest bridge between evidence
 * gathered and official achievement. Lists proficiencies you've gathered evidence
 * for but haven't yet marked signed off in your PAD — the concrete pile to walk
 * into your next assessor conversation with. Each row opens the proficiency, where
 * the sign-off is recorded. Momentum-framed: this is a to-do of wins, not a deficit.
 */
export function ReadyToSignOffPage() {
  const { proficiencies, progress, evidenceLinks } = useProficiencies();

  const byProf = progressByProficiency(progress);
  const evidenceCount = evidenceCountByProficiency(evidenceLinks);

  const ready = proficiencies
    .filter((p) => (evidenceCount.get(p.id) ?? 0) > 0 && !byProf.get(p.id)?.padSignedOff)
    .sort(
      (a, b) =>
        (evidenceCount.get(b.id) ?? 0) - (evidenceCount.get(a.id) ?? 0) ||
        a.orderIndex - b.orderIndex,
    );

  const signedOff = progress.filter((p) => p.padSignedOff).length;

  return (
    <Panel
      title="Ready to take to your assessor"
      hint={
        ready.length === 0
          ? "Gather evidence on a proficiency and it'll appear here"
          : `${ready.length} with evidence, not yet signed off`
      }
    >
      {ready.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            {signedOff > 0
              ? `Nothing waiting — you've signed off ${signedOff} in your PAD. 🎉`
              : "Nothing here yet."}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            As you attach evidence to a proficiency, it shows up here as ready to walk into your
            next assessor conversation with.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            You've built evidence for these — take them to your assessor, then mark each one signed
            off in your PAD.
          </p>
          <ul className="divide-y divide-slate-100">
            {ready.map((p) => {
              const count = evidenceCount.get(p.id) ?? 0;
              return (
                <li key={p.id}>
                  <Link
                    to={`/competencies/proficiency/${p.id}`}
                    className="group flex items-start gap-3 py-2.5 transition hover:bg-slate-50"
                  >
                    <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                      {p.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm text-slate-700">
                        {sentenceCase(p.statement)}
                      </span>
                      <span className="mt-0.5 block text-xs text-emerald-700">
                        {count} {count === 1 ? "piece" : "pieces"} of evidence →
                      </span>
                    </span>
                    <StatusPill status={statusOf(p.id, byProf)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
