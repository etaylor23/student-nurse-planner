import { useEffect, useMemo, useRef, useState } from "react";
import { NOTE_BLOCK_KIND_LABEL, type NoteBlockKind } from "../../../domain/types";
import type { GibbsStage, NoteBlock, NoteBlockTarget } from "../../../domain/types";
import { seedProficiencies } from "../../../data/seed/proficiencies";
import type { ShiftResolution } from "../../../logic/captureShift";
import { AllocateBar } from "./AllocateBar";
import { LaneBoard } from "./LaneBoard";
import { MedicationOffer } from "./MedicationOffer";
import { ProficiencyPicker } from "./ProficiencyPicker";
import { ShiftBar } from "./ShiftBar";
import { useWideScreen } from "./useWideScreen";

/**
 * Review a parsed capture (spec-note-capture.md P35).
 *
 * Works off the **persisted `NoteBlock` rows**, not the in-memory parse response. That is
 * load-bearing rather than tidy: edits have to survive closing the dialog, and allocation needs
 * a real `block.id` to stamp as `sourceId` on the row it creates (P5).
 *
 * **Mobile list is the primary layout, by decision** — students photograph notes on a phone,
 * so the list is the experience that has to be good and wide-screen lanes are the enhancement.
 *
 * Every part of a block is a LABELLED SECTION rather than a row of chips. The first version
 * put the target, the group key, the disputed words, the tags and the proficiency codes in one
 * undifferentiated stack, and it read as noise — you could not tell which text belonged to
 * which idea. Anything suggested is also removable: a suggestion you cannot decline is not a
 * suggestion.
 */

const KIND_OPTIONS: NoteBlockKind[] = [
  "CLINICAL_SKILL",
  "MEDICATION",
  "REFLECTION",
  "OBSERVATION",
  "TODO",
  "DATE_HEADER",
  "UNKNOWN",
];

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

/** Blocks store their lists as comma-separated strings — the row is flat primitives only. */
function list(s: string | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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
}

function Section({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "warn";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3">
      <h4
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          tone === "warn" ? "text-amber-700" : "text-slate-400"
        }`}
      >
        {label}
      </h4>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="ml-1 rounded-full px-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
    >
      ×
    </button>
  );
}

function BlockCard({
  block,
  index,
  handlers,
  gibbs,
  known,
}: {
  block: NoteBlock;
  index: number;
  handlers: ReviewHandlers;
  gibbs?: Partial<Record<GibbsStage, string>>;
  known: KnownContext;
}) {
  const [text, setText] = useState(block.text);
  const [tags, setTags] = useState(() => list(block.suggestedTags));
  const [codes, setCodes] = useState(() => list(block.candidateCodes));
  const [showAllCodes, setShowAllCodes] = useState(false);
  // A disputed word is resolved by choosing a reading — after that it stops being a question.
  const [resolved, setResolved] = useState<Record<string, true>>({});
  const [medicationId, setMedicationId] = useState<string>();
  // Where this will be filed. The row is the source of truth — the lane view writes the same
  // field (P35) — but it's mirrored locally so the select responds before the write lands.
  // `""` when nothing has routed it: an unrouted block asks rather than defaulting (P34).
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
  const allocated = block.status === "ALLOCATED";
  const proficiencyId = codes[0] ? ID_FOR_CODE.get(codes[0]) : undefined;
  const chosenTags = tags.filter((t) => ticked[t]);
  const edited = text.trim() !== block.rawText.trim();

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

  /** A code from the full picker goes to the FRONT — the student's choice outranks the model's. */
  function pickCode(c: string) {
    const next = [c, ...codes.filter((x) => x !== c)];
    setCodes(next);
    setShowAllCodes(false);
    void handlers.onEdit(block.id, { candidateCodes: next.join(",") });
  }

  /**
   * Grow the textarea to fit its content.
   *
   * A `rows` guessed from character count can't work: the same note is 2 lines in the mobile
   * list and 6 in a 230px lane column, so anything computed from the text alone clips the
   * student's own words in one layout or the other. Measured instead, and re-measured when the
   * column resizes.
   */
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      // Capped: a very long block in a 237px lane would otherwise make the column enormous.
      // Past the cap it scrolls, which is the one case where scrolling is better than growing.
      el.style.height = `${Math.min(el.scrollHeight + 2, 384)}px`;
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

  return (
    // `min-w-0` + `break-words`: this card also lives in a ~13rem lane column, where one long
    // drug name would otherwise push it straight through the lane's border.
    <div
      className={`min-w-0 break-words rounded-xl border p-3 ${
        allocated
          ? "border-primary-200 bg-primary-50/30"
          : openDisputes.length > 0
            ? "border-amber-300 bg-amber-50/30"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-slate-400">#{index + 1}</span>
        <select
          value={block.kind}
          onChange={(e) =>
            void handlers.onEdit(block.id, { kind: e.target.value as NoteBlockKind })
          }
          disabled={allocated}
          className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-60"
          aria-label={`Type of block ${index + 1}`}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {NOTE_BLOCK_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        // Persisted on blur rather than per keystroke: one write per edit, not one per letter.
        onBlur={() => {
          if (text !== block.text) void handlers.onEdit(block.id, { text });
        }}
        disabled={allocated}
        rows={2}
        // `block w-full min-w-0`: a bare textarea has an intrinsic `cols` width that ignores its
        // container, which is what pushed it out of the lane. Height comes from the effect above.
        className="mt-2 block w-full min-w-0 resize-y overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm leading-relaxed text-ink-900 disabled:bg-slate-50 disabled:text-slate-500"
        aria-label={`Text of block ${index + 1}`}
      />

      {/* The sanitiser corrects British spellings and the student edits freely — either way,
          exactly what the models read off the page is always one tap away (P11/P24). */}
      {edited && !allocated && (
        <button
          type="button"
          onClick={revert}
          className="mt-1 text-xs text-slate-400 hover:text-slate-600 hover:underline"
        >
          Back to what was on the page
        </button>
      )}

      {openDisputes.length > 0 && !allocated && (
        <Section label="Worth a check" tone="warn">
          <p className="text-xs text-amber-900">
            The two readings differ — pick the one that matches your handwriting.
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {openDisputes.map((pair) => {
              const [structure, check] = pair.split("|");
              return (
                <li key={pair} className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => chooseReading(pair, structure, check)}
                    className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  >
                    {structure}
                  </button>
                  <span className="text-xs text-amber-600">or</span>
                  <button
                    type="button"
                    onClick={() => chooseReading(pair, check, structure)}
                    className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                  >
                    {check}
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {block.medicationCandidate && (
        <Section label="Medication">
          <p className="text-sm text-slate-700">{block.medicationCandidate}</p>
          {!allocated && (
            <MedicationOffer
              candidate={block.medicationCandidate}
              medications={known.medications}
              linkedId={medicationId}
              onLink={setMedicationId}
              onCreate={(name) => handlers.onCreateMedication(name, text)}
            />
          )}
        </Section>
      )}

      {tags.length > 0 && (
        <Section label="Tags">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => {
              const on = !!ticked[t];
              return (
                <span
                  key={t}
                  className={`inline-flex items-center rounded-full py-0.5 pl-1 pr-0.5 text-xs ${
                    on
                      ? "bg-secondary-50 text-secondary-800"
                      : "border border-dashed border-slate-300 text-slate-500"
                  }`}
                >
                  {/* A new label is a permanent addition to their vocabulary, so it is opt-in;
                      one they already use is applied. Both stay removable. */}
                  <button
                    type="button"
                    onClick={() => setTicked((v) => ({ ...v, [t]: !on }))}
                    disabled={allocated}
                    aria-label={`${on ? "Don't apply" : "Apply"} tag ${t}`}
                    className="flex items-center gap-1 rounded-full px-1 disabled:opacity-100"
                  >
                    <span aria-hidden="true">{on ? "✓" : "+"}</span>
                    <span>{t}</span>
                  </button>
                  {!allocated && (
                    <RemoveButton label={`Remove tag ${t}`} onClick={() => dropTag(t)} />
                  )}
                </span>
              );
            })}
          </div>
        </Section>
      )}

      {(codes.length > 0 || !allocated) && (
        <Section label="NMC proficiency evidence">
          <ul className="space-y-1.5">
            {(showAllCodes ? codes : codes.slice(0, 1)).map((c) => (
              <li key={c} className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  {/* The platform/annexe is the heading a bare code needs to mean anything. */}
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {GROUPING.get(c) ?? "NMC"} · {c}
                  </p>
                  <p className="text-xs leading-snug text-slate-700">
                    {STATEMENTS.get(c) ?? "Unknown code"}
                  </p>
                </div>
                {!allocated && (
                  <RemoveButton label={`Remove proficiency ${c}`} onClick={() => dropCode(c)} />
                )}
              </li>
            ))}
          </ul>
          {codes.length === 0 && (
            <p className="text-xs text-slate-500">
              No proficiency suggested for this one — find it yourself if it evidences something.
            </p>
          )}
          {codes.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllCodes((v) => !v)}
              className="mt-1.5 text-xs font-medium text-secondary-700 hover:underline"
            >
              {showAllCodes
                ? "Show fewer"
                : `Show ${codes.length - 1} other suggestion${codes.length === 2 ? "" : "s"}`}
            </button>
          )}
          {/* The way past the shortlist (P28) — without it, a note evidencing something the
              classifier missed has no route into the record at all. */}
          {!allocated && <ProficiencyPicker onPick={pickCode} />}
        </Section>
      )}

      <AllocateBar
        block={block}
        target={target}
        onTargetChange={(t) => {
          setTarget(t);
          void handlers.onEdit(block.id, { targetType: t });
        }}
        proficiencyId={proficiencyId}
        tags={chosenTags}
        gibbs={gibbs}
        onAllocate={(targetType) =>
          handlers.onAllocate(block.id, {
            targetType,
            proficiencyId,
            tags: chosenTags,
            gibbs,
            medicationId,
          })
        }
        onUnallocate={() => handlers.onUnallocate(block.id)}
      />
    </div>
  );
}

export function ReviewPanel({
  blocks,
  corrections = [],
  pageDateRaw,
  pageCount = 1,
  gibbsByRawText,
  shift,
  selectedShiftId,
  onSelectShift,
  known = { medications: [], tagLabels: [] },
  handlers,
}: {
  blocks: NoteBlock[];
  corrections?: string[];
  pageDateRaw?: string | null;
  pageCount?: number;
  /** Gibbs splits from the parse, keyed by the block's verbatim text — the row doesn't hold them. */
  gibbsByRawText?: Record<string, Partial<Record<GibbsStage, string>>>;
  shift?: ShiftResolution;
  selectedShiftId?: string;
  onSelectShift?: (shiftId: string | undefined) => void;
  known?: KnownContext;
  handlers: ReviewHandlers;
}) {
  const toCheck = useMemo(
    () => blocks.filter((b) => b.status !== "ALLOCATED" && list(b.disputedWords).length > 0).length,
    [blocks],
  );
  const filed = blocks.filter((b) => b.status === "ALLOCATED").length;
  const wide = useWideScreen();

  const card = (b: NoteBlock, i: number) => (
    <BlockCard
      block={b}
      index={i}
      handlers={handlers}
      gibbs={gibbsByRawText?.[b.rawText]}
      known={known}
    />
  );

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          {blocks.length} block{blocks.length === 1 ? "" : "s"} from {pageCount} page
          {pageCount === 1 ? "" : "s"}
        </span>
        {/* Shown exactly as written — the app resolves the year, the model never invents one (P8). */}
        {pageDateRaw && <span>date on page: “{pageDateRaw}”</span>}
        {toCheck > 0 && <span className="font-medium text-amber-700">{toCheck} to check</span>}
        {filed > 0 && <span className="font-medium text-primary-700">{filed} filed</span>}
      </div>

      {corrections.length > 0 && (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          <span className="font-medium">Spell-checked:</span>{" "}
          {corrections.map((c) => {
            const [from, to] = c.split("|");
            return (
              <span key={c} className="mr-2 whitespace-nowrap">
                <span className="line-through opacity-60">{from}</span> → {to}
              </span>
            );
          })}
        </p>
      )}

      {shift && (
        <div className="mt-3">
          <ShiftBar
            resolution={shift}
            selectedShiftId={selectedShiftId}
            onSelect={onSelectShift ?? (() => {})}
          />
        </div>
      )}

      {/* Lanes on a wide screen (P35), the list everywhere else. Switched in JS rather than with
          a CSS breakpoint so only ONE copy of each card is ever mounted — two would each hold
          their own edit state and quietly diverge. */}
      {wide ? (
        <LaneBoard
          blocks={blocks}
          onMove={(id, target) => void handlers.onEdit(id, { targetType: target })}
          renderBlock={card}
        />
      ) : (
        <ul className="mt-3 space-y-3">
          {blocks.map((b, i) => (
            <li key={b.id}>{card(b, i)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
