import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MED_LOG_TYPE_LABEL,
  type EvidenceLink,
  type MedicationLog,
  type Proficiency,
} from "../../../domain/types";
import { formatHumanDate } from "../../../logic/calendar";
import { useRepository } from "../../RepositoryContext";
import { ProficiencyPicker } from "../competencies/ProficiencyPicker";
import { Panel } from "../ui";

/**
 * Competency context for a medication: a study prompt that med administration is
 * Platform 4 (medicines management) territory, the proficiencies this med's logs
 * already evidence, and a control to attach a log as evidence. The two-way view of
 * EvidenceLink on the Medication Notes side.
 */
export function MedicationCompetency({ logs }: { logs: MedicationLog[] }) {
  const { repo, user } = useRepository();
  const [profs, setProfs] = useState<Proficiency[]>([]);
  const [links, setLinks] = useState<EvidenceLink[]>([]);
  const [pickingForLog, setPickingForLog] = useState<string | null>(null);
  const logIds = logs.map((l) => l.id);
  const key = logIds.join(",");

  const reload = useCallback(async () => {
    if (!user) return;
    const ids = new Set(logIds);
    const [allLinks, all] = await Promise.all([
      repo.listEvidenceLinksForUser(user.id),
      repo.listProficiencies(),
    ]);
    const medLogLinks = allLinks.filter(
      (l) => l.evidenceType === "MED_LOG" && ids.has(l.evidenceId),
    );
    const profIds = new Set(medLogLinks.map((l) => l.proficiencyId));
    setLinks(medLogLinks);
    setProfs(all.filter((p) => profIds.has(p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, user, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const linkLogToProficiency = async (logId: string, p: Proficiency) => {
    if (!user) return;
    await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: p.id,
      evidenceType: "MED_LOG",
      evidenceId: logId,
    });
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: p.id,
      entityLabel: p.code,
      action: "EVIDENCE_LINKED",
      summary: `Linked a medication log as evidence for ${p.code}`,
    });
    setPickingForLog(null);
    await reload();
  };

  return (
    <Panel title="Competency evidence" hint="How this feeds your NMC proficiencies">
      <p className="text-sm leading-relaxed text-slate-600">
        Observing and administering medicines is direct experience for{" "}
        <Link to="/competencies/platform/4" className="font-medium text-emerald-700">
          Platform 4 — medicines management
        </Link>
        , and drug calculations speak to numeracy competence.
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

      {logs.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Use a log as evidence
          </p>
          <ul className="space-y-1.5">
            {logs.map((l) => {
              const alreadyLinked = new Set(
                links.filter((k) => k.evidenceId === l.id).map((k) => k.proficiencyId),
              );
              return (
                <li key={l.id}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-600">
                      {MED_LOG_TYPE_LABEL[l.type]} · {formatHumanDate(l.date)}
                    </span>
                    {pickingForLog === l.id ? null : (
                      <button
                        type="button"
                        onClick={() => setPickingForLog(l.id)}
                        className="shrink-0 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        + Link
                      </button>
                    )}
                  </div>
                  {pickingForLog === l.id && (
                    <ProficiencyPicker
                      excludeIds={alreadyLinked}
                      onPick={(p) => void linkLogToProficiency(l.id, p)}
                      onClose={() => setPickingForLog(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
