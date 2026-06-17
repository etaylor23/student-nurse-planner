import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CALC_TYPE_LABEL, type CalcType } from "../../../domain/types";
import { randomCalcDrill } from "../../../logic/calcDrills";
import { Panel, btnGhostSm, btnPrimary } from "../ui";

const CALC_TYPES = Object.keys(CALC_TYPE_LABEL) as CalcType[];
const SLUG_BY_TYPE: Record<CalcType, string> = {
  TABLET_DOSE: "tablet",
  LIQUID_DOSE: "liquid",
  IV_RATE: "iv-rate",
  WEIGHT_BASED: "weight",
};
const TYPE_BY_SLUG: Record<string, CalcType> = {
  tablet: "TABLET_DOSE",
  liquid: "LIQUID_DOSE",
  "iv-rate": "IV_RATE",
  weight: "WEIGHT_BASED",
};

export function CalcPracticePage() {
  const { type: slug } = useParams();
  const navigate = useNavigate();
  const calcType: CalcType = (slug && TYPE_BY_SLUG[slug]) || "TABLET_DOSE";

  const [drill, setDrill] = useState(() => randomCalcDrill(calcType));
  const [shown, setShown] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  // Fresh drill + reset when the calc type changes.
  useEffect(() => {
    setDrill(randomCalcDrill(calcType));
    setShown(false);
    setStats({ correct: 0, total: 0 });
  }, [calcType]);

  const setType = (t: CalcType) => navigate(`/medications/calc/${SLUG_BY_TYPE[t]}`);
  const next = () => {
    setDrill(randomCalcDrill(calcType));
    setShown(false);
  };
  const mark = (correct: boolean) => {
    setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    next();
  };

  return (
    <Panel
      title="Calc practice"
      hint="Illustrative numbers only — never real prescribing doses"
      action={
        stats.total > 0 ? (
          <span className="text-xs font-medium text-slate-400">
            {stats.correct}/{stats.total} correct
          </span>
        ) : undefined
      }
    >
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {CALC_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
              (t === calcType
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700")
            }
          >
            {CALC_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-base text-slate-800">{drill.prompt}</p>
        {shown ? (
          <div className="mt-4 space-y-3">
            <span className="inline-block rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
              {drill.answer}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => mark(true)} className={btnPrimary}>
                Got it
              </button>
              <button type="button" onClick={() => mark(false)} className={btnGhostSm}>
                Missed
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setShown(true)} className={btnPrimary}>
              Reveal answer
            </button>
            <button type="button" onClick={next} className={btnGhostSm}>
              Skip
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
