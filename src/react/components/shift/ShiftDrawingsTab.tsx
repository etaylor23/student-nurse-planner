import { useCallback, useEffect, useState } from "react";
import { NOTE_BLOCK_TARGET_LABEL, type NoteBlock } from "../../../domain/types";
import { useRepository } from "../../RepositoryContext";
import { keptDrawingsForShift, type ShiftDrawing } from "../capture/blockState";
import { MermaidDiagram } from "../MermaidDiagram";
import { TabHeading } from "./shared";

/**
 * The Drawings tab (hardening H1): the drawings this shift's photographed pages kept.
 *
 * A kept drawing has no domain row to live in — the retained photo is the artefact (P43) —
 * which left it visible only inside the review dialog that filed it. Here it lives on the
 * shift like every other captured thing: the Mermaid rebuild (fail-closed, as everywhere),
 * the transcription, and the notes that sit inside the drawing with what became of each.
 *
 * **View-only, deliberately.** Every action on a block — retype, refile, undo — belongs to
 * review, which the Photo button resumes; a second set of controls here would be a second
 * place for the same decisions to disagree.
 */
export function ShiftDrawingsTab({ drawings }: { drawings: ShiftDrawing[] }) {
  return (
    <div>
      <TabHeading label="Drawings kept with your photos" count={drawings.length} />

      {drawings.length === 0 ? (
        <p className="text-sm text-slate-400">
          None yet. A drawing you keep while reviewing a photographed page shows up here.
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {drawings.map(({ drawing, subBlocks }) => (
              <li
                key={drawing.id}
                className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5"
              >
                {drawing.diagramSource && (
                  <MermaidDiagram
                    source={drawing.diagramSource}
                    label="The drawing, rebuilt as a diagram"
                  />
                )}
                <p className="mt-3 whitespace-pre-wrap border-l-2 border-primary-200 pl-3 text-sm text-slate-700">
                  {drawing.text.trim()}
                </p>

                {subBlocks.length > 0 && (
                  <>
                    <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Notes inside this drawing
                    </p>
                    {/* Same nesting language as review: indented, with the connecting rule
                        saying WHY they're grouped — these notes live in the drawing above. */}
                    <ul className="ml-1 mt-2 min-w-0 space-y-1.5 border-l-2 border-secondary-100 pl-3">
                      {subBlocks.map((b) => (
                        <li
                          key={b.id}
                          className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1"
                        >
                          <span className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] truncate text-[13px] text-slate-600 sm:basis-0">
                            {b.text.trim()}
                          </span>
                          <SubBlockState block={b} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-400">
            Reading only. To change a note, reopen its page from the Photo button.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * What became of a note inside a drawing — the same words review uses, because it is the same
 * fact: filed in its own right (a med log of its own), stored inside the drawing (its words
 * are already in the transcription above, P45), or still waiting to be reviewed.
 */
function SubBlockState({ block }: { block: NoteBlock }) {
  const filedAs =
    block.status === "ALLOCATED"
      ? `Filed as ${block.targetType ? NOTE_BLOCK_TARGET_LABEL[block.targetType] : "a note"}`
      : undefined;

  if (filedAs) {
    return (
      <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
        {filedAs}
      </span>
    );
  }
  if (block.status === "PENDING") {
    return (
      <span className="shrink-0 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
        Still to review
      </span>
    );
  }
  // ABSORBED, or a kept block: settled, and carried by the drawing rather than a row.
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-500">
      {block.status === "KEPT" ? "Kept with the page" : "Stored in the drawing"}
    </span>
  );
}

/**
 * The shift's kept drawings, loaded from the local database.
 *
 * Lives here rather than in `hooks.ts` because both callers are this tab's own concern: the
 * modal needs the count to decide whether the tab exists at all (H1 — no tab on a shift with
 * no drawings), and the tab needs the list. One read, passed down, so opening the modal
 * doesn't fetch every block twice.
 */
export function useShiftDrawings(shiftId: string | undefined): ShiftDrawing[] {
  const { repo, userId } = useRepository();
  const [drawings, setDrawings] = useState<ShiftDrawing[]>([]);

  const reload = useCallback(async () => {
    if (!shiftId) return setDrawings([]);
    const [captures, blocks] = await Promise.all([
      repo.listNoteCaptures(userId),
      repo.listNoteBlocks(userId),
    ]);
    setDrawings(keptDrawingsForShift(shiftId, captures, blocks));
  }, [repo, userId, shiftId]);

  useEffect(() => {
    // Unreadable → no drawings, never a broken tab (the shift itself still opens).
    void reload().catch(() => setDrawings([]));
  }, [reload]);

  return drawings;
}
