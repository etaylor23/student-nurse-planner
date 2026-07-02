import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Proficiency, Shift } from "../../domain/types";
import { suggestProficienciesForShift } from "../../logic/evidenceSuggestions";
import { useMedicationLogs, useProficiencies, useShifts } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { ShiftEvidence } from "./ShiftEvidence";
import { Panel, btnGhost } from "./ui";

/**
 * The post-shift debrief (U1): shown the moment a shift is marked worked — the
 * highest-frequency, highest-emotion moment, and the natural phone moment. Turns a
 * silent lock into "what did this shift give you?": a live progress line and three
 * one-tap capture prompts that feed the other screens. Dismissing never blocks the
 * lock (completion already happened + is logged). Reads as a full-width card so it
 * works one-thumb at 375px.
 */
export function ShiftDebrief({ shift, onDismiss }: { shift: Shift; onDismiss: () => void }) {
  const { summary, projection } = useShifts();
  const { repo, user } = useRepository();
  const { proficiencies, progress, evidenceLinks, reload: reloadProfs } = useProficiencies();
  const { logs } = useMedicationLogs();
  const navigate = useNavigate();

  const [attaching, setAttaching] = useState(false);
  const [evidenceKey, setEvidenceKey] = useState(0); // remount ShiftEvidence after a seeded attach

  const pct = Math.round(summary.progressFraction * 100);
  const toGo = projection.shiftsToGo;

  // The gaps this shift could plausibly evidence (U4, inverted). Recomputes as links
  // reload, so an attached one drops off.
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
  };

  const promptCls =
    "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800";

  return (
    <Panel title="Shift logged ✓" hint="Capture it while it's fresh — the day's still in your head">
      <p className="text-sm text-slate-600">
        That's <strong className="text-slate-800">{summary.practiceHours} h</strong> of{" "}
        {summary.targetHours.toLocaleString()} ({pct}%)
        {toGo != null ? ` — about ${toGo} more shift${toGo === 1 ? "" : "s"} to go` : ""}.
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        What did this shift give you?
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => navigate("/medications/log", { state: { prefillShiftId: shift.id } })}
          className={promptCls}
        >
          Log a medication you saw
        </button>
        <button
          type="button"
          onClick={() => navigate("/skills", { state: { prefillShiftId: shift.id } })}
          className={promptCls}
        >
          Update a skill you practised
        </button>
        <button
          type="button"
          onClick={() => setAttaching((v) => !v)}
          aria-expanded={attaching}
          className={promptCls + (attaching ? " border-emerald-300 bg-emerald-50/50" : "")}
        >
          Attach this shift as evidence
        </button>
      </div>

      {attaching && (
        <div className="mt-3">
          {suggested.length > 0 && (
            <div className="mb-3 rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-100">
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
          <ShiftEvidence key={evidenceKey} shift={shift} />
        </div>
      )}

      <button type="button" onClick={onDismiss} className={btnGhost + " mt-4"}>
        Done for today
      </button>
    </Panel>
  );
}
