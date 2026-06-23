import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EvidenceLink, Proficiency, Shift } from "../../domain/types";
import { useRepository } from "../RepositoryContext";
import { ProficiencyPicker } from "./competencies/ProficiencyPicker";

interface Row {
  link: EvidenceLink;
  proficiency: Proficiency;
}

/**
 * The proficiencies a shift is attached to as evidence — the two-way view of the
 * competency tracker's EvidenceLink, shown in the shift editor. You can link this
 * shift to a proficiency and unlink it here, so placement experience feeds the PAD
 * from where you log it.
 */
export function ShiftEvidence({ shift }: { shift: Shift }) {
  const { repo, user } = useRepository();
  const [rows, setRows] = useState<Row[]>([]);
  const [picking, setPicking] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    const [links, all] = await Promise.all([
      repo.listEvidenceLinksForUser(user.id),
      repo.listProficiencies(),
    ]);
    const byId = new Map(all.map((p) => [p.id, p]));
    const matched: Row[] = links
      .filter((l) => l.evidenceType === "SHIFT" && l.evidenceId === shift.id)
      .map((link) => {
        const proficiency = byId.get(link.proficiencyId);
        return proficiency ? { link, proficiency } : null;
      })
      .filter((r): r is Row => r !== null);
    setRows(matched);
  }, [repo, user, shift.id]);

  useEffect(() => {
    void reload();
  }, [reload, shift.updatedAt]);

  const linkProficiency = async (p: Proficiency) => {
    if (!user) return;
    await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: p.id,
      evidenceType: "SHIFT",
      evidenceId: shift.id,
    });
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: p.id,
      entityLabel: p.code,
      action: "EVIDENCE_LINKED",
      summary: `Linked a placement shift as evidence for ${p.code}`,
    });
    setPicking(false);
    await reload();
  };

  const unlink = async (row: Row) => {
    if (!user) return;
    await repo.deleteEvidenceLink(row.link.id);
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: row.proficiency.id,
      entityLabel: row.proficiency.code,
      action: "EVIDENCE_UNLINKED",
      summary: `Removed a placement shift from ${row.proficiency.code}`,
    });
    await reload();
  };

  const linkedIds = new Set(rows.map((r) => r.proficiency.id));

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Competency evidence
          {rows.length > 0 ? ` · ${rows.length}` : ""}
        </p>
        {!picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
          >
            + Link a proficiency
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">
          Not linked to a proficiency yet — link this shift as evidence.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.link.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 w-10 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                {r.proficiency.code}
              </span>
              <Link
                to={`/competencies/proficiency/${r.proficiency.id}`}
                className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700"
              >
                {r.proficiency.statement}
              </Link>
              <button
                type="button"
                onClick={() => void unlink(r)}
                aria-label={`Unlink ${r.proficiency.code}`}
                className="shrink-0 text-xs font-medium text-rose-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {picking && (
        <ProficiencyPicker
          excludeIds={linkedIds}
          onPick={(p) => void linkProficiency(p)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
