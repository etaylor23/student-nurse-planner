import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "../src/data/dexie/dexieRepository";
import { PlannerDb } from "../src/data/dexie/db";
import { seedSubjects } from "../src/data/seed/subjects";

function freshRepo() {
  return new DexieRepository(new PlannerDb("test-" + Math.random().toString(36).slice(2)));
}

describe("DexieRepository — revision", () => {
  let repo: DexieRepository;
  beforeEach(() => {
    repo = freshRepo();
  });

  it("seeds the baseline subjects once, as built-ins", async () => {
    const user = await repo.getCurrentUser();
    const subjects = await repo.listSubjects(user.id);
    expect(subjects.length).toBe(seedSubjects.length);
    expect(subjects.every((s) => s.userId === null)).toBe(true);
    expect(subjects.map((s) => s.name)).toContain("Numeracy");
    // Sorted by name.
    expect([...subjects].sort((a, b) => a.name.localeCompare(b.name)).map((s) => s.id)).toEqual(
      subjects.map((s) => s.id),
    );
  });

  it("adds a custom subject alongside the baseline", async () => {
    const user = await repo.getCurrentUser();
    const before = (await repo.listSubjects(user.id)).length;
    const custom = await repo.addSubject(user.id, "Leadership");
    expect(custom.userId).toBe(user.id);
    const after = await repo.listSubjects(user.id);
    expect(after.length).toBe(before + 1);
    expect(after.some((s) => s.id === custom.id)).toBe(true);
  });

  it("creates, lists (soonest-first) and deletes revision targets", async () => {
    const user = await repo.getCurrentUser();
    await repo.createRevisionTarget({ userId: user.id, type: "EXAM", title: "Pharmacology exam", date: "2026-08-01" }); // prettier-ignore
    const osce = await repo.createRevisionTarget({ userId: user.id, type: "OSCE", title: "OSCE", date: "2026-07-15" }); // prettier-ignore
    const targets = await repo.listRevisionTargets(user.id);
    expect(targets.map((t) => t.date)).toEqual(["2026-07-15", "2026-08-01"]); // soonest first
    await repo.deleteRevisionTarget(osce.id);
    expect((await repo.listRevisionTargets(user.id)).length).toBe(1);
  });

  it("creates and updates topics (confidence + schedule)", async () => {
    const user = await repo.getCurrentUser();
    const topic = await repo.createRevisionTopic({
      userId: user.id,
      subjectId: "subject_pharmacology",
      title: "Beta blockers",
      confidence: 2,
    });
    expect(topic.confidence).toBe(2);
    const updated = await repo.updateRevisionTopic(topic.id, {
      confidence: 4,
      lastReviewed: "2026-07-03",
      nextDue: "2026-07-10",
    });
    expect(updated.confidence).toBe(4);
    expect(updated.nextDue).toBe("2026-07-10");
    expect((await repo.listRevisionTopics(user.id)).length).toBe(1);
  });

  it("cascades a topic's sessions when the topic is deleted", async () => {
    const user = await repo.getCurrentUser();
    const topic = await repo.createRevisionTopic({
      userId: user.id,
      subjectId: "subject_numeracy",
      title: "Infusion rates",
      confidence: 1,
    });
    await repo.createRevisionSession({
      userId: user.id,
      topicId: topic.id,
      method: "POMODORO",
      scheduledStart: "2026-07-04T09:00:00.000Z",
      scheduledEnd: "2026-07-04T09:25:00.000Z",
      completed: false,
    });
    // An unrelated general session (no topic) must survive.
    await repo.createRevisionSession({
      userId: user.id,
      method: "FIXED_BLOCK",
      scheduledStart: "2026-07-05T09:00:00.000Z",
      scheduledEnd: "2026-07-05T10:00:00.000Z",
      completed: false,
    });

    expect((await repo.listRevisionSessions(user.id)).length).toBe(2);
    await repo.deleteRevisionTopic(topic.id);
    const remaining = await repo.listRevisionSessions(user.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].topicId).toBeUndefined();
  });

  it("updates a session on completion (confidence + pomodoro count)", async () => {
    const user = await repo.getCurrentUser();
    const session = await repo.createRevisionSession({
      userId: user.id,
      method: "POMODORO",
      scheduledStart: "2026-07-04T09:00:00.000Z",
      scheduledEnd: "2026-07-04T09:25:00.000Z",
      completed: false,
    });
    const done = await repo.updateRevisionSession(session.id, {
      completed: true,
      pomodoroCount: 1,
      confidenceAfter: 4,
    });
    expect(done.completed).toBe(true);
    expect(done.pomodoroCount).toBe(1);
    expect(done.confidenceAfter).toBe(4);
  });
});
