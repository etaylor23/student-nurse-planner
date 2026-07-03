import {
  REVISION_METHOD_LABEL,
  REVISION_TARGET_TYPE_LABEL,
  type RevisionMethod,
  type RevisionTargetDraft,
  type RevisionTopic,
} from "../domain/types";
import { clampConfidence, nextDueFrom } from "../logic/revision";
import { useRepository } from "./RepositoryContext";

/** Truncate a label for the activity feed. */
function short(text: string): string {
  const t = text.trim() || "Untitled";
  return t.length > 48 ? t.slice(0, 47).trimEnd() + "…" : t;
}

/**
 * The single mutation point for revision — every change goes through here and appends
 * the matching `LogItem` (house rule: log at the action layer, never the repository).
 * Progress-worthy actions are logged (topic added, reviewed, session completed, target
 * added); pure edits/deletes stay out of the feed to keep it focused. Callers reload.
 */
export function useRevisionActions() {
  const { repo, user } = useRepository();

  const log = async (id: string, action: string, summary: string, label: string) => {
    if (!user) return;
    await repo.createLogItem({
      userId: user.id,
      entityType: "REVISION",
      entityId: id,
      entityLabel: label,
      action,
      summary,
    });
  };

  const addSubject = async (name: string) => {
    if (!user) return;
    return repo.addSubject(user.id, name);
  };

  const addTarget = async (input: RevisionTargetDraft) => {
    if (!user) return;
    const target = await repo.createRevisionTarget({ userId: user.id, ...input });
    await log(
      target.id,
      "REVISION_TARGET_ADDED",
      `Added a ${REVISION_TARGET_TYPE_LABEL[target.type].toLowerCase()} target — “${target.title}”`,
      short(target.title),
    );
    return target;
  };

  const deleteTarget = async (id: string) => {
    await repo.deleteRevisionTarget(id);
  };

  const addTopic = async (subjectId: string, title: string) => {
    if (!user) return;
    const topic = await repo.createRevisionTopic({
      userId: user.id,
      subjectId,
      title,
      confidence: 1,
    });
    await log(
      topic.id,
      "REVISION_TOPIC_ADDED",
      `Added a revision topic — “${topic.title}”`,
      short(topic.title),
    );
    return topic;
  };

  const deleteTopic = async (id: string) => {
    await repo.deleteRevisionTopic(id);
  };

  /** Quick confidence rating — sets confidence + reschedules next-due. */
  const reviewTopic = async (topic: RevisionTopic, confidence: number, todayIso: string) => {
    const c = clampConfidence(confidence);
    const updated = await repo.updateRevisionTopic(topic.id, {
      confidence: c,
      lastReviewed: todayIso,
      nextDue: nextDueFrom(c, todayIso),
    });
    await log(
      topic.id,
      "REVISION_REVIEWED",
      `Reviewed “${topic.title}” — confidence ${c}/5`,
      short(topic.title),
    );
    return updated;
  };

  /** Plan a session (Timetable) — not logged until it's completed. */
  const scheduleSession = async (input: {
    topicId?: string;
    method: RevisionMethod;
    scheduledStart: string;
    scheduledEnd: string;
  }) => {
    if (!user) return;
    return repo.createRevisionSession({ userId: user.id, completed: false, ...input });
  };

  const deleteSession = async (id: string) => {
    await repo.deleteRevisionSession(id);
  };

  /**
   * Record a completed study session (from the Pomodoro runner). Creates the session
   * if it wasn't pre-scheduled, marks it complete, and — when a topic + confidence are
   * given — reschedules that topic (spaced repetition). One `LogItem` for the feed.
   */
  const logStudy = async (opts: {
    topic?: RevisionTopic;
    sessionId?: string;
    method: RevisionMethod;
    startMs: number;
    endMs: number;
    pomodoroCount?: number;
    confidenceAfter?: number;
    todayIso: string;
  }) => {
    if (!user) return;
    let sessionId = opts.sessionId;
    if (sessionId) {
      await repo.updateRevisionSession(sessionId, {
        completed: true,
        pomodoroCount: opts.pomodoroCount,
        confidenceAfter: opts.confidenceAfter,
      });
    } else {
      const created = await repo.createRevisionSession({
        userId: user.id,
        topicId: opts.topic?.id,
        method: opts.method,
        scheduledStart: new Date(opts.startMs).toISOString(),
        scheduledEnd: new Date(opts.endMs).toISOString(),
        completed: true,
        pomodoroCount: opts.pomodoroCount,
        confidenceAfter: opts.confidenceAfter,
      });
      sessionId = created.id;
    }
    if (opts.topic && opts.confidenceAfter != null) {
      const c = clampConfidence(opts.confidenceAfter);
      await repo.updateRevisionTopic(opts.topic.id, {
        confidence: c,
        lastReviewed: opts.todayIso,
        nextDue: nextDueFrom(c, opts.todayIso),
      });
    }
    const label = opts.topic ? opts.topic.title : REVISION_METHOD_LABEL[opts.method];
    await log(
      sessionId,
      "REVISION_SESSION_COMPLETED",
      `Completed a ${REVISION_METHOD_LABEL[opts.method].toLowerCase()} session${opts.topic ? ` on “${opts.topic.title}”` : ""}`,
      short(label),
    );
  };

  return {
    addSubject,
    addTarget,
    deleteTarget,
    addTopic,
    deleteTopic,
    reviewTopic,
    scheduleSession,
    deleteSession,
    logStudy,
  };
}
