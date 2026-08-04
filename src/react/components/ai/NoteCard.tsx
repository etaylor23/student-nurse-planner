import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useRepository } from "../../RepositoryContext";
import { SHIFT_TYPE_LABEL } from "../../../domain/types";

/**
 * Renders the student's own note, **read from the local database by id** — never from the
 * model's output (spec-ai-recall.md D3/D17). This is what makes "word for word" a
 * structural guarantee rather than a behaviour we hope for: the model only ever supplies
 * a `TYPE:id` pointer, so it cannot misquote a note it never renders.
 *
 * An id that doesn't resolve renders nothing at all (fail closed) — a hallucinated or
 * stale ref degrades to silence instead of showing invented text.
 */

interface Resolved {
  heading: string;
  body: string;
  /** Absent for entities with no in-app route yet (a kept DIAGRAM) — the card still quotes. */
  to?: string;
  cta?: string;
}

export function NoteCard({ type, id }: { type: string; id: string }) {
  const { repo, userId } = useRepository();
  const [note, setNote] = useState<Resolved | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Unreadable or unknown ref → render nothing (fail closed).
      const resolved = await resolveNote(repo, userId, type, id).catch(() => null);
      if (!cancelled) {
        setNote(resolved);
        setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, userId, type, id]);

  if (!checked) {
    return <div className="my-2 h-20 animate-pulse rounded-2xl bg-slate-100" aria-hidden="true" />;
  }
  if (!note) return null;

  return (
    <div className="my-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
        From your notes
      </p>
      <p className="mt-1 text-xs font-medium text-slate-400">{note.heading}</p>
      <p className="mt-2 whitespace-pre-wrap border-l-2 border-primary-200 pl-3 text-sm text-slate-700">
        {note.body}
      </p>
      {note.to && (
        <Link
          to={note.to}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
        >
          {note.cta}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function resolveNote(
  repo: ReturnType<typeof useRepository>["repo"],
  userId: string,
  type: string,
  id: string,
): Promise<Resolved | null> {
  switch (type) {
    case "SHIFT": {
      const shift = await repo.getShift(id);
      if (!shift?.notes?.trim()) return null;
      return {
        heading: `${SHIFT_TYPE_LABEL[shift.shiftType] ?? shift.shiftType} shift · ${formatDate(shift.date)}`,
        body: shift.notes.trim(),
        to: `/planner/${shift.id}`,
        cta: "Open this shift",
      };
    }
    case "REFLECTION": {
      const reflection = await repo.getReflection(id);
      if (!reflection) return null;
      const sections = await repo.listReflectionSections(id);
      const body = sections
        .filter((s) => s.content.trim())
        .map((s) => `${s.stage}: ${s.content.trim()}`)
        .join("\n\n");
      if (!body) return null;
      return {
        heading: `Reflection · ${formatDate(reflection.occurredOn ?? reflection.createdAt)} · ${reflection.title}`,
        body,
        to: `/reflection/${reflection.id}`,
        cta: "Open this reflection",
      };
    }
    case "MED_LOG": {
      const logs = await repo.listMedicationLogs(userId);
      const log = logs.find((l) => l.id === id);
      if (!log?.notes?.trim()) return null;
      let name = "Medication log";
      if (log.medicationId) {
        const med = await repo.getMedication(log.medicationId).catch(() => undefined);
        if (med) name = med.name;
      }
      return {
        heading: `${name} · ${log.type === "ADMINISTERED" ? "Administered" : "Observed"} · ${formatDate(log.date)}`,
        body: log.notes.trim(),
        to: "/medications/log",
        cta: "Open your medication log",
      };
    }
    case "PROFICIENCY": {
      const prof = await repo.getProficiency(id);
      if (!prof) return null;
      const progress = await repo.getProficiencyProgress(userId, id).catch(() => undefined);
      if (!progress) return null;
      const events = await repo.listProficiencyStatusEvents(progress.id).catch(() => []);
      const body = events
        .filter((e) => e.note?.trim())
        .map((e) => `${formatDate(e.createdAt)}: ${e.note!.trim()}`)
        .join("\n\n");
      if (!body) return null;
      return {
        heading: `Proficiency ${prof.code} · ${prof.statement.slice(0, 70)}${prof.statement.length > 70 ? "…" : ""}`,
        body,
        to: `/competencies/proficiency/${prof.id}`,
        cta: "Open this proficiency",
      };
    }
    case "DIAGRAM": {
      // A kept drawing (P43). There is no captures browser yet, so the card quotes the
      // transcription without a link — the words are the useful part.
      const block = (await repo.listNoteBlocks(userId)).find((b) => b.id === id);
      if (!block || block.status !== "KEPT" || !block.text.trim()) return null;
      return {
        heading: `Drawing · ${formatDate(block.createdAt)} · kept with a photographed page`,
        body: block.text.trim(),
      };
    }
    default:
      return null; // unknown type — fail closed
  }
}
