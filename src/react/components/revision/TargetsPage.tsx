import { useState } from "react";
import { REVISION_TARGET_TYPE_LABEL, type RevisionTargetType } from "../../../domain/types";
import { formatHumanDate, isoDate } from "../../../logic/calendar";
import { daysUntil } from "../../../logic/revision";
import { useRevision } from "../../hooks";
import { useRevisionActions } from "../../useRevisionActions";
import { Panel, btnPrimary, inputCls } from "../ui";
import { Countdown } from "./shared";

const TARGET_TYPES: RevisionTargetType[] = ["EXAM", "ASSIGNMENT", "OSCE"];
const todayIso = () => isoDate(new Date());

export function TargetsPage() {
  const { subjects, targets, reload } = useRevision();
  const { addTarget, deleteTarget } = useRevisionActions();
  const [type, setType] = useState<RevisionTargetType>("EXAM");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() === "" || !date) return;
    await addTarget({ type, title: title.trim(), date, subjectId: subjectId || undefined });
    setTitle("");
    setDate("");
    setSubjectId("");
    await reload();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this target?")) return;
    await deleteTarget(id);
    await reload();
  };

  return (
    <div className="space-y-4">
      <Panel
        step="1"
        title="Add a target"
        hint="Exam, assignment or OSCE — any combination, all optional"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as RevisionTargetType)}
                className={inputCls}
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REVISION_TARGET_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Pharmacology written exam"
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Subject (optional)
              </span>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className={inputCls}
              >
                <option value="">No subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className={btnPrimary}>
            Add target
          </button>
        </form>
      </Panel>

      <Panel title="Your targets" hint="Soonest first">
        {targets.length === 0 ? (
          <p className="text-sm text-slate-400">
            No targets yet — add an exam, assignment or OSCE to revise toward.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {targets.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="w-24 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-center text-[11px] font-medium text-slate-600">
                  {REVISION_TARGET_TYPE_LABEL[t.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {formatHumanDate(t.date)}
                    {t.subjectId ? ` · ${subjectName.get(t.subjectId) ?? "Subject"}` : ""}
                  </p>
                </div>
                <Countdown days={daysUntil(t.date, todayIso())} />
                <button
                  type="button"
                  onClick={() => void remove(t.id)}
                  aria-label={`Delete ${t.title}`}
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
