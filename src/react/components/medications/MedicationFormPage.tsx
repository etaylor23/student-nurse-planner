import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CALC_TYPE_LABEL,
  type CalcType,
  type Medication,
  type MedicationDraft,
} from "../../../domain/types";
import {
  ADMIN_ROUTES,
  BODY_SYSTEMS,
  DRUG_CLASSES,
  GENERIC_NAMES,
  MONITORING,
  SIDE_EFFECTS,
} from "../../../data/bnf";
import { randomCalcDrill } from "../../../logic/calcDrills";
import { useMedication } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { Autocomplete, TagInput } from "./Autocomplete";
import { Panel, btnGhost, btnPrimary, inputCls } from "../ui";

const CALC_TYPES = Object.keys(CALC_TYPE_LABEL) as CalcType[];

export function MedicationFormPage() {
  const { id } = useParams();
  const { medication } = useMedication(id);
  // Wait for the record before prefilling the edit form.
  if (id && !medication) {
    return (
      <Panel title="Edit medication">
        <p className="text-sm text-slate-400">Loading…</p>
      </Panel>
    );
  }
  return <MedicationForm key={id ?? "new"} medication={id ? medication : undefined} />;
}

function field(label: string, control: React.ReactNode, hint?: string) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {control}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function MedicationForm({ medication }: { medication?: Medication }) {
  const editing = !!medication;
  const { repo, user } = useRepository();
  const navigate = useNavigate();

  const [name, setName] = useState(medication?.name ?? "");
  const [brandNames, setBrandNames] = useState(medication?.brandNames ?? "");
  const [drugClass, setDrugClass] = useState(medication?.drugClass ?? "");
  const [bodySystem, setBodySystem] = useState(medication?.bodySystem ?? "");
  const [routes, setRoutes] = useState<string[]>(
    medication?.routes ? medication.routes.split(", ").filter(Boolean) : [],
  );
  const [mechanismOfAction, setMechanismOfAction] = useState(medication?.mechanismOfAction ?? "");
  const [sideEffects, setSideEffects] = useState(medication?.sideEffects ?? "");
  const [monitoring, setMonitoring] = useState(medication?.monitoring ?? "");
  const [keyNotes, setKeyNotes] = useState(medication?.keyNotes ?? "");
  const [highAlert, setHighAlert] = useState(medication?.highAlert ?? false);
  const [firstCondition, setFirstCondition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleRoute = (r: string) =>
    setRoutes((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (name.trim() === "") {
      setError("Give the medication a generic name.");
      return;
    }
    setSaving(true);
    const draft: MedicationDraft = {
      name: name.trim(),
      brandNames: brandNames.trim() || undefined,
      drugClass: drugClass.trim() || undefined,
      bodySystem: bodySystem.trim() || undefined,
      routes: routes.length ? routes.join(", ") : undefined,
      mechanismOfAction: mechanismOfAction.trim() || undefined,
      sideEffects: sideEffects.trim() || undefined,
      monitoring: monitoring.trim() || undefined,
      keyNotes: keyNotes.trim() || undefined,
      highAlert: highAlert || undefined,
    };

    if (editing && medication) {
      await repo.updateMedication(medication.id, draft);
      navigate(`/medications/${medication.id}`);
      return;
    }

    const saved = await repo.createMedication({ ...draft, userId: user.id });
    // Audit: surface the new med in the global Activity feed.
    await repo.createLogItem({
      userId: user.id,
      entityType: "MEDICATION",
      entityId: saved.id,
      entityLabel: saved.name,
      action: "MEDICATION_ADDED",
      summary: `Added ${saved.name} to your medications`,
    });
    if (firstCondition.trim()) await repo.addMedicationCondition(saved.id, firstCondition);
    // Adding a medication triggers a generic numeracy drill (illustrative numbers).
    const calcType = CALC_TYPES[Math.floor(Math.random() * CALC_TYPES.length)];
    const { prompt, answer } = randomCalcDrill(calcType);
    await repo.createCalcDrill({
      userId: user.id,
      medicationId: saved.id,
      calcType,
      prompt,
      answer,
    });
    navigate(`/medications/${saved.id}`);
  };

  return (
    <Panel
      title={editing ? "Edit medication" : "Add a medication"}
      hint="Optional fields are still worth a thought — class, system and condition build the links."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field(
            "Generic name",
            <Autocomplete
              value={name}
              onChange={setName}
              options={GENERIC_NAMES}
              ariaLabel="Generic name"
              placeholder="e.g. Amoxicillin — type to search"
            />,
          )}
          {field(
            "Brand name(s)",
            <input
              type="text"
              value={brandNames}
              onChange={(e) => setBrandNames(e.target.value)}
              className={inputCls}
              placeholder="Optional"
            />,
          )}
          {field(
            "Drug class",
            <Autocomplete
              value={drugClass}
              onChange={setDrugClass}
              options={DRUG_CLASSES}
              ariaLabel="Drug class"
              placeholder="Optional — type to search"
            />,
          )}
          {field(
            "Body system",
            <Autocomplete
              value={bodySystem}
              onChange={setBodySystem}
              options={BODY_SYSTEMS}
              ariaLabel="Body system"
              placeholder="Optional — type to search"
            />,
          )}
        </div>

        {field(
          "Routes",
          <div className="flex flex-wrap gap-1.5">
            {ADMIN_ROUTES.map((r) => {
              const on = routes.includes(r);
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => toggleRoute(r)}
                  className={
                    "rounded-full px-3 py-1 text-sm font-medium transition " +
                    (on
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                  }
                >
                  {r}
                </button>
              );
            })}
          </div>,
        )}

        {field(
          "Mechanism of action",
          <textarea
            value={mechanismOfAction}
            onChange={(e) => setMechanismOfAction(e.target.value)}
            rows={2}
            className={inputCls}
            placeholder="How it works — e.g. inhibits bacterial cell-wall synthesis"
          />,
        )}

        {field(
          "Side effects",
          <TagInput
            value={sideEffects}
            onChange={setSideEffects}
            options={SIDE_EFFECTS}
            ariaLabel="Side effects"
            placeholder="Type to search — e.g. Vom… → Vomiting"
          />,
          "Type-ahead suggestions from a stubbed BNF list; add your own too.",
        )}

        {field(
          "Monitoring",
          <TagInput
            value={monitoring}
            onChange={setMonitoring}
            options={MONITORING}
            ariaLabel="Monitoring"
            placeholder="Type to search — e.g. U&E, INR, blood glucose"
          />,
        )}

        {field(
          "Key notes",
          <textarea
            value={keyNotes}
            onChange={(e) => setKeyNotes(e.target.value)}
            rows={4}
            className={inputCls}
            placeholder="Anything else worth remembering — cautions, interactions, exam tips…"
          />,
        )}

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <input
            type="checkbox"
            checked={highAlert}
            onChange={(e) => setHighAlert(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500/30"
          />
          <span className="text-sm">
            <span className="font-medium text-slate-700">High-alert medication</span>
            <span className="mt-0.5 block text-xs text-slate-400">
              Flags drugs that carry a heightened risk of harm if used in error (e.g. insulin,
              anticoagulants, opioids) — a study-awareness marker, not clinical advice.
            </span>
          </span>
        </label>

        {!editing &&
          field(
            "First condition",
            <input
              type="text"
              value={firstCondition}
              onChange={(e) => setFirstCondition(e.target.value)}
              className={inputCls}
              placeholder="What was it used for? (optional — add more later)"
            />,
            "You can append more conditions over time as you meet the drug again.",
          )}

        {error && (
          <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {editing ? "Save changes" : "Add medication"}
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(editing && medication ? `/medications/${medication.id}` : "/medications")
            }
            className={btnGhost}
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}
