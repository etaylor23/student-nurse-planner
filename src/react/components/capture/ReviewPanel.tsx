import { useMemo, useState } from "react";
import { NOTE_BLOCK_KIND_LABEL, type NoteBlockKind } from "../../../domain/types";
import type { GibbsStage, NoteBlock, NoteBlockTarget } from "../../../domain/types";
import { seedProficiencies } from "../../../data/seed/proficiencies";
import type { ShiftResolution } from "../../../logic/captureShift";
import { AllocateBar } from "./AllocateBar";
import { ShiftBar } from "./ShiftBar";

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

export interface ReviewHandlers {
  onEdit: (blockId: string, patch: BlockPatch) => Promise<void>;
  onAllocate: (
    blockId: string,
    opts: {
      targetType: NoteBlockTarget;
      proficiencyId?: string;
      tags?: string[];
      gibbs?: Partial<Record<GibbsStage, string>>;
    },
  ) => Promise<{ ok: true; label: string } | { ok: false; message: string }>;
  onUnallocate: (blockId: string) => Promise<{ warning?: string }>;
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
}: {
  block: NoteBlock;
  index: number;
  handlers: ReviewHandlers;
  gibbs?: Partial<Record<GibbsStage, string>>;
}) {
  const [text, setText] = useState(block.text);
  const [tags, setTags] = useState(() => list(block.suggestedTags));
  const [codes, setCodes] = useState(() => list(block.candidateCodes));
  const [showAllCodes, setShowAllCodes] = useState(false);
  // A disputed word is resolved by choosing a reading — after that it stops being a question.
  const [resolved, setResolved] = useState<Record<string, true>>({});

  const openDisputes = list(block.disputedWords).filter((p) => !resolved[p]);
  const allocated = block.status === "ALLOCATED";
  const proficiencyId = codes[0] ? ID_FOR_CODE.get(codes[0]) : undefined;

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

  return (
    <li
      className={`rounded-xl border p-3 ${
        allocated
          ? "border-primary-200 bg-primary-50/30"
          : openDisputes.length > 0
            ? "border-amber-300 bg-amber-50/30"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
        <select
          value={block.kind}
          onChange={(e) =>
            void handlers.onEdit(block.id, { kind: e.target.value as NoteBlockKind })
          }
          disabled={allocated}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-60"
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
        value={text}
        onChange={(e) => setText(e.target.value)}
        // Persisted on blur rather than per keystroke: one write per edit, not one per letter.
        onBlur={() => {
          if (text !== block.text) void handlers.onEdit(block.id, { text });
        }}
        disabled={allocated}
        rows={Math.min(10, Math.max(2, Math.ceil(text.length / 60)))}
        className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2 text-sm leading-relaxed text-ink-900 disabled:bg-slate-50 disabled:text-slate-500"
        aria-label={`Text of block ${index + 1}`}
      />

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
        </Section>
      )}

      {tags.length > 0 && (
        <Section label="Tags">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-full bg-secondary-50 py-0.5 pl-2 pr-0.5 text-xs text-secondary-800"
              >
                {t}
                {!allocated && (
                  <RemoveButton label={`Remove tag ${t}`} onClick={() => dropTag(t)} />
                )}
              </span>
            ))}
          </div>
        </Section>
      )}

      {codes.length > 0 && (
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
        </Section>
      )}

      <AllocateBar
        block={block}
        proficiencyId={proficiencyId}
        tags={tags}
        gibbs={gibbs}
        onAllocate={(targetType) =>
          handlers.onAllocate(block.id, { targetType, proficiencyId, tags, gibbs })
        }
        onUnallocate={() => handlers.onUnallocate(block.id)}
      />
    </li>
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
  handlers: ReviewHandlers;
}) {
  const toCheck = useMemo(
    () => blocks.filter((b) => b.status !== "ALLOCATED" && list(b.disputedWords).length > 0).length,
    [blocks],
  );
  const filed = blocks.filter((b) => b.status === "ALLOCATED").length;

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

      <ul className="mt-3 space-y-3">
        {blocks.map((b, i) => (
          <BlockCard
            key={b.id}
            block={b}
            index={i}
            handlers={handlers}
            gibbs={gibbsByRawText?.[b.rawText]}
          />
        ))}
      </ul>
    </div>
  );
}
