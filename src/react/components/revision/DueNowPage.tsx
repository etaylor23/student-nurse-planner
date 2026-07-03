import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CALC_TYPE_LABEL, type RevisionTopic } from "../../../domain/types";
import { isoDate } from "../../../logic/calendar";
import { summariseCalcStats } from "../../../logic/calcStats";
import { resurfaceTopics } from "../../../logic/revision";
import { useCalcStats, useRevision } from "../../hooks";
import { useRevisionActions } from "../../useRevisionActions";
import { Panel, btnGhostSm, btnPrimary } from "../ui";
import { ConfidenceRating } from "./shared";
import { SessionRunner } from "./SessionRunner";

const todayIso = () => isoDate(new Date());

export function DueNowPage() {
  const { subjects, topics, reload } = useRevision();
  const { stats } = useCalcStats();
  const { reviewTopic } = useRevisionActions();
  const [studying, setStudying] = useState<RevisionTopic | null>(null);

  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const due = useMemo(() => resurfaceTopics(topics, todayIso()), [topics]);
  const calc = useMemo(() => summariseCalcStats(stats), [stats]);

  const handleRate = async (topic: RevisionTopic, c: number) => {
    await reviewTopic(topic, c, todayIso());
    await reload();
  };

  return (
    <div className="space-y-4">
      <NumeracyCard calc={calc} />

      {studying ? (
        <SessionRunner
          topic={studying}
          onDone={async () => {
            setStudying(null);
            await reload();
          }}
          onCancel={() => setStudying(null)}
        />
      ) : (
        <Panel
          title="Due now"
          hint="Weakest topics resurface first (low confidence, or past their review date)"
        >
          {topics.length === 0 ? (
            <p className="text-sm text-slate-400">
              No topics yet — add some in{" "}
              <Link
                to="/revision/subjects"
                className="font-medium text-emerald-700 hover:underline"
              >
                Subjects
              </Link>{" "}
              and rate your confidence to start spaced repetition.
            </p>
          ) : due.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nothing due right now — you're on top of it. Next reviews are scheduled in{" "}
              <Link
                to="/revision/subjects"
                className="font-medium text-emerald-700 hover:underline"
              >
                Subjects
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {due.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-400">
                      {subjectName.get(t.subjectId) ?? "Subject"}
                    </p>
                  </div>
                  <ConfidenceRating value={t.confidence} onChange={(c) => void handleRate(t, c)} />
                  <button
                    type="button"
                    onClick={() => setStudying(t)}
                    className={btnGhostSm + " shrink-0"}
                  >
                    Study
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

/**
 * Numeracy weak-area card — reads the shared `CalcStat` aggregate (not a parallel store)
 * and links to the medication calc-practice screen. The Revision timetable's numeracy
 * subject and the med-notes drills are the same skill; this is the bridge.
 */
function NumeracyCard({ calc }: { calc: ReturnType<typeof summariseCalcStats> }) {
  const pct = Math.round(calc.total.accuracy * 100);
  const weakestHref = calc.weakest ? `/medications/calc/${calc.weakest}` : "/medications/calc";
  return (
    <Panel title="Numeracy" hint="Drug calculations — your practice accuracy">
      {calc.total.attempts === 0 ? (
        <p className="text-sm text-slate-500">
          No numeracy practice logged yet.{" "}
          <Link to="/medications/calc" className="font-medium text-emerald-700 hover:underline">
            Start drug-calc practice →
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-800">{pct}%</strong> across {calc.total.attempts} attempt
            {calc.total.attempts === 1 ? "" : "s"}
            {calc.weakest && (
              <>
                {" "}
                · weakest:{" "}
                <span className="font-medium text-slate-700">{CALC_TYPE_LABEL[calc.weakest]}</span>
              </>
            )}
            .
          </p>
          <Link to={weakestHref} className={btnPrimary + " shrink-0"}>
            {calc.weakest ? `Practise ${CALC_TYPE_LABEL[calc.weakest]} →` : "Practise numeracy →"}
          </Link>
        </div>
      )}
    </Panel>
  );
}
