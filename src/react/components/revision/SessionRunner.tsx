import { useEffect, useRef, useState } from "react";
import type { RevisionMethod, RevisionTopic } from "../../../domain/types";
import { isoDate } from "../../../logic/calendar";
import { useRevisionActions } from "../../useRevisionActions";
import { btnGhost, btnPrimary } from "../ui";
import { ConfidenceRating } from "./shared";

const POMODORO_MINS = 25;
const todayIso = () => isoDate(new Date());

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * A Pomodoro study runner (the spec's session runner). A 25-minute countdown you can
 * pause; when it finishes — or you finish early — it captures a confidence rating (for a
 * topic) and records a completed `RevisionSession`, rescheduling the topic via spaced
 * repetition. Works for a topic studied now, or a pre-scheduled session (`sessionId`).
 */
export function SessionRunner({
  topic,
  sessionId,
  method = "POMODORO",
  onDone,
  onCancel,
}: {
  topic?: RevisionTopic;
  sessionId?: string;
  method?: RevisionMethod;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { logStudy } = useRevisionActions();
  const [remaining, setRemaining] = useState(POMODORO_MINS * 60);
  const [running, setRunning] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [confidence, setConfidence] = useState<number | undefined>(topic?.confidence);
  const [saving, setSaving] = useState(false);
  const startMs = useRef(Date.now());

  // Countdown: re-arm a 1s timeout each tick; stop (and prompt to log) at zero.
  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) {
      setRunning(false);
      setFinishing(true);
      return;
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [running, remaining]);

  const save = async () => {
    setSaving(true);
    await logStudy({
      topic,
      sessionId,
      method,
      startMs: startMs.current,
      endMs: Date.now(),
      pomodoroCount: 1,
      confidenceAfter: topic ? confidence : undefined,
      todayIso: todayIso(),
    });
    onDone();
  };

  return (
    <div className="rounded-xl bg-slate-900 p-5 text-center text-white">
      {topic && <p className="mb-1 text-sm text-slate-300">Studying: {topic.title}</p>}
      {!finishing ? (
        <>
          <div className="text-5xl font-semibold tabular-nums tracking-tight">
            {mmss(remaining)}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              {running ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRunning(false);
                setFinishing(true);
              }}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              Finish now
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-sm">
          <p className="text-lg font-semibold">Session done 🎉</p>
          {topic ? (
            <>
              <p className="mt-1 text-sm text-slate-300">
                How confident do you feel on this topic now?
              </p>
              <div className="mt-3 flex justify-center">
                <ConfidenceRating value={confidence} onChange={setConfidence} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-300">Nice work — logged to your activity.</p>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              disabled={saving || (!!topic && confidence == null)}
              onClick={() => void save()}
              className={btnPrimary + " disabled:opacity-50"}
            >
              {topic ? "Save & reschedule" : "Log session"}
            </button>
            <button type="button" onClick={onCancel} className={btnGhost}>
              Discard
            </button>
          </div>
          {topic && confidence == null && (
            <p className="mt-2 text-xs text-slate-400">Pick a confidence to save.</p>
          )}
        </div>
      )}
    </div>
  );
}
