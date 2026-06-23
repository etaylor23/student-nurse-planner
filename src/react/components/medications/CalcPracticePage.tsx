import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CALC_TYPE_LABEL, type CalcType } from "../../../domain/types";
import { randomCalcDrill } from "../../../logic/calcDrills";
import { summariseCalcStats, type CalcStatsSummary } from "../../../logic/calcStats";
import { useCalcStats } from "../../hooks";
import { useRepository } from "../../RepositoryContext";
import { Panel, btnGhostSm, btnPrimary } from "../ui";

const CALC_TYPES = Object.keys(CALC_TYPE_LABEL) as CalcType[];
const SLUG_BY_TYPE: Record<CalcType, string> = {
  TABLET_DOSE: "tablet",
  LIQUID_DOSE: "liquid",
  IV_RATE: "iv-rate",
  WEIGHT_BASED: "weight",
  INFUSION_DROPS: "drops",
  UNIT_CONVERSION: "units",
};
const TYPE_BY_SLUG: Record<string, CalcType> = {
  tablet: "TABLET_DOSE",
  liquid: "LIQUID_DOSE",
  "iv-rate": "IV_RATE",
  weight: "WEIGHT_BASED",
  drops: "INFUSION_DROPS",
  units: "UNIT_CONVERSION",
};

const EXAM_SIZE = 10;
const PASS_PCT = 80;
const pct = (n: number) => Math.round(n * 100);
const randomType = () => CALC_TYPES[Math.floor(Math.random() * CALC_TYPES.length)];

const segBtn = (on: boolean) =>
  "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
  (on ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700");

export function CalcPracticePage() {
  const { type: slug } = useParams();
  const navigate = useNavigate();
  const calcType: CalcType = (slug && TYPE_BY_SLUG[slug]) || "TABLET_DOSE";

  const { repo, user } = useRepository();
  const { stats, reload: reloadStats } = useCalcStats();
  const summary = summariseCalcStats(stats);

  const [mode, setMode] = useState<"practice" | "exam">("practice");
  const [examRun, setExamRun] = useState(0);

  // Fire-and-forget: persist the attempt, then refresh the stats panel.
  const record = (t: CalcType, correct: boolean) => {
    if (!user) return;
    void repo.recordCalcAttempt(user.id, t, correct).then(() => reloadStats());
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Calc practice"
        hint="Illustrative numbers only — never real prescribing doses"
        action={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setMode("practice")}
              className={segBtn(mode === "practice")}
            >
              Practice
            </button>
            <button
              type="button"
              onClick={() => {
                setExamRun((r) => r + 1);
                setMode("exam");
              }}
              className={segBtn(mode === "exam")}
            >
              Exam
            </button>
          </div>
        }
      >
        {mode === "practice" ? (
          <PracticeCard
            calcType={calcType}
            onSetType={(t) => navigate(`/medications/calc/${SLUG_BY_TYPE[t]}`)}
            onRecord={record}
          />
        ) : (
          <CalcExam
            key={examRun}
            onRecord={record}
            onRestart={() => setExamRun((r) => r + 1)}
            onExit={() => setMode("practice")}
          />
        )}
      </Panel>

      <p className="px-1 text-xs text-slate-400">
        Accurate drug calculations are NMC competence —{" "}
        <Link to="/competencies/proficiency/prof_4.14" className="font-medium text-emerald-700">
          proficiency 4.14
        </Link>{" "}
        and{" "}
        <Link to="/competencies/proficiency/prof_B11.4" className="font-medium text-emerald-700">
          Annexe B11.4
        </Link>
        . Your accuracy shows on those proficiencies.
      </p>

      {summary.total.attempts > 0 && <StatsPanel summary={summary} />}
    </div>
  );
}

function PracticeCard({
  calcType,
  onSetType,
  onRecord,
}: {
  calcType: CalcType;
  onSetType: (t: CalcType) => void;
  onRecord: (t: CalcType, correct: boolean) => void;
}) {
  const [drill, setDrill] = useState(() => randomCalcDrill(calcType));
  const [shown, setShown] = useState(false);
  const [session, setSession] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setDrill(randomCalcDrill(calcType));
    setShown(false);
    setSession({ correct: 0, total: 0 });
  }, [calcType]);

  const next = () => {
    setDrill(randomCalcDrill(calcType));
    setShown(false);
  };
  const mark = (correct: boolean) => {
    onRecord(calcType, correct);
    setSession((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    next();
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {CALC_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSetType(t)}
            className={segBtn(t === calcType)}
          >
            {CALC_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {session.total > 0 && (
        <p className="mb-3 text-xs font-medium text-slate-400">
          This session: {session.correct}/{session.total} correct
        </p>
      )}

      <DrillCard drill={drill} shown={shown}>
        {shown ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => mark(true)} className={btnPrimary}>
              Got it
            </button>
            <button type="button" onClick={() => mark(false)} className={btnGhostSm}>
              Missed
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setShown(true)} className={btnPrimary}>
              Reveal answer
            </button>
            <button type="button" onClick={next} className={btnGhostSm}>
              Skip
            </button>
          </div>
        )}
      </DrillCard>
    </>
  );
}

function CalcExam({
  onRecord,
  onRestart,
  onExit,
}: {
  onRecord: (t: CalcType, correct: boolean) => void;
  onRestart: () => void;
  onExit: () => void;
}) {
  const [questions] = useState(() =>
    Array.from({ length: EXAM_SIZE }, () => {
      const type = randomType();
      return { type, ...randomCalcDrill(type) };
    }),
  );
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [score, setScore] = useState(0);
  const [startMs] = useState(() => Date.now());
  const [doneMs, setDoneMs] = useState<number | null>(null);

  if (doneMs !== null) {
    const percent = pct(score / EXAM_SIZE);
    const pass = percent >= PASS_PCT;
    const secs = Math.round((doneMs - startMs) / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-400">Exam complete · {time}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          {score}/{EXAM_SIZE}
        </p>
        <span
          className={
            "mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium " +
            (pass
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-100")
          }
        >
          {percent}% · {pass ? "Pass" : `Below ${PASS_PCT}% pass mark`}
        </span>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={onRestart} className={btnPrimary}>
            Try another exam
          </button>
          <button type="button" onClick={onExit} className={btnGhostSm}>
            Back to practice
          </button>
        </div>
      </div>
    );
  }

  const cur = questions[i];
  const answer = (correct: boolean) => {
    onRecord(cur.type, correct);
    setScore((s) => s + (correct ? 1 : 0));
    if (i + 1 >= EXAM_SIZE) setDoneMs(Date.now());
    else {
      setI(i + 1);
      setShown(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
          Question {i + 1} of {EXAM_SIZE}
        </p>
        <span className="text-xs font-medium text-slate-400">{CALC_TYPE_LABEL[cur.type]}</span>
      </div>
      <DrillCard drill={cur} shown={shown}>
        {shown ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => answer(true)} className={btnPrimary}>
              I got it right
            </button>
            <button type="button" onClick={() => answer(false)} className={btnGhostSm}>
              I got it wrong
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShown(true)} className={btnPrimary}>
            Reveal answer
          </button>
        )}
      </DrillCard>
      <button type="button" onClick={onExit} className="text-xs font-medium text-slate-400">
        Exit exam
      </button>
    </div>
  );
}

/** The shared prompt → reveal (answer + worked steps) card used by both modes. */
function DrillCard({
  drill,
  shown,
  children,
}: {
  drill: { prompt: string; answer: string; working: string };
  shown: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-base text-slate-800">{drill.prompt}</p>
      {shown ? (
        <div className="mt-4 space-y-3">
          <span className="inline-block rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
            {drill.answer}
          </span>
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-600">Working:</span> {drill.working}
          </p>
          {children}
        </div>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </div>
  );
}

function StatsPanel({ summary }: { summary: CalcStatsSummary }) {
  const rows = summary.perType
    .filter((s) => s.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy);
  const barColour = (a: number) =>
    a >= 0.8 ? "bg-emerald-500" : a >= 0.5 ? "bg-amber-500" : "bg-rose-500";

  return (
    <Panel
      title="Your numeracy"
      hint={`${pct(summary.total.accuracy)}% across ${summary.total.attempts} attempt${summary.total.attempts === 1 ? "" : "s"}`}
    >
      {summary.weakest && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
          Weakest area: <span className="font-semibold">{CALC_TYPE_LABEL[summary.weakest]}</span> —
          worth a few more reps.
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((s) => (
          <li key={s.calcType}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                {CALC_TYPE_LABEL[s.calcType]}
                {s.calcType === summary.weakest && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Practise this
                  </span>
                )}
              </span>
              <span className="text-slate-400">
                {s.correct}/{s.attempts} · {pct(s.accuracy)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${barColour(s.accuracy)}`}
                style={{ width: `${pct(s.accuracy)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
