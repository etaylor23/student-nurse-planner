import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CALC_TYPE_LABEL, MED_LOG_TYPE_LABEL, type CalcType } from "../../../domain/types";
import { nowIso } from "../../../domain/ids";
import { formatHumanDate } from "../../../logic/calendar";
import { randomCalcDrill } from "../../../logic/calcDrills";
import { buildMedFilterPath, EMPTY_FILTERS } from "../../../logic/medicationFilters";
import { useMedication } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { MedicationCompetency } from "./MedicationCompetency";
import { Panel, btnGhost, btnGhostSm, btnPrimary, inputCls } from "../ui";

const CALC_TYPES = Object.keys(CALC_TYPE_LABEL) as CalcType[];
const chip = "rounded-full px-2 py-0.5 text-xs font-medium";

export function MedicationDetailPage() {
  const { id } = useParams();
  const { medication, conditions, drills, logs, reload } = useMedication(id);
  const { repo, user } = useRepository();
  const navigate = useNavigate();

  const [newCondition, setNewCondition] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  if (!medication) {
    return (
      <Panel title="Medication">
        <p className="text-sm text-slate-500">
          This medication couldn't be found.{" "}
          <Link to="/medications" className="font-medium text-emerald-600">
            Back to all medications
          </Link>
        </p>
      </Panel>
    );
  }

  const addCondition = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = newCondition.trim();
    if (!value) return;
    await repo.addMedicationCondition(medication.id, value);
    setNewCondition("");
    await reload();
  };

  const removeCondition = async (condId: string) => {
    await repo.removeMedicationCondition(condId);
    await reload();
  };

  const newDrill = async () => {
    if (!user) return;
    const calcType = CALC_TYPES[Math.floor(Math.random() * CALC_TYPES.length)];
    const { prompt, answer } = randomCalcDrill(calcType);
    await repo.createCalcDrill({
      userId: user.id,
      medicationId: medication.id,
      calcType,
      prompt,
      answer,
    });
    await reload();
  };

  const markDrill = async (drillId: string, correct: boolean) => {
    await repo.updateCalcDrill(drillId, { lastAttempted: nowIso(), lastCorrect: correct });
    await reload();
  };

  const reveal = (drillId: string) => setRevealed((prev) => new Set(prev).add(drillId));

  const removeMed = async () => {
    if (!window.confirm(`Delete ${medication.name}? This removes its conditions and drills.`))
      return;
    await repo.deleteMedication(medication.id);
    if (user) {
      await repo.createLogItem({
        userId: user.id,
        entityType: "MEDICATION",
        entityId: medication.id,
        entityLabel: medication.name,
        action: "MEDICATION_DELETED",
        summary: `Deleted ${medication.name} from your medications`,
      });
    }
    navigate("/medications");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/medications" className="text-xs font-medium text-emerald-600">
            ← All medications
          </Link>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            {medication.name}
          </h2>
          {medication.brandNames && (
            <p className="text-sm text-slate-400">{medication.brandNames}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {medication.highAlert && (
              <span
                className={`${chip} bg-rose-50 text-rose-700 ring-1 ring-rose-100`}
                title="High-alert medication — heightened risk of harm if used in error"
              >
                ⚠ High alert
              </span>
            )}
            {medication.drugClass && (
              <Link
                to={buildMedFilterPath({ ...EMPTY_FILTERS, drugClass: medication.drugClass })}
                title={`See all ${medication.drugClass}`}
                className={`${chip} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition hover:ring-emerald-300`}
              >
                {medication.drugClass}
              </Link>
            )}
            {medication.bodySystem && (
              <Link
                to={buildMedFilterPath({ ...EMPTY_FILTERS, bodySystem: medication.bodySystem })}
                title={`See all ${medication.bodySystem}`}
                className={`${chip} bg-slate-100 text-slate-600 transition hover:bg-slate-200`}
              >
                {medication.bodySystem}
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/medications/${medication.id}/edit`} className={btnGhostSm}>
            Edit
          </Link>
          <button type="button" onClick={removeMed} className="text-xs font-medium text-rose-600">
            Delete
          </button>
        </div>
      </div>

      <Panel title="Key notes" hint="Study notes — never real patient dosing">
        {medication.keyNotes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {medication.keyNotes}
          </p>
        ) : (
          <p className="text-sm text-slate-400">No notes yet — add some via Edit.</p>
        )}
        {medication.routes && (
          <p className="mt-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">Routes:</span> {medication.routes}
          </p>
        )}
      </Panel>

      <Panel
        title="Conditions"
        hint="Append a condition each time you meet this drug — it builds the link"
      >
        {conditions.length > 0 ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {conditions.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
              >
                {c.condition}
                <button
                  type="button"
                  onClick={() => void removeCondition(c.id)}
                  aria-label={`Remove ${c.condition}`}
                  className="text-slate-400 transition hover:text-rose-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-400">No conditions recorded yet.</p>
        )}
        <form onSubmit={addCondition} className="flex gap-2">
          <input
            type="text"
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            placeholder="Add a condition…"
            className={`${inputCls} max-w-xs`}
          />
          <button type="submit" className={btnGhost}>
            Add
          </button>
        </form>
      </Panel>

      <Panel
        title="Logged"
        hint="Times you've met this drug on placement"
        action={
          <button
            type="button"
            onClick={() =>
              navigate("/medications/log", { state: { prefillMedicationId: medication.id } })
            }
            className={btnGhostSm}
          >
            Log again
          </button>
        }
      >
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400">
            Not logged yet — use <span className="font-medium text-slate-500">Log again</span> the
            next time you observe or administer it.
          </p>
        ) : (
          <>
            <div className="mb-4 flex gap-2 text-sm">
              <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700 ring-1 ring-sky-100">
                {logs.filter((l) => l.type === "OBSERVED").length} observed
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-100">
                {logs.filter((l) => l.type === "ADMINISTERED").length} administered
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {logs.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="text-slate-700">{MED_LOG_TYPE_LABEL[l.type]}</span>
                  <span className="text-xs text-slate-400">
                    {formatHumanDate(l.date)}
                    {l.route ? ` · ${l.route}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {logs.length > 5 && (
              <p className="mt-2 text-xs text-slate-400">+{logs.length - 5} more in the med log</p>
            )}
          </>
        )}
      </Panel>

      <MedicationCompetency logIds={logs.map((l) => l.id)} />

      <Panel
        title="Numeracy"
        hint="Illustrative numbers only — practice, not real doses"
        action={
          <button type="button" onClick={() => void newDrill()} className={btnGhostSm}>
            New drill
          </button>
        }
      >
        {drills.length === 0 ? (
          <p className="text-sm text-slate-400">No practice drills yet.</p>
        ) : (
          <ul className="space-y-3">
            {drills.map((d) => {
              const shown = revealed.has(d.id);
              return (
                <li
                  key={d.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`${chip} bg-slate-100 text-slate-600`}>
                      {CALC_TYPE_LABEL[d.calcType]}
                    </span>
                    {d.lastAttempted && (
                      <span
                        className={
                          "text-xs font-medium " +
                          (d.lastCorrect ? "text-emerald-600" : "text-rose-600")
                        }
                      >
                        {d.lastCorrect ? "Last: correct" : "Last: missed"}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{d.prompt}</p>
                  {shown ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
                        {d.answer}
                      </span>
                      <button
                        type="button"
                        onClick={() => void markDrill(d.id, true)}
                        className={btnGhostSm}
                      >
                        Got it
                      </button>
                      <button
                        type="button"
                        onClick={() => void markDrill(d.id, false)}
                        className={btnGhostSm}
                      >
                        Missed
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => reveal(d.id)}
                      className={`${btnPrimary} mt-3`}
                    >
                      Reveal answer
                    </button>
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
