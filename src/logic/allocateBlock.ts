import type { Repository } from "../data/repository";
import { GIBBS_STAGES } from "../domain/types";
import type {
  GibbsStage,
  NoteBlock,
  NoteBlockTarget,
  ReflectionSectionInput,
  Shift,
} from "../domain/types";

/**
 * Allocate a `NoteBlock` into the student's real records (spec-note-capture.md P4).
 *
 * Allocating creates the GENUINE domain row — a real `Reflection` with its Gibbs sections, a
 * real `MedicationLog`, a real `ProficiencyStatusEvent` — so a captured note is
 * indistinguishable from a typed one everywhere in the app. That is why P4 chose
 * materialisation over a parallel notes system: no read path in the app needs to know this
 * feature exists.
 *
 * Three invariants hold here:
 *
 *  - **Idempotent on `block.status`.** A block already `ALLOCATED` is a no-op. Without this a
 *    retry (a flaky connection, a double tap) duplicates a row or double-appends to a shift.
 *  - **Provenance both ways.** The created row carries `sourceType`/`sourceId` pointing at the
 *    block (P5); the block records `targetType`/`targetId`. That is what makes the evidence
 *    chain — domain row → NoteBlock → NoteCapture → S3 — traversable in either direction.
 *  - **`shiftId` is inherited** from the block, falling back to the capture (P6).
 *
 * `SHIFT_NOTES` is the odd one out and deliberately so (P7): it appends to a string on a row
 * that already exists, so it cannot carry `sourceType`/`sourceId`. `appendedText` is recorded
 * verbatim instead, which is the only thing that makes un-allocation possible (P19).
 */

export interface AllocateInput {
  block: NoteBlock;
  /** Overrides the block's own target, e.g. after the student retypes it in review. */
  targetType?: NoteBlockTarget;
  /** Which proficiency the student confirmed, when filing as evidence. */
  proficiencyId?: string;
  /** A `Medication.id` the student linked the block to (P33). Absent files the log unlinked,
   *  which is the correct outcome when they declined the offer to create a card. */
  medicationId?: string;
  /** Tags the student kept (P37) — applied to a Reflection only. */
  tags?: string[];
  /** Gibbs content from the classifier (P30), stage → text. */
  gibbs?: Partial<Record<GibbsStage, string>>;
  shiftFallbackId?: string;
  /** The resolved shift, so a log's date matches its shift rather than today. */
  shiftFallbackShift?: Shift;
}

export interface AllocateResult {
  block: NoteBlock;
  /** What was created, for the "filed as…" confirmation. */
  created: { kind: NoteBlockTarget; id?: string; label: string };
}

export class AllocateError extends Error {
  constructor(
    readonly code: "no_target" | "no_proficiency" | "no_shift" | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "AllocateError";
  }
}

/** A title for a reflection made from a block — first sentence, or first ~60 chars. */
export function titleFrom(text: string): string {
  const firstSentence = text.split(/[.\n]/)[0]?.trim() ?? "";
  const base = firstSentence.length >= 8 ? firstSentence : text.trim();
  return base.length > 60 ? `${base.slice(0, 57).trimEnd()}…` : base || "Captured note";
}

/** Gibbs stages the classifier actually filled, in the cycle's order. Empty stages are omitted
 *  rather than invented — a reflection with a blank ANALYSIS is honest; a fabricated one isn't. */
export function gibbsSections(
  gibbs: Partial<Record<GibbsStage, string>> | undefined,
  fallbackText: string,
): ReflectionSectionInput[] {
  const filled = GIBBS_STAGES.filter((s) => (gibbs?.[s] ?? "").trim().length > 0).map((stage) => ({
    stage,
    content: (gibbs?.[stage] ?? "").trim(),
  }));
  // No usable split: put the whole note in DESCRIPTION so nothing is lost, and let the student
  // move it. Better a reflection with one filled stage than a reflection with none.
  return filled.length > 0 ? filled : [{ stage: "DESCRIPTION", content: fallbackText }];
}

export async function allocateBlock(
  repo: Repository,
  userId: string,
  input: AllocateInput,
): Promise<AllocateResult> {
  const { block } = input;

  // Idempotency guard — the thing that stops a retry duplicating a row (P4).
  if (block.status === "ALLOCATED") {
    return {
      block,
      created: {
        kind: (block.targetType ?? "SHIFT_NOTES") as NoteBlockTarget,
        id: block.targetId,
        label: "Already filed",
      },
    };
  }

  const target = input.targetType ?? block.targetType;
  if (!target) throw new AllocateError("no_target", "Choose where this should be filed.");

  const shiftId = block.shiftId ?? input.shiftFallbackId;
  const text = block.text.trim();

  switch (target) {
    case "REFLECTION": {
      const reflection = await repo.createReflection(
        {
          userId,
          title: titleFrom(text),
          model: "GIBBS", // the only model there is, so nothing to ask the student
          shiftId,
          isLocked: false,
          // Inherited from the capture's acknowledgement (P2) — the student already confirmed
          // it before the camera opened, so we don't ask twice.
          piiAcknowledged: true,
          sourceType: "NOTE_BLOCK",
          sourceId: block.id,
        },
        gibbsSections(input.gibbs, text),
      );
      if (input.tags?.length) await repo.setReflectionTags(userId, reflection.id, input.tags);
      const updated = await repo.updateNoteBlock(block.id, {
        status: "ALLOCATED",
        targetType: "REFLECTION",
        targetId: reflection.id,
      });
      return { block: updated, created: { kind: target, id: reflection.id, label: "Reflection" } };
    }

    case "MED_LOG": {
      const log = await repo.createMedicationLog({
        userId,
        shiftId,
        // OBSERVED, not ADMINISTERED: a student's page of drug notes is study reference, and
        // claiming they administered something they only wrote about would be a false record.
        type: "OBSERVED",
        date: dateForShift(shiftId, input.shiftFallbackShift) ?? today(),
        notes: text,
        // Only ever a card the STUDENT linked or created (P33). The classifier returns a drug
        // name, not an id, and guessing a card from a name would attach a log to the wrong drug.
        medicationId: input.medicationId,
        sourceType: "NOTE_BLOCK",
        sourceId: block.id,
      });
      const updated = await repo.updateNoteBlock(block.id, {
        status: "ALLOCATED",
        targetType: "MED_LOG",
        targetId: log.id,
      });
      return { block: updated, created: { kind: target, id: log.id, label: "Medication log" } };
    }

    case "PROFICIENCY_EVENT": {
      // The one target the classifier genuinely cannot decide (P30): status and part index are
      // the student's judgement, so filing without a confirmed proficiency is refused rather
      // than guessed.
      if (!input.proficiencyId) {
        throw new AllocateError("no_proficiency", "Pick which proficiency this evidences.");
      }
      const progress = await repo.setProficiencyStatus(userId, input.proficiencyId, {
        status: "DEVELOPING",
        partIndex: 0,
        occurredAt: dateForShift(shiftId, input.shiftFallbackShift) ?? today(),
        note: text,
      });
      const updated = await repo.updateNoteBlock(block.id, {
        status: "ALLOCATED",
        targetType: "PROFICIENCY_EVENT",
        targetId: progress.id,
      });
      return {
        block: updated,
        created: { kind: target, id: progress.id, label: "Proficiency evidence" },
      };
    }

    case "SHIFT_NOTES": {
      if (!shiftId) throw new AllocateError("no_shift", "Attach this to a shift first.");
      const shift = await repo.getShift(shiftId);
      if (!shift) throw new AllocateError("no_shift", "That shift no longer exists.");
      const existing = (shift.notes ?? "").trim();
      const appended = existing ? `${existing}\n\n${text}` : text;
      await repo.updateShift(shiftId, { notes: appended });
      const updated = await repo.updateNoteBlock(block.id, {
        status: "ALLOCATED",
        targetType: "SHIFT_NOTES",
        // No targetId: nothing was created. The append is recorded VERBATIM instead, because
        // it is the only way un-allocation can find and remove it again (P7/P19).
        appendedTo: shiftId,
        appendedText: text,
      });
      return { block: updated, created: { kind: target, label: "Shift notes" } };
    }

    default:
      throw new AllocateError("unsupported", `Can't file as ${String(target)} yet.`);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateForShift(shiftId: string | undefined, shift: Shift | undefined): string | undefined {
  return shiftId && shift?.id === shiftId ? shift.date : undefined;
}

/**
 * Reverse an allocation (spec-note-capture.md P19).
 *
 * The created row is soft-deleted through the normal repository path, so it tombstones and
 * syncs like any other delete. `SHIFT_NOTES` is the awkward case, and the awkwardness is
 * inherent rather than a shortcut: the text was appended into a field the student also owns
 * and may have since edited around. So it is removed **only if it still matches verbatim** —
 * otherwise it stays and the student is told, because silently deleting a paragraph they had
 * since rewritten would be worse than leaving it for them to cut.
 */
export interface UnallocateResult {
  block: NoteBlock;
  /** Set when the appended text could no longer be found — the student needs to know. */
  warning?: string;
}

export async function unallocateBlock(
  repo: Repository,
  block: NoteBlock,
): Promise<UnallocateResult> {
  if (block.status !== "ALLOCATED") return { block };

  let warning: string | undefined;

  switch (block.targetType) {
    case "REFLECTION":
      if (block.targetId) await repo.deleteReflection(block.targetId);
      break;
    case "MED_LOG":
      if (block.targetId) await repo.deleteMedicationLog(block.targetId);
      break;
    case "PROFICIENCY_EVENT":
      // Deliberately NOT reverted. `setProficiencyStatus` moved a progress row forward and
      // appended a status event; there is no "un-set" that could know what the status was
      // before, and inventing one would corrupt a record headed for the NMC. The block is
      // detached and the student is told to adjust the proficiency themselves.
      warning =
        "The proficiency evidence stays on your record — open that proficiency to change its status.";
      break;
    case "SHIFT_NOTES": {
      if (block.appendedTo && block.appendedText) {
        const shift = await repo.getShift(block.appendedTo);
        const notes = shift?.notes ?? "";
        if (notes.includes(block.appendedText)) {
          const stripped = notes
            .replace(block.appendedText, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          await repo.updateShift(block.appendedTo, { notes: stripped });
        } else {
          warning =
            "That text has been edited in your shift notes, so it's been left there — remove it by hand if you want it gone.";
        }
      }
      break;
    }
    default:
      break;
  }

  const updated = await repo.updateNoteBlock(block.id, {
    status: "PENDING",
    targetId: undefined,
    appendedTo: undefined,
    appendedText: undefined,
  });
  return { block: updated, warning };
}
