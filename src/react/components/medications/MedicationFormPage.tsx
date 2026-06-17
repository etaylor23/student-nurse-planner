import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ADMIN_ROUTES,
  BODY_SYSTEMS,
  CALC_TYPE_LABEL,
  DRUG_CLASSES,
  type CalcType,
  type Medication,
  type MedicationDraft,
} from "../../../domain/types";
import { randomCalcDrill } from "../../../logic/calcDrills";
import { useMedication } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
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
  const [keyNotes, setKeyNotes] = useState(medication?.keyNotes ?? "");
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
      keyNotes: keyNotes.trim() || undefined,
    };

    if (editing && medication) {
      await repo.updateMedication(medication.id, draft);
      navigate(`/medications/${medication.id}`);
      return;
    }

    const saved = await repo.createMedication({ ...draft, userId: user.id });
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
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g. Amoxicillin"
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
            <input
              type="text"
              list="drug-classes"
              value={drugClass}
              onChange={(e) => setDrugClass(e.target.value)}
              className={inputCls}
              placeholder="Optional — pick or type"
            />,
          )}
          {field(
            "Body system",
            <input
              type="text"
              list="body-systems"
              value={bodySystem}
              onChange={(e) => setBodySystem(e.target.value)}
              className={inputCls}
              placeholder="Optional — pick or type"
            />,
          )}
        </div>
        <datalist id="drug-classes">
          {DRUG_CLASSES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="body-systems">
          {BODY_SYSTEMS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

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
          "Key notes",
          <textarea
            value={keyNotes}
            onChange={(e) => setKeyNotes(e.target.value)}
            rows={4}
            className={inputCls}
            placeholder="BNF-style notes — mechanism, cautions, monitoring…"
          />,
        )}

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
