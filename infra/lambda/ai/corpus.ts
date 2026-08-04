import type { Repository } from "../../../src/data/repository";
import { seedProficiencies } from "../../../src/data/seed/proficiencies";

/**
 * Context-stuffed corpus assembly (spec-ai-recall.md D3/D4): every note-bearing entity
 * the student owns, formatted as labelled blocks the model can quote BY REFERENCE
 * (`<note ref="TYPE:id"/>`), chronological oldest-first.
 *
 * Included: Shift.notes · Reflection + ReflectionSections (incl. LOCKED — D5) + tags ·
 * MedicationLog.notes · ProficiencyStatusEvent.note (PAD sign-off notes, surfaced under
 * the parent proficiency so the ref is navigable) · kept DIAGRAM NoteBlocks (P43 — a
 * drawing kept with its page never becomes a domain row, so this is its only route into
 * recall; filed blocks are NOT read here because their text already arrives through the
 * row filing created, and reading both would double-count the same words).
 *
 * HARD-EXCLUDED (D4): SelfCareCheckin — never read here. The exclusion is structural:
 * this module simply has no code path that touches self-care data; a unit test asserts
 * the repository's self-care reads are never called (Phase 2).
 *
 * No notes fields exist on Medication or SkillProgress (checked 2026-07-26), so those
 * entities contribute nothing yet; med logs are labelled with their medication name.
 */

const MAX_CORPUS_CHARS = 600_000; // ~150k tokens — D3 revisit threshold, truncate oldest

interface Block {
  date: string; // ISO sort key
  text: string;
}

export interface CorpusResult {
  text: string;
  blocks: number;
  truncated: boolean;
}

export async function assembleCorpus(repo: Repository, userId: string): Promise<CorpusResult> {
  const [
    shifts,
    reflections,
    sections,
    tags,
    reflectionTags,
    medLogs,
    medications,
    profProgress,
    noteBlocks,
  ] = await Promise.all([
    repo.listShifts(userId),
    repo.listReflections(userId),
    repo.listReflectionSectionsForUser(userId),
    repo.listTags(userId),
    repo.listReflectionTags(userId),
    repo.listMedicationLogs(userId),
    repo.listMedications(userId),
    repo.listProficiencyProgress(userId),
    repo.listNoteBlocks(userId),
  ]);
  // The proficiency master list is global seed data (DynamoRepository.listProficiencies
  // is a Phase-2 stub) — imported statically, same rows every client seeds.
  const proficiencies = seedProficiencies;

  const blocks: Block[] = [];

  for (const s of shifts) {
    if (!s.notes?.trim()) continue;
    blocks.push({
      date: s.date,
      text: `[SHIFT:${s.id} · ${s.date} · ${s.shiftType} shift]\n${s.notes.trim()}`,
    });
  }

  const sectionsByReflection = new Map<string, typeof sections>();
  for (const sec of sections) {
    const list = sectionsByReflection.get(sec.reflectionId) ?? [];
    list.push(sec);
    sectionsByReflection.set(sec.reflectionId, list);
  }
  const tagLabel = new Map(tags.map((t) => [t.id, t.label]));
  const tagsByReflection = new Map<string, string[]>();
  for (const rt of reflectionTags) {
    const labels = tagsByReflection.get(rt.reflectionId) ?? [];
    const label = tagLabel.get(rt.tagId);
    if (label) labels.push(label);
    tagsByReflection.set(rt.reflectionId, labels);
  }
  for (const r of reflections) {
    const secs = sectionsByReflection.get(r.id) ?? [];
    const content = secs
      .map((sec) => (sec.content.trim() ? `${sec.stage}: ${sec.content.trim()}` : ""))
      .filter(Boolean)
      .join("\n");
    if (!content) continue;
    const labels = tagsByReflection.get(r.id) ?? [];
    const tagSuffix = labels.length ? ` · tags: ${labels.join(", ")}` : "";
    const date = r.occurredOn ?? r.createdAt.slice(0, 10);
    blocks.push({
      date,
      text: `[REFLECTION:${r.id} · ${date} · "${r.title}"${tagSuffix}]\n${content}`,
    });
  }

  const medName = new Map(medications.map((m) => [m.id, m.name]));
  for (const log of medLogs) {
    if (!log.notes?.trim()) continue;
    const name = (log.medicationId && medName.get(log.medicationId)) || "unlinked medication";
    blocks.push({
      date: log.date,
      text: `[MED_LOG:${log.id} · ${log.date} · ${log.type} · ${name}]\n${log.notes.trim()}`,
    });
  }

  // Kept diagrams only (P43). `KEPT` is the filter that matters: PENDING blocks are
  // undecided, filed blocks arrive via their created row, dismissed ones were declined.
  for (const b of noteBlocks) {
    if (b.status !== "KEPT" || !b.text.trim()) continue;
    const date = b.createdAt.slice(0, 10);
    blocks.push({
      date,
      text: `[DIAGRAM:${b.id} · ${date} · a drawing kept with a photographed page of notes]\n${b.text.trim()}`,
    });
  }

  const profById = new Map(proficiencies.map((p) => [p.id, p]));
  const eventLists = await Promise.all(
    profProgress.map((pp) => repo.listProficiencyStatusEvents(pp.id)),
  );
  profProgress.forEach((pp, i) => {
    const prof = profById.get(pp.proficiencyId);
    if (!prof) return;
    for (const ev of eventLists[i]) {
      if (!ev.note?.trim()) continue;
      const date = ev.createdAt.slice(0, 10);
      blocks.push({
        date,
        text: `[PROFICIENCY:${prof.id} · ${date} · ${prof.code} "${prof.statement.slice(0, 80)}"]\n${ev.note.trim()}`,
      });
    }
  });

  blocks.sort((a, b) => a.date.localeCompare(b.date));

  let truncated = false;
  let text = blocks.map((b) => b.text).join("\n\n");
  while (text.length > MAX_CORPUS_CHARS && blocks.length > 1) {
    truncated = true;
    blocks.shift(); // drop oldest first
    text = blocks.map((b) => b.text).join("\n\n");
  }
  if (truncated) console.warn(`corpus truncated for user (kept ${blocks.length} blocks)`);

  return { text, blocks: blocks.length, truncated };
}
