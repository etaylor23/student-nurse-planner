import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GripVertical, RotateCcw, SpellCheck, X } from "lucide-react";
import {
  NOTE_BLOCK_KIND_LABEL,
  NOTE_BLOCK_TARGET_LABEL,
  type NoteBlockKind,
} from "../../../domain/types";
import type { GibbsStage, NoteBlock, NoteBlockTarget } from "../../../domain/types";
import { seedProficiencies } from "../../../data/seed/proficiencies";
import type { ShiftResolution } from "../../../logic/captureShift";
import { MermaidDiagram } from "../MermaidDiagram";
import { AllocateBar, UndoFiling } from "./AllocateBar";
import { DESTINATION_KEYS, DestinationDropBar, DestinationTiles } from "./DestinationTiles";
import { MedicationOffer } from "./MedicationOffer";
import { MetaChip } from "./MetaChip";
import { PagePreview } from "./PagePreview";
import { ProficiencyPicker } from "./ProficiencyPicker";
import { ProgressSpine } from "./ProgressSpine";
import { ShiftChip } from "./ShiftBar";
import { WorthACheck } from "./WorthACheck";
import {
  diagramContaining,
  hasOpenDispute,
  isSettled,
  isTypingTarget,
  list,
  pendingBlocks,
} from "./blockState";
import { useWideScreen } from "./useWideScreen";

/**
 * Review a parsed capture (spec-note-capture.md P35).
 *
 * Works off the **persisted `NoteBlock` rows**, not the in-memory parse response. That is
 * load-bearing rather than tidy: edits have to survive closing the dialog, and allocation needs
 * a real `block.id` to stamp as `sourceId` on the row it creates (P5).
 *
 * **The photo is the map.** A sticky pane shows the page with every block outlined on it,
 * numbered and coloured by state; clicking a region focuses that note and focusing a note
 * highlights its region. P1 retains the photo precisely so a transcription can be checked
 * against it, and until this the student could never see it while reviewing. It also does the
 * job four permanent lanes were doing badly — showing the whole page's state at a glance — at a
 * quarter of the width and while actually being about their own handwriting.
 *
 * **One note expanded, the rest one line each.** The first version put every field of every
 * block on one plane: tags, NMC evidence, a drug-card offer and a file button for a note whose
 * destination the student had not yet decided. Now the stack is grouped `Needs you` / `Filed`,
 * the focused note is a full card, and everything else is a row — number, one-line preview,
 * `worth a check` if flagged, destination. Progressive disclosure, without a wizard: the whole
 * page's routing is still readable in one eyeful.
 *
 * **One control decides the note, not two.** `kind` and `targetType` map almost 1:1 and the spec
 * flagged the redundancy — asking "what is this?" and then "where does it go?" was the same
 * question twice. The student picks a destination from four tiles; `kind` is kept up to date
 * underneath, because that is what the vision model hints at and what the recall corpus reads
 * (P14). The tiles replace BOTH the old `<select>` and the lane board: one decision, one
 * control, visible only while a note is being decided.
 *
 * **Nothing here changes what the app writes** — same handlers, same guards, same order of
 * operations. It changes what the student sees and when they are asked to decide.
 *
 * Copy note: **"notes", not "blocks"**, everywhere the student can read it, aria-labels
 * included. "Block" is our word for the row, not theirs for the thing on their page.
 */

/** The `kind` a destination implies, for keeping the two fields in step. */
const KIND_FOR_TARGET: Record<NoteBlockTarget, NoteBlockKind> = {
  REFLECTION: "REFLECTION",
  MED_LOG: "MEDICATION",
  PROFICIENCY_EVENT: "CLINICAL_SKILL",
  SHIFT_NOTES: "OBSERVATION",
};

/** And the reverse, so a `kind` that already fits the new destination is LEFT ALONE — retyping
 *  to shift notes shouldn't turn a DATE_HEADER into an OBSERVATION for no reason. */
const TARGET_FOR_KIND: Record<NoteBlockKind, NoteBlockTarget> = {
  REFLECTION: "REFLECTION",
  MEDICATION: "MED_LOG",
  CLINICAL_SKILL: "PROFICIENCY_EVENT",
  OBSERVATION: "SHIFT_NOTES",
  TODO: "SHIFT_NOTES",
  DATE_HEADER: "SHIFT_NOTES",
  // A diagram's card offers keep/dismiss, not destinations — but if a student RETYPES one via
  // a destination it stops being a diagram, so the mapping still needs a sane answer.
  DIAGRAM: "SHIFT_NOTES",
  UNKNOWN: "SHIFT_NOTES",
};

/** Code → statement, so a shortlist shows what it means rather than "B2.1". */
const STATEMENTS = new Map(seedProficiencies.map((p) => [p.code, p.statement]));
/** Code → the platform/annexe it sits under, which is the heading a code needs to make sense. */
const GROUPING = new Map(
  seedProficiencies.map((p) => [
    p.code,
    p.annexe !== "NONE" ? `Annexe ${p.annexe}` : `Platform ${p.platform}`,
  ]),
);
/** Code → the `Proficiency` row id, which is what a status event is actually recorded against. */
const ID_FOR_CODE = new Map(seedProficiencies.map((p) => [p.code, p.id]));

/** "today" / "yesterday" / "on 28 Jul" — enough to judge whether a stored reading is stale. */
function relativeDay(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "last time";
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${then.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

const PREVIEW_CHARS = 78;

/** Photo-pane width bounds (% of the review body) and where the preference lives. */
const PANE_MIN = 20;
const PANE_MAX = 60;
const PANE_DEFAULT = 30;
const PANE_FRAC_KEY = "pm-review-pane-frac";

/**
 * The one-line version of a note, for a collapsed row.
 *
 * A written summary would be better — "Aciclovir — antiviral medication, HSV prevention in
 * haematology" — but the classifier doesn't return one, so this truncates at a WORD boundary
 * instead. Never mid-word, deliberately: "Phenoxymethyl…" and "Phenoxyethyl…" are the exact
 * pair the student may be being asked to tell apart, and half a drug name is worse than a
 * shorter line. A single word longer than the budget is cut anyway — there is nothing else to
 * do with it, and it can't be a pair of readings the student is choosing between.
 */
function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= PREVIEW_CHARS) return flat;
  const cut = flat.slice(0, PREVIEW_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** What review can change on a row. Everything a student does here is persisted, so closing
 *  the dialog and coming back shows their decisions rather than the model's again. */
export type BlockPatch = Partial<
  Pick<
    NoteBlock,
    "text" | "kind" | "targetType" | "disputedWords" | "candidateCodes" | "suggestedTags"
  >
>;

/** The student's own vocabulary, so review LINKS to what they have rather than duplicating it. */
export interface KnownContext {
  medications: { id: string; name: string }[];
  tagLabels: string[];
}

export interface ReviewHandlers {
  onEdit: (blockId: string, patch: BlockPatch) => Promise<void>;
  onAllocate: (
    blockId: string,
    opts: {
      targetType: NoteBlockTarget;
      proficiencyId?: string;
      medicationId?: string;
      tags?: string[];
      gibbs?: Partial<Record<GibbsStage, string>>;
    },
  ) => Promise<{ ok: true; label: string } | { ok: false; message: string }>;
  onUnallocate: (blockId: string) => Promise<{ warning?: string }>;
  /** Creates a `Medication` card from a block (P33). Returns its id so filing can link it. */
  onCreateMedication: (name: string, notes: string) => Promise<string | undefined>;
  /** Drops a block that isn't worth keeping. The photo is untouched (P13/P34). */
  onDismiss: (blockId: string) => Promise<void>;
  /** Keeps a DIAGRAM block with its page (P43) — the drawing's home is the photo, not a row. */
  onKeep: (blockId: string) => Promise<void>;
}

function RemoveButton({
  onClick,
  label,
  hidden = false,
}: {
  onClick: () => void;
  label: string;
  /** Revealed on hover/focus. Five permanent ×es on a row of code pills reads as a demolition
   *  site; the removal still has to be reachable, so it is present and focusable, not absent. */
  hidden?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`ml-0.5 rounded-full px-1 text-slate-400 transition-all hover:bg-slate-200 hover:text-ink ${
        hidden ? "opacity-0 focus:opacity-100 group-hover:opacity-100" : ""
      }`}
    >
      ×
    </button>
  );
}

/** The uppercase micro-heading used inside the card. One ramp, one weight, one tracking. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{children}</p>
  );
}

/**
 * A note the student isn't currently on — one line.
 *
 * Pending rows are a single `<button>`, because that is all they do: jump. Filed rows are not
 * clickable (there is no card to open — the note is a real row now) but they do carry an Undo,
 * so they are a plain container with `AllocateBar` in the tail.
 */
function BlockRow({
  block,
  index,
  onFocus,
  onUnallocate,
}: {
  block: NoteBlock;
  index: number;
  onFocus: (blockId: string) => void;
  onUnallocate: () => Promise<{ warning?: string }>;
}) {
  const kept = block.status === "KEPT";
  const filed = block.status === "ALLOCATED" || kept;
  const check = !filed && hasOpenDispute(block);
  const target = block.targetType;

  const badge = (
    <span
      className={`flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        filed
          ? "bg-primary-600 text-white"
          : check
            ? "bg-accent-600 text-white"
            : "bg-slate-100 text-slate-600"
      }`}
    >
      {filed ? (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-2.5 w-2.5 motion-safe:animate-[pm-tick_320ms_cubic-bezier(.2,.9,.3,1.5)_both]"
          aria-hidden="true"
        >
          <path d="m4 10.5 4 4 8-9" />
        </svg>
      ) : (
        index + 1
      )}
    </span>
  );

  // `basis-[calc(100%-2.5rem)]` up to `sm` is what forces the row onto two lines on a phone:
  // the preview takes the rest of line one beside the badge, and the pip and chip wrap under it.
  // As a plain `flex-1` it lost to them at 375px and truncated to nothing — and the preview is
  // the only part of a collapsed row that says WHICH note it is.
  const preview = (
    <span className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] truncate text-left text-[13.5px] text-slate-600 sm:basis-0">
      {previewOf(block.text)}
    </span>
  );

  // Filed says "Filed as X" and pending says where it will go — the same chip, carrying the
  // tense of the decision. `Not decided` stays dashed and unfilled: an empty slot, not a value.
  const chip = (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        filed
          ? "text-primary-800"
          : target
            ? "bg-slate-100 text-slate-600"
            : "border border-dashed border-slate-300 text-slate-400"
      }`}
    >
      {kept
        ? "Kept with the page"
        : filed
          ? `Filed as ${target ? NOTE_BLOCK_TARGET_LABEL[target] : "a note"}`
          : target
            ? NOTE_BLOCK_TARGET_LABEL[target]
            : "Not decided"}
    </span>
  );

  if (filed) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl bg-primary-50/60 px-3.5 py-2.5 ring-1 ring-primary-200">
        {badge}
        {preview}
        {chip}
        <UndoFiling onUnallocate={onUnallocate} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onFocus(block.id)}
      className="flex w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-slate-200 transition-shadow hover:ring-slate-300"
    >
      {badge}
      {preview}
      {check && <WorthACheck />}
      {chip}
    </button>
  );
}

/**
 * The note the student is on — the one expanded card, and the only elevation on the screen
 * besides the modal itself. That is what makes "this is the one you're on" legible without a
 * colour wash competing with `filed` for meaning.
 */
function BlockCard({
  block,
  index,
  handlers,
  gibbs,
  known,
  onSkip,
}: {
  block: NoteBlock;
  index: number;
  handlers: ReviewHandlers;
  gibbs?: Partial<Record<GibbsStage, string>>;
  known: KnownContext;
  onSkip: () => void;
}) {
  const [text, setText] = useState(block.text);
  const [tags, setTags] = useState(() => list(block.suggestedTags));
  const [codes, setCodes] = useState(() => list(block.candidateCodes));
  // A disputed word is resolved by choosing a reading — after that it stops being a question.
  const [resolved, setResolved] = useState<Record<string, true>>({});
  const [medicationId, setMedicationId] = useState<string>();
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  // Where this will be filed. The row is the source of truth — a drop on the drag bar writes
  // the same field — but it's mirrored locally so the tiles respond before the write lands.
  // `""` when nothing has routed it: an unrouted note asks rather than defaulting (P34).
  const [target, setTarget] = useState<NoteBlockTarget | "">(block.targetType ?? "");
  useEffect(() => {
    if (block.targetType) setTarget(block.targetType);
  }, [block.targetType]);
  // Tags the student ALREADY uses are applied; genuinely new ones start unticked, because a
  // new label is a permanent addition to the vocabulary their whole index is built on (P37).
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => {
    const mine = new Set(known.tagLabels.map((t) => t.toLowerCase()));
    return Object.fromEntries(
      list(block.suggestedTags).map((t) => [t, mine.has(t.toLowerCase())] as const),
    );
  });

  const openDisputes = list(block.disputedWords).filter((p) => !resolved[p]);
  const proficiencyId = codes[0] ? ID_FOR_CODE.get(codes[0]) : undefined;
  const chosenTags = tags.filter((t) => ticked[t]);
  const edited = text.trim() !== block.rawText.trim();
  // A drawing has no filing target (P43): its home is the photographed page, so the card
  // offers keep-or-dismiss instead of the four destinations.
  const isDiagram = block.kind === "DIAGRAM";

  function chooseReading(pair: string, chosen: string, other: string) {
    setResolved((r) => ({ ...r, [pair]: true }));
    // Swap the word in the text too, or "choosing" would be a label with no effect — and
    // persist both the text and the shortened dispute list, or the choice would be lost the
    // moment the dialog closes and the page would ask the same question again.
    const next = text.replace(new RegExp(`(^|\\W)${other}(?=\\W|$)`, "g"), `$1${chosen}`);
    setText(next);
    void handlers.onEdit(block.id, {
      text: next,
      disputedWords: list(block.disputedWords)
        .filter((p) => p !== pair)
        .join(","),
    });
  }

  /** Removing a suggestion has to stick — otherwise it comes back on the next render. */
  function dropTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    void handlers.onEdit(block.id, { suggestedTags: next.join(",") });
  }

  function dropCode(c: string) {
    const next = codes.filter((x) => x !== c);
    setCodes(next);
    void handlers.onEdit(block.id, { candidateCodes: next.join(",") });
  }

  /** A code the student picks goes to the FRONT — their choice outranks the model's ranking,
   *  and the leading code is the one filing records the evidence against. */
  function pickCode(c: string) {
    const next = [c, ...codes.filter((x) => x !== c)];
    setCodes(next);
    void handlers.onEdit(block.id, { candidateCodes: next.join(",") });
  }

  /**
   * Grow the textarea to fit its content.
   *
   * A `rows` guessed from character count can't work: the same note is 2 lines in the mobile
   * list and 6 in a narrow column, so anything computed from the text alone clips the student's
   * own words in one layout or the other. Measured instead, and re-measured when the column
   * resizes.
   */
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      const needed = el.scrollHeight + 2;
      // Capped: a very long note would otherwise make the card enormous. Past the cap it
      // scrolls, which is the one case where scrolling beats growing — and only then, so a
      // fitted box doesn't draw a scrollbar gutter it never needs.
      el.style.height = `${Math.min(needed, 384)}px`;
      el.style.overflowY = needed > 384 ? "auto" : "hidden";
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  /** Back to exactly what the models read (P24). Their own words are always one tap away. */
  function revert() {
    setText(block.rawText);
    void handlers.onEdit(block.id, { text: block.rawText });
  }

  /**
   * Set where the note goes, and keep `kind` in step underneath it.
   *
   * `kind` is left alone when it already implies this destination — retyping a `DATE_HEADER`
   * into shift notes shouldn't silently make it an `OBSERVATION`, and `kind` is what the recall
   * corpus reads later (P14).
   */
  function setDestination(t: NoteBlockTarget) {
    setTarget(t);
    const patch: BlockPatch = { targetType: t };
    if (TARGET_FOR_KIND[block.kind] !== t) patch.kind = KIND_FOR_TARGET[t];
    void handlers.onEdit(block.id, patch);
  }

  /** `1`–`4` are the tiles, on the keyboard. Bound on `window` so they work wherever focus is
   *  sitting, and ignored while the student is typing — "4.15" is a search, not a shortcut. */
  const setDest = useRef(setDestination);
  setDest.current = setDestination;
  const noDest = useRef(isDiagram);
  noDest.current = isDiagram;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a modified key: ⌘1 switches browser tab and always should.
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      // A diagram has no destinations, so the keys mean nothing on it.
      if (noDest.current) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > DESTINATION_KEYS.length) return;
      e.preventDefault();
      setDest.current(DESTINATION_KEYS[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The detail drawer is conditional on the destination, and shows only the parts that
  // destination needs. Tags are the exception — they apply to all four, so they are always
  // there once a destination exists.
  const showMed = target === "MED_LOG" && !!block.medicationCandidate;
  const showProficiency = target === "PROFICIENCY_EVENT";
  const gibbsStages = Object.entries(gibbs ?? {}) as [GibbsStage, string][];
  const showGibbs = target === "REFLECTION" && gibbsStages.length > 0;
  const showTags = !!target && tags.length > 0;
  const showDrawer = showMed || showProficiency || showGibbs || showTags;

  return (
    // `min-w-0` + `break-words`: one long drug name would otherwise push the card straight
    // through the column it lives in. `Phenoxymethylpenicillin` is 24 characters.
    <article className="min-w-0 break-words rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_16px_40px_-16px_rgba(16,24,40,.22)] ring-1 ring-slate-900/7 motion-safe:animate-[pm-card-in_240ms_ease-out_both]">
      <div className="flex min-w-0 items-center gap-2.5 border-b border-slate-100 px-4 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
          {index + 1}
        </span>
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
          {NOTE_BLOCK_KIND_LABEL[block.kind]}
        </span>
        {openDisputes.length > 0 && <WorthACheck />}
        <span
          aria-hidden="true"
          title="Drag onto a destination"
          className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-slate-400"
        >
          <GripVertical className="h-3.5 w-3.5" />
          drag me
        </span>
        {/* Not everything on a page is worth a row — a title, a phone number, a stray line.
            Two taps rather than one, because it removes a row; and it says plainly that the
            photo is untouched, which is what makes it safe (P13/P42). */}
        {confirmDismiss ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => void handlers.onDismiss(block.id)}
              className="rounded-lg bg-ink px-2 py-1 font-medium text-white hover:bg-slate-900"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmDismiss(false)}
              className="text-slate-400 hover:text-ink"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDismiss(true)}
            aria-label={`Remove note ${index + 1}`}
            title="Not a note — remove it (your photo is kept)"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="min-w-0 px-4 py-4">
        {confirmDismiss && (
          <p className="mb-2.5 text-[11px] text-slate-400">
            Removes this note only — your photo is kept, so reading the page again brings it back.
          </p>
        )}

        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Persisted on blur rather than per keystroke: one write per edit, not one per letter.
          onBlur={() => {
            if (text !== block.text) void handlers.onEdit(block.id, { text });
          }}
          rows={2}
          // `block w-full min-w-0`: a bare textarea has an intrinsic `cols` width that ignores
          // its container. `resize-none` because the height is measured above, not dragged.
          className="block w-full min-w-0 resize-none rounded-xl border-0 bg-slate-50 p-3.5 text-[15px] leading-relaxed text-ink ring-1 ring-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
          aria-label={`Note ${index + 1} text`}
        />

        {/* The sanitiser corrects British spellings and the student edits freely — either way,
            exactly what the models read off the page is always one tap away (P11/P24). */}
        {edited && (
          <button
            type="button"
            onClick={revert}
            className="mt-1.5 text-xs text-slate-400 hover:text-ink hover:underline"
          >
            Back to what was on the page
          </button>
        )}

        {/* One question, two answers — so one segmented control, not two loose buttons. The
            applied reading is filled; "currently this, could be that" is exactly the state.
            One strip per disputed pair: two questions deserve two controls (P22). */}
        {openDisputes.length > 0 && (
          <div className="mt-2.5 space-y-2">
            {openDisputes.map((pair) => {
              const [structure, check] = pair.split("|");
              return (
                <div
                  key={pair}
                  className="flex flex-wrap items-center gap-2.5 rounded-xl bg-accent-50 px-3 py-2.5 ring-1 ring-accent-200"
                >
                  <span className="text-[12.5px] text-slate-600">The two readings differ —</span>
                  <span className="flex overflow-hidden rounded-[9px] ring-1 ring-accent-300">
                    <button
                      type="button"
                      onClick={() => chooseReading(pair, structure, check)}
                      className="bg-accent-600 px-2.5 py-1 text-[12.5px] font-semibold text-white"
                    >
                      {structure}
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseReading(pair, check, structure)}
                      className="bg-white px-2.5 py-1 text-[12.5px] font-semibold text-accent-700 hover:bg-accent-50"
                    >
                      {check}
                    </button>
                  </span>
                  <span className="text-[12.5px] text-slate-600">
                    which matches your handwriting?
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {isDiagram ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
            {block.diagramSource && (
              <div className="w-full basis-full">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Rebuilt from your drawing
                </p>
                {/* Fail-closed: an unrenderable rebuild shows nothing, and the transcription
                    above stays either way — a bad picture never costs content (P44). */}
                <MermaidDiagram
                  source={block.diagramSource}
                  label="Your drawing, rebuilt as a diagram"
                />
              </div>
            )}
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-slate-600">
              This is a drawing, so its home is the photo itself — keeping it holds the drawing (and
              its words, for search) with this page. The notes it contains are their own cards
              above, and they file wherever they belong.
            </p>
            <button
              type="button"
              onClick={() => void handlers.onKeep(block.id)}
              className="shrink-0 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Keep with this page
            </button>
          </div>
        ) : (
          <DestinationTiles value={target} onChange={setDestination} />
        )}

        {showDrawer && (
          <div className="mt-3 min-w-0 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200 motion-safe:animate-[pm-panel-in_220ms_ease-out_both]">
            {showMed && block.medicationCandidate && (
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Label>Drug card</Label>
                  <span className="text-sm font-semibold text-ink">
                    {block.medicationCandidate}
                  </span>
                </div>
                <MedicationOffer
                  candidate={block.medicationCandidate}
                  medications={known.medications}
                  linkedId={medicationId}
                  onLink={setMedicationId}
                  onCreate={(name) => handlers.onCreateMedication(name, text)}
                />
              </div>
            )}

            {/* The codes are a CHOICE, so they look like one. The selected pill is the code
                filing records against; the statement underneath is what lets the student judge
                whether it's the right one. */}
            {showProficiency && (
              <div className="min-w-0">
                <Label>NMC evidence</Label>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {codes.map((c) => {
                    const on = c === codes[0];
                    return (
                      <span
                        key={c}
                        className={`group inline-flex items-center rounded-[9px] py-1 pl-2.5 pr-1 text-xs font-bold ring-1 ${
                          on
                            ? "bg-secondary-600 text-white ring-secondary-600"
                            : "bg-white text-slate-600 ring-slate-200"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => pickCode(c)}
                          title={STATEMENTS.get(c) ?? c}
                          aria-pressed={on}
                          aria-label={`Evidence ${c} — ${STATEMENTS.get(c) ?? "unknown code"}`}
                        >
                          {c}
                        </button>
                        <RemoveButton
                          hidden
                          label={`Remove proficiency ${c}`}
                          onClick={() => dropCode(c)}
                        />
                      </span>
                    );
                  })}
                  {/* The way past the shortlist (P28) — without it, a note evidencing something
                      the classifier missed has no route into the record at all. */}
                  <ProficiencyPicker onPick={pickCode} />
                </div>
                <p className="mt-2 text-[12.5px] leading-snug text-slate-600">
                  {codes[0] ? (
                    <>
                      <span className="font-semibold text-slate-500">
                        {GROUPING.get(codes[0]) ?? "NMC"} · {codes[0]}
                      </span>{" "}
                      — {STATEMENTS.get(codes[0]) ?? "Unknown code"}
                    </>
                  ) : (
                    "No proficiency suggested for this one — find it yourself if it evidences something."
                  )}
                </p>
              </div>
            )}

            {/* Currently the student is told "the reflection stages we found will be filled in"
                and shown nothing. Show them. */}
            {showGibbs && (
              <div className="min-w-0">
                <Label>Reflection stages we found</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {gibbsStages.map(([stage, body]) => (
                    <div key={stage} className="rounded-[9px] bg-white p-2.5 ring-1 ring-slate-200">
                      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-primary-700">
                        {stage.toLowerCase()}
                      </p>
                      <p className="mt-1 text-xs leading-snug text-slate-600">{body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showTags && (
              <div
                className={`flex flex-wrap items-center gap-1.5 ${
                  showMed || showProficiency || showGibbs
                    ? "mt-3 border-t border-slate-200 pt-3"
                    : ""
                }`}
              >
                <Label>Tags</Label>
                {tags.map((t) => {
                  const on = !!ticked[t];
                  return (
                    <span
                      key={t}
                      className={`inline-flex items-center rounded-full py-0.5 pl-1 pr-0.5 text-xs ${
                        on
                          ? "bg-secondary-50 text-secondary-800 ring-1 ring-secondary-200"
                          : "border border-dashed border-slate-300 text-slate-500"
                      }`}
                    >
                      {/* A new label is a permanent addition to their vocabulary, so it is
                          opt-in; one they already use is applied. Both stay removable. */}
                      <button
                        type="button"
                        onClick={() => setTicked((v) => ({ ...v, [t]: !on }))}
                        aria-label={`${on ? "Don't apply" : "Apply"} tag ${t}`}
                        className="flex items-center gap-1 rounded-full px-1"
                      >
                        <span aria-hidden="true">{on ? "✓" : "+"}</span>
                        <span>{t}</span>
                      </button>
                      <RemoveButton label={`Remove tag ${t}`} onClick={() => dropTag(t)} />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {!isDiagram && (
        <AllocateBar
          target={target}
          proficiencyId={proficiencyId}
          tags={chosenTags}
          gibbs={gibbs}
          onSkip={onSkip}
          onAllocate={(targetType) =>
            handlers.onAllocate(block.id, {
              targetType,
              proficiencyId,
              tags: chosenTags,
              gibbs,
              medicationId,
            })
          }
        />
      )}
    </article>
  );
}

export function ReviewPanel({
  blocks,
  corrections = [],
  pageDateRaw,
  pageCount = 1,
  imageUrl,
  gibbsByRawText,
  shift,
  selectedShiftId,
  onSelectShift,
  known = { medications: [], tagLabels: [] },
  cachedFrom,
  onRerun,
  onClose,
  onStartAgain,
  handlers,
}: {
  blocks: NoteBlock[];
  corrections?: string[];
  pageDateRaw?: string | null;
  pageCount?: number;
  /** Signed GET for the page itself (P1). Without one the photo pane isn't rendered and the
   *  stack takes the full width — every other part of the screen stands on its own. */
  imageUrl?: string;
  /** Gibbs splits from the parse, keyed by the block's verbatim text — the row doesn't hold them. */
  gibbsByRawText?: Record<string, Partial<Record<GibbsStage, string>>>;
  shift?: ShiftResolution;
  selectedShiftId?: string;
  onSelectShift?: (shiftId: string | undefined) => void;
  known?: KnownContext;
  /** Set when this came from the stored parse rather than the models (P41). */
  cachedFrom?: string;
  onRerun?: () => void;
  /** Put the window down, keeping the capture. Rendered as the header ✕ and the footer button. */
  onClose?: () => void;
  onStartAgain?: () => void;
  handlers: ReviewHandlers;
}) {
  const pending = useMemo(() => pendingBlocks(blocks), [blocks]);
  const filed = useMemo(() => blocks.filter(isSettled), [blocks]);
  const toCheck = useMemo(() => pending.filter(hasOpenDispute).length, [pending]);

  const [focusId, setFocusId] = useState<string | undefined>(() => pendingBlocks(blocks)[0]?.id);
  /** Only one meta panel is open at a time — opening one closes the others. */
  const [panel, setPanel] = useState<"cache" | "spell" | "shift">();
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<NoteBlockTarget>();
  /** Below `lg` the photo is a strip you tap open rather than a column — still the map, just
   *  not always on screen (P35: mobile is the primary path). */
  const wide = useWideScreen();
  const [pageOpen, setPageOpen] = useState(false);

  /**
   * The photo pane's width as a % of the body, draggable (and remembered) because pages and
   * drawings vary: a dense page wants a big map, a familiar one wants more card. Clamped to
   * [20, 60] — below 20 the photo stops being legible, above 60 the cards do.
   */
  const [paneFrac, setPaneFrac] = useState<number>(() => {
    const stored = Number(localStorage.getItem(PANE_FRAC_KEY));
    return Number.isFinite(stored) && stored >= PANE_MIN && stored <= PANE_MAX
      ? stored
      : PANE_DEFAULT;
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const setFrac = (next: number) => {
    const clamped = Math.min(PANE_MAX, Math.max(PANE_MIN, Math.round(next)));
    setPaneFrac(clamped);
    localStorage.setItem(PANE_FRAC_KEY, String(clamped));
  };
  const startPaneDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const move = (ev: PointerEvent) => setFrac(((ev.clientX - rect.left) / rect.width) * 100);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  /** The drawing the focused note is part of, if any (P43/P44) — pinned under the photo so
   *  it stays on screen while its branches are being filed, active branch highlighted. */
  const focusedBlock = blocks.find((b) => b.id === focusId);
  const memberDiagram = focusedBlock ? diagramContaining(focusedBlock, blocks) : undefined;
  const pinnedSource = memberDiagram?.diagramSource;
  const [diagramZoom, setDiagramZoom] = useState(false);
  useEffect(() => {
    if (!diagramZoom) return;
    // Capture phase + stopPropagation: Escape puts the OVERLAY away, and must not fall
    // through to the capture modal's own Escape handler and close the whole window.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setDiagramZoom(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [diagramZoom]);

  /**
   * Focus always names a note the student can still act on.
   *
   * Restored here rather than inside each handler: filing, dismissing, undoing and a second
   * page arriving all break the same invariant, and one effect is easier to trust than four
   * call sites remembering to advance. When nothing is left, focus is empty and the stack shows
   * only `Filed (n)` — the natural end state, not a special case.
   */
  useEffect(() => {
    if (focusId && pending.some((b) => b.id === focusId)) return;
    setFocusId(pending[0]?.id);
  }, [focusId, pending]);

  /** `↑`/`↓` walk the pending notes in page order. A filed note isn't a stop on the way. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setFocusId((current) => {
        if (pending.length === 0) return undefined;
        const at = pending.findIndex((b) => b.id === current);
        const next = Math.max(
          0,
          Math.min(pending.length - 1, (at < 0 ? 0 : at) + (e.key === "ArrowDown" ? 1 : -1)),
        );
        return pending[next].id;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  /** A filed note has no card to open, so a click on its region or pip is not a focus change —
   *  bouncing focus to some other note would be worse than doing nothing. */
  function focus(blockId: string) {
    if (pending.some((b) => b.id === blockId)) setFocusId(blockId);
  }

  function toggle(which: "cache" | "spell" | "shift") {
    setPanel((open) => (open === which ? undefined : which));
  }

  const hasMeta = !!cachedFrom || corrections.length > 0 || !!shift || !!pageDateRaw;

  const group = (title: string, hint: string, rows: NoteBlock[], tone: "pending" | "filed") => (
    <section className="mb-6 min-w-0">
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <h3
          className={`text-xs font-bold uppercase tracking-[0.12em] ${
            tone === "filed" ? "text-primary-800" : "text-ink"
          }`}
        >
          {title}
        </h3>
        <span className="text-xs text-slate-400">{hint}</span>
      </div>
      <ul className="min-w-0 space-y-2.5">
        {rows.map((b) => (
          <li
            key={b.id}
            className="min-w-0"
            // Drag is never the only route — the tiles in the card and the keys `1`–`4` both do
            // the same thing. A filed note doesn't drag: the real row exists, and moving the
            // note would leave the two out of step. A kept diagram doesn't either — it has no
            // destination to be dragged to.
            draggable={b.status === "PENDING"}
            // Checked again in the handler, not just declared in the attribute: `draggable` is
            // a hint the browser honours and any synthetic drag ignores, and the reason a filed
            // note can't move is that the real row already exists — too load-bearing to leave
            // resting on a hint.
            onDragStart={() => {
              if (b.status === "PENDING") setDragging(b.id);
            }}
            onDragEnd={() => {
              setDragging(undefined);
              setOver(undefined);
            }}
          >
            {b.id === focusId && b.status === "PENDING" ? (
              <BlockCard
                block={b}
                index={blocks.indexOf(b)}
                handlers={handlers}
                gibbs={gibbsByRawText?.[b.rawText]}
                known={known}
                onSkip={() => {
                  const at = pending.findIndex((p) => p.id === b.id);
                  setFocusId(pending[Math.min(pending.length - 1, at + 1)]?.id);
                }}
              />
            ) : (
              <BlockRow
                block={b}
                index={blocks.indexOf(b)}
                onFocus={focus}
                onUnallocate={() => handlers.onUnallocate(b.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-100 px-6 py-3.5">
        {/* On a phone the header is two lines: title + ✕, then the spine on its own. `order-last`
            is what does it — five pips and "2 of 5 filed" do not fit beside a title at 375px, and
            a capture is a notebook session, so there can be a great deal more than five. */}
        <div className="min-w-0 flex-1 lg:w-[230px] lg:flex-none">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            Photograph your notes
          </h2>
          <p className="text-xs text-slate-400">
            {blocks.length} note{blocks.length === 1 ? "" : "s"} from {pageCount} page
            {pageCount === 1 ? "" : "s"}
            {toCheck > 0 && ` · ${toCheck} worth a check`}
          </p>
        </div>
        <div className="order-last flex w-full min-w-0 items-center lg:order-none lg:w-auto lg:flex-1 lg:justify-center">
          <ProgressSpine blocks={blocks} focusId={focusId} onFocus={focus} />
        </div>
        <div className="flex items-center gap-2.5">
          {/* Shown, not hidden in a help menu — a shortcut nobody knows about isn't one. */}
          <span className="hidden items-center gap-1.5 rounded-[9px] bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-400 ring-1 ring-slate-200 xl:inline-flex">
            <kbd className="rounded bg-white px-1.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">
              ↑↓
            </kbd>
            move
            <kbd className="rounded bg-white px-1.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">
              1–4
            </kbd>
            where
            <kbd className="rounded bg-white px-1.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">
              ⏎
            </kbd>
            file
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* Three facts that used to arrive as stacked full-width banners before the student had
          seen a single note. All true, none of them the first thing to do. Each states itself
          in three words and holds its detail — and its undo — one click away. */}
      {hasMeta && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-6 py-2.5">
          {cachedFrom && (
            <MetaChip
              open={panel === "cache"}
              onToggle={() => toggle("cache")}
              icon={<RotateCcw aria-hidden="true" className="h-3 w-3 text-slate-400" />}
              label={`Read ${relativeDay(cachedFrom)}`}
            >
              {/* Say where it came from. A result that looks live but is months old would be
                  worse than a slower one — and P41 says the re-read is free, so say that too. */}
              <p>
                We&apos;ve read this page before, so this is what we found {relativeDay(cachedFrom)}{" "}
                — no waiting, and no charge against your daily photos. Your photo is unchanged.{" "}
                {onRerun && (
                  <button
                    type="button"
                    onClick={onRerun}
                    className="font-semibold text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
                  >
                    Read it again from scratch
                  </button>
                )}
              </p>
            </MetaChip>
          )}

          {corrections.length > 0 && (
            <MetaChip
              open={panel === "spell"}
              onToggle={() => toggle("spell")}
              icon={<SpellCheck aria-hidden="true" className="h-3 w-3 text-slate-400" />}
              label={`${corrections.length} spelling${corrections.length === 1 ? "" : "s"} fixed`}
            >
              {/* The P24 boundary, stated: clinical spelling only. That's the reassuring part. */}
              <p>
                Spell-checked against UK clinical English — your wording and abbreviations are
                untouched.
              </p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {corrections.map((c) => {
                  const [from, to] = c.split("|");
                  return (
                    <span
                      key={c}
                      className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px]"
                    >
                      <span className="line-through opacity-60">{from}</span> → {to}
                    </span>
                  );
                })}
              </p>
            </MetaChip>
          )}

          {shift ? (
            <ShiftChip
              resolution={shift}
              selectedShiftId={selectedShiftId}
              onSelect={onSelectShift ?? (() => {})}
              pageDateRaw={pageDateRaw}
              open={panel === "shift"}
              onToggle={() => toggle("shift")}
            />
          ) : (
            // Shown exactly as written — the app resolves the year, the model never invents
            // one (P8).
            pageDateRaw && (
              <span className="ml-auto text-[11px] text-slate-400">
                Dated &ldquo;{pageDateRaw}&rdquo;
              </span>
            )
          )}
        </div>
      )}

      <div
        ref={bodyRef}
        className="grid grid-cols-1 items-start"
        // The photo column is student-sized (dragged, remembered); the 10px track is the
        // handle. Inline because Tailwind can't express a runtime fraction.
        style={wide && imageUrl ? { gridTemplateColumns: `${paneFrac}% 10px 1fr` } : undefined}
      >
        {imageUrl && (
          <aside className="min-w-0 border-b border-slate-100 bg-slate-50 p-5 lg:border-b-0">
            {wide ? (
              <>
                <PagePreview
                  imageUrl={imageUrl}
                  blocks={blocks}
                  focusId={focusId}
                  onFocus={focus}
                />
                {pinnedSource && memberDiagram && (
                  <div className="mt-5">
                    <div className="mb-2 flex items-baseline justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        From your drawing
                      </p>
                      <button
                        type="button"
                        onClick={() => setDiagramZoom(true)}
                        className="text-[11px] font-semibold text-secondary-700 hover:underline"
                      >
                        Enlarge
                      </button>
                    </div>
                    {/* A landscape drawing in a thin column is a mini-map, not the artwork:
                        it scales to fit, the active branch glows, and Enlarge (or dragging
                        the divider) is the route to full size. */}
                    <MermaidDiagram
                      source={pinnedSource}
                      highlight={focusedBlock?.text}
                      label="The drawing this note is part of, rebuilt as a diagram"
                    />
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                      This note is one branch of the drawing — the outlined node is the one
                      you&apos;re on.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPageOpen((v) => !v)}
                  aria-expanded={pageOpen}
                  className="flex w-full items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-slate-600 ring-1 ring-slate-200"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 text-slate-400 transition-transform ${pageOpen ? "rotate-180" : ""}`}
                  />
                  {pageOpen ? "Hide your page" : "See your page"}
                </button>
                {pageOpen && (
                  <div className="mt-3">
                    <PagePreview
                      imageUrl={imageUrl}
                      blocks={blocks}
                      focusId={focusId}
                      onFocus={focus}
                    />
                  </div>
                )}
                {/* Narrow screens have no pinned column, so the drawing rides with the
                    focused branch here instead — same mini-map, same highlight. */}
                {pinnedSource && (
                  <div className="mt-3">
                    <MermaidDiagram
                      source={pinnedSource}
                      highlight={focusedBlock?.text}
                      label="The drawing this note is part of, rebuilt as a diagram"
                    />
                  </div>
                )}
              </>
            )}
          </aside>
        )}

        {wide && imageUrl && (
          /* The divider IS the width control: pointer-drag or arrow keys, remembered per
             device. A separator role because that is literally what it is. */
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the photo pane"
            aria-valuenow={paneFrac}
            aria-valuemin={PANE_MIN}
            aria-valuemax={PANE_MAX}
            tabIndex={0}
            onPointerDown={startPaneDrag}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setFrac(paneFrac - 3);
              if (e.key === "ArrowRight") setFrac(paneFrac + 3);
            }}
            className="group flex h-full cursor-col-resize items-stretch justify-center border-r border-slate-100 bg-slate-50 focus:outline-none focus-visible:bg-primary-100"
          >
            <span
              aria-hidden="true"
              className="my-6 w-[3px] rounded-full bg-slate-200 transition-colors group-hover:bg-slate-400"
            />
          </div>
        )}

        <div className="min-w-0 p-6">
          {/* Groups render only when non-empty: an empty "Filed" heading is a promise, not a
              status, and an empty "Needs you" is the end of the job. */}
          {pending.length > 0 &&
            group(
              `Needs you (${pending.length})`,
              toCheck > 0 ? `${toCheck} worth a check` : "nothing flagged",
              pending,
              "pending",
            )}
          {/* Say plainly that filing created a genuine row (P4). */}
          {filed.length > 0 && group(`Filed (${filed.length})`, "real entries now", filed, "filed")}

          {(onClose || onStartAgain) && (
            <div className="flex flex-wrap items-center gap-3.5 border-t border-slate-100 pt-4">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close — this stays here
                </button>
              )}
              {onStartAgain && (
                <button
                  type="button"
                  onClick={onStartAgain}
                  className="text-sm font-semibold text-slate-400 hover:text-ink hover:underline"
                >
                  Start again with a new photo
                </button>
              )}
              <p className="ml-auto text-xs text-slate-400">
                Closing keeps this page of notes — the Photo button brings it straight back.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lanes were right that dragging needs somewhere to drop, and wrong about everything
          else: there is nothing to drop until you pick a note up. Not rendered below `lg` —
          touch drag is unreliable and the tiles already do the job (P35). */}
      {/* The mini-map, at size — for when a landscape drawing deserves more than a thin
          column. Esc, the ✕ or clicking the backdrop put it away. */}
      {diagramZoom && pinnedSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
          onClick={() => setDiagramZoom(false)}
        >
          <div
            role="dialog"
            aria-label="Your drawing, enlarged"
            className="max-h-full w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Rebuilt from your drawing
              </p>
              <button
                type="button"
                onClick={() => setDiagramZoom(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-[9px] text-slate-400 hover:bg-slate-100 hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <MermaidDiagram
              source={pinnedSource}
              highlight={focusedBlock?.text}
              label="The drawing this note is part of, rebuilt as a diagram"
            />
          </div>
        </div>
      )}

      {dragging && wide && (
        <DestinationDropBar
          over={over}
          onOver={setOver}
          onLeave={() => setOver(undefined)}
          onDrop={(t) => {
            // The same write the lanes made. `kind` is deliberately left alone here: a drop
            // says where it goes, and re-typing the note is the card's decision to make.
            void handlers.onEdit(dragging, { targetType: t });
            setDragging(undefined);
            setOver(undefined);
          }}
        />
      )}
    </div>
  );
}
