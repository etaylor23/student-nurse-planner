import { useMemo, useState } from "react";
import type { RevisionTopic } from "../../../domain/types";
import { formatHumanDate, isoDate } from "../../../logic/calendar";
import { useRevision } from "../../hooks";
import { useRevisionActions } from "../../useRevisionActions";
import { Panel, btnGhostSm, btnPrimary, inputCls } from "../ui";
import { ConfidenceRating } from "./shared";

const todayIso = () => isoDate(new Date());

export function SubjectsPage() {
  const { subjects, topics, reload } = useRevision();
  const { addTopic, deleteTopic, reviewTopic, addSubject } = useRevisionActions();
  const [newSubject, setNewSubject] = useState("");

  const topicsBySubject = useMemo(() => {
    const map = new Map<string, RevisionTopic[]>();
    for (const t of topics) {
      const arr = map.get(t.subjectId) ?? [];
      arr.push(t);
      map.set(t.subjectId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.title.localeCompare(b.title));
    return map;
  }, [topics]);

  const handleAddSubject = async () => {
    if (newSubject.trim() === "") return;
    await addSubject(newSubject.trim());
    setNewSubject("");
    await reload();
  };

  const handleRate = async (topic: RevisionTopic, c: number) => {
    await reviewTopic(topic, c, todayIso());
    await reload();
  };

  const handleDelete = async (topic: RevisionTopic) => {
    if (!window.confirm(`Delete the topic “${topic.title}”?`)) return;
    await deleteTopic(topic.id);
    await reload();
  };

  return (
    <div className="space-y-4">
      <Panel title="Add a subject" hint="Baseline subjects are provided — add your own too">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddSubject();
              }
            }}
            placeholder="e.g. Leadership & management"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => void handleAddSubject()}
            className={btnPrimary + " shrink-0"}
          >
            Add subject
          </button>
        </div>
      </Panel>

      {subjects.map((s) => (
        <Panel
          key={s.id}
          title={s.name}
          hint={`${topicsBySubject.get(s.id)?.length ?? 0} topic${
            (topicsBySubject.get(s.id)?.length ?? 0) === 1 ? "" : "s"
          }`}
        >
          <ul className="divide-y divide-slate-100">
            {(topicsBySubject.get(s.id) ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{t.title}</span>
                <ConfidenceRating value={t.confidence} onChange={(c) => void handleRate(t, c)} />
                <span className="w-28 shrink-0 text-right text-xs text-slate-400">
                  {t.nextDue ? `due ${formatHumanDate(t.nextDue)}` : "not reviewed"}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(t)}
                  aria-label={`Delete ${t.title}`}
                  className="shrink-0 text-xs font-medium text-rose-600"
                >
                  Delete
                </button>
              </li>
            ))}
            {(topicsBySubject.get(s.id)?.length ?? 0) === 0 && (
              <li className="py-2 text-sm text-slate-400">No topics yet.</li>
            )}
          </ul>
          <AddTopicRow onAdd={(title) => handleAddTopic(s.id, title)} />
        </Panel>
      ))}
    </div>
  );

  async function handleAddTopic(subjectId: string, title: string) {
    await addTopic(subjectId, title);
    await reload();
  }
}

/** A per-subject inline "add topic" input with its own state. */
function AddTopicRow({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const submit = async () => {
    if (title.trim() === "") return;
    await onAdd(title.trim());
    setTitle("");
  };
  return (
    <div className="mt-3 flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Add a topic to revise…"
        className={inputCls + " py-2"}
      />
      <button type="button" onClick={() => void submit()} className={btnGhostSm + " shrink-0"}>
        Add
      </button>
    </div>
  );
}
