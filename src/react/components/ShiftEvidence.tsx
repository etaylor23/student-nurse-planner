import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Proficiency, Shift } from "../../domain/types";
import { useRepository } from "../RepositoryContext";

/**
 * The proficiencies a completed shift has been attached to as evidence — the
 * two-way view of the competency tracker's EvidenceLink. Shown in the shift editor
 * so placement experience visibly feeds the PAD. Additive, read-only.
 */
export function ShiftEvidence({ shift }: { shift: Shift }) {
  const { repo, user } = useRepository();
  const [profs, setProfs] = useState<Proficiency[]>([]);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void (async () => {
      const [links, all] = await Promise.all([
        repo.listEvidenceLinksForUser(user.id),
        repo.listProficiencies(),
      ]);
      const ids = new Set(
        links
          .filter((l) => l.evidenceType === "SHIFT" && l.evidenceId === shift.id)
          .map((l) => l.proficiencyId),
      );
      const matched = all.filter((p) => ids.has(p.id));
      if (active) setProfs(matched);
    })();
    return () => {
      active = false;
    };
  }, [repo, user, shift.id, shift.updatedAt]);

  // Only surface once this shift is actually used as evidence.
  if (profs.length === 0) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Evidence for {profs.length} {profs.length === 1 ? "proficiency" : "proficiencies"}
      </p>
      <ul className="space-y-2">
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
  );
}
