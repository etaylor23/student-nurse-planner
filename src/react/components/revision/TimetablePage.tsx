import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  REVISION_METHOD_LABEL,
  type RevisionMethod,
  type RevisionSession,
} from "../../../domain/types";
import { isoDate } from "../../../logic/calendar";
import { overlapsBusy, suggestStudySlots } from "../../../logic/revisionSchedule";
import { useRevision, useShifts } from "../../hooks";
import { useRevisionActions } from "../../useRevisionActions";
import { Panel, btnGhostSm, btnPrimary, inputCls } from "../ui";
import { MethodBadge } from "./shared";
import { SessionRunner } from "./SessionRunner";

const METHODS: RevisionMethod[] = ["POMODORO", "FIXED_BLOCK", "SPACED_REPETITION"];
const LENGTHS = [25, 45, 60];
const todayIso = () => isoDate(new Date());

/** "Mon 6 Jul · 20:00–21:00" from two epoch-ms bounds (local). */
function slotLabel(startMs: number, endMs: number): string {
  const d = new Date(startMs);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const t = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${t(startMs)}–${t(endMs)}`;
}

export function TimetablePage() {
  const { shifts } = useShifts();
  const { topics, subjects, sessions, reload } = useRevision();
  const { scheduleSession, deleteSession } = useRevisionActions();

  const [topicId, setTopicId] = useState("");
  const [method, setMethod] = useState<RevisionMethod>("POMODORO");
  const [lengthMins, setLengthMins] = useState(25);
  const [running, setRunning] = useState<RevisionSession | null>(null);

  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const topicTitle = (id?: string) =>
    id ? (topicById.get(id)?.title ?? "Topic") : "General study";

  const upcomingShiftCount = useMemo(
    () => shifts.filter((s) => s.startAt && new Date(s.startAt).getTime() >= Date.now()).length,
    [shifts],
  );

  // Suggested free slots around shifts AND already-scheduled sessions.
  const slots = useMemo(() => {
    const sessionBusy = sessions
      .filter((s) => !s.completed)
      .map(
        (s) =>
          [new Date(s.scheduledStart).getTime(), new Date(s.scheduledEnd).getTime()] as [
            number,
            number,
          ],
      );
    return suggestStudySlots(shifts, {
      fromIso: todayIso(),
      days: 7,
      durationMins: lengthMins,
      dayStartHour: 8,
      dayEndHour: 22,
      maxSlots: 6,
    }).filter((sl) => !overlapsBusy(sl.startMs, sl.endMs, sessionBusy));
  }, [shifts, sessions, lengthMins]);

  const upcoming = sessions.filter((s) => !s.completed);
  const completedCount = sessions.filter((s) => s.completed).length;

  const schedule = async (startMs: number, endMs: number) => {
    await scheduleSession({
      topicId: topicId || undefined,
      method,
      scheduledStart: new Date(startMs).toISOString(),
      scheduledEnd: new Date(endMs).toISOString(),
    });
    await reload();
  };

  const remove = async (id: string) => {
    await deleteSession(id);
    await reload();
  };

  return (
    <div className="space-y-4">
      {running ? (
        <SessionRunner
          sessionId={running.id}
          topic={running.topicId ? topicById.get(running.topicId) : undefined}
          method={running.method}
          onDone={async () => {
            setRunning(null);
            await reload();
          }}
          onCancel={() => setRunning(null)}
        />
      ) : (
        <Panel
          step="1"
          title="Plan around your shifts"
          hint="Suggested slots skip any time that clashes with a placement shift"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Topic</span>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className={inputCls}
              >
                <option value="">General study</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {subjectName.get(t.subjectId) ?? "Subject"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as RevisionMethod)}
                className={inputCls}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {REVISION_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Length</span>
              <select
                value={lengthMins}
                onChange={(e) => setLengthMins(Number(e.target.value))}
                className={inputCls}
              >
                {LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Free slots{" "}
            {upcomingShiftCount > 0 && (
              <span className="font-normal normal-case text-slate-400">
                · working around{" "}
                <Link to="/planner" className="text-emerald-700 hover:underline">
                  {upcomingShiftCount} upcoming shift{upcomingShiftCount === 1 ? "" : "s"}
                </Link>
              </span>
            )}
          </p>
          {slots.length === 0 ? (
            <p className="text-sm text-slate-400">
              No free {lengthMins}-min slots in study hours this week — try a shorter length.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {slots.map((sl) => (
                <li key={sl.startMs} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {slotLabel(sl.startMs, sl.endMs)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void schedule(sl.startMs, sl.endMs)}
                    className={btnGhostSm}
                  >
                    Schedule
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel
        title="Scheduled sessions"
        hint={completedCount > 0 ? `${completedCount} completed so far` : "Sessions you've planned"}
      >
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing scheduled yet — plan a slot above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {topicTitle(s.topicId)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {slotLabel(
                      new Date(s.scheduledStart).getTime(),
                      new Date(s.scheduledEnd).getTime(),
                    )}
                  </p>
                </div>
                <MethodBadge method={s.method} />
                <button
                  type="button"
                  onClick={() => setRunning(s)}
                  className={btnPrimary + " shrink-0 px-3 py-1.5"}
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => void remove(s.id)}
                  className="shrink-0 text-xs font-medium text-rose-600"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
