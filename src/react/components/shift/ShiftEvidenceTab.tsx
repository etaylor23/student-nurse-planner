import { useMemo, useState } from "react";
import type { Proficiency, Shift } from "../../../domain/types";
import { suggestProficienciesForShift } from "../../../logic/evidenceSuggestions";
import { useMedicationLogs, useProficiencies } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { ShiftEvidence } from "../ShiftEvidence";
import { CaptureConfirmation, useCaptureFlash } from "./shared";

/**
 * The Competency evidence capture tab: the gaps this shift could plausibly
 * evidence (the suggestions that used to live in the post-shift debrief) with
 * one-tap Attach, above the full `ShiftEvidence` link/unlink list. Attaching a
 * suggestion re-derives the gaps and refreshes the list — all in the modal.
 */
export function ShiftEvidenceTab({ shift }: { shift: Shift }) {
  const { repo, user } = useRepository();
  const { proficiencies, progress, evidenceLinks, reload: reloadProfs } = useProficiencies();
  const { logs } = useMedicationLogs();
  const { message, flash } = useCaptureFlash();
  // Bumped to remount ShiftEvidence after a suggested attach (it fetches its own
  // list keyed on shift.updatedAt, which a link doesn't bump).
  const [evidenceKey, setEvidenceKey] = useState(0);

  const suggested = useMemo(
    () =>
      suggestProficienciesForShift(shift, {
        proficiencies,
        progress,
        links: evidenceLinks,
        medLogs: logs,
      }),
    [shift, proficiencies, progress, evidenceLinks, logs],
  );

  const attachSuggested = async (p: Proficiency) => {
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
    await reloadProfs();
    setEvidenceKey((k) => k + 1);
    flash(`Linked this shift to ${p.code}`);
  };

  return (
    <div>
      <CaptureConfirmation message={message} />

      {suggested.length > 0 && (
        <div className="mb-4 rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-100">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Gaps this shift could evidence
          </p>
          <ul className="space-y-1.5">
            {suggested.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                  {p.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {p.statement}
                </span>
                <button
                  type="button"
                  onClick={() => void attachSuggested(p)}
                  className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-600 hover:text-white"
                >
                  Attach
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ShiftEvidence key={evidenceKey} shift={shift} flush onChange={() => void reloadProfs()} />
    </div>
  );
}
