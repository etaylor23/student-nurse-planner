import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Proficiency } from "../../../domain/types";
import { useRepository } from "../../RepositoryContext";
import { Panel } from "../ui";

/**
 * Competency context for a medication: a study prompt that med administration is
 * Platform 4 (medicines management) territory, plus any proficiencies this med's
 * logs have been attached to as evidence. The two-way view of EvidenceLink on the
 * Medication Notes side. Additive, read-only.
 */
export function MedicationCompetency({ logIds }: { logIds: string[] }) {
  const { repo, user } = useRepository();
  const [profs, setProfs] = useState<Proficiency[]>([]);
  const key = logIds.join(",");

  useEffect(() => {
    let active = true;
    if (!user) return;
    void (async () => {
      const ids = new Set(logIds);
      const [links, all] = await Promise.all([
        repo.listEvidenceLinksForUser(user.id),
        repo.listProficiencies(),
      ]);
      const profIds = new Set(
        links
          .filter((l) => l.evidenceType === "MED_LOG" && ids.has(l.evidenceId))
          .map((l) => l.proficiencyId),
      );
      const matched = all.filter((p) => profIds.has(p.id));
      if (active) setProfs(matched);
    })();
    return () => {
      active = false;
    };
    // `key` re-runs when the set of logs changes.
  }, [repo, user, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Competency evidence" hint="How this feeds your NMC proficiencies">
      <p className="text-sm leading-relaxed text-slate-600">
        Observing and administering medicines is direct experience for{" "}
        <Link to="/competencies/platform/4" className="font-medium text-emerald-700">
          Platform 4 — medicines management
        </Link>
        , and drug calculations speak to numeracy competence. Attach a med log as evidence from a
        proficiency's page.
      </p>
      {profs.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            This medication's logs are evidence for
          </p>
          <ul className="space-y-1.5">
            {profs.map((p) => (
              <li key={p.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-10 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                  {p.code}
                </span>
                <Link
                  to={`/competencies/proficiency/${p.id}`}
                  className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700"
                >
                  {p.statement}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
