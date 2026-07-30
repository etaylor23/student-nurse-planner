import { useMemo, useState } from "react";
import {
  NOTE_BLOCK_KIND_LABEL,
  NOTE_BLOCK_TARGET_LABEL,
  type NoteBlockKind,
  type NoteBlockTarget,
} from "../../../domain/types";
import type { ParseResponse, ParsedBlockView } from "../../../data/api/parseClient";
import { seedProficiencies } from "../../../data/seed/proficiencies";
import type { ShiftResolution } from "../../../logic/captureShift";
import { ShiftBar } from "./ShiftBar";

/**
 * Review a parsed capture (spec-note-capture.md P35).
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

function BlockCard({ block, index }: { block: ParsedBlockView; index: number }) {
  const [kind, setKind] = useState<string>(block.kind);
  const [text, setText] = useState(block.text);
  const [tags, setTags] = useState(block.tags);
  const [codes, setCodes] = useState(block.candidateCodes);
  const [showAllCodes, setShowAllCodes] = useState(false);
  // A disputed word is resolved by choosing a reading — after that it stops being a question.
  const [resolved, setResolved] = useState<Record<string, string>>({});

  const openDisputes = block.disputedWords.filter((p) => !resolved[p]);
  const target = block.targetType as NoteBlockTarget | undefined;

  function chooseReading(pair: string, chosen: string, other: string) {
    setResolved((r) => ({ ...r, [pair]: chosen }));
    // Swap the word in the text too, or "choosing" would be a label with no effect.
    setText((t) => t.replace(new RegExp(`(^|\\W)${other}(?=\\W|$)`, "g"), `$1${chosen}`));
  }

  return (
    <li
      className={`rounded-xl border p-3 ${
        openDisputes.length > 0 ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
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
        rows={Math.min(10, Math.max(2, Math.ceil(text.length / 60)))}
        className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2 text-sm leading-relaxed text-ink-900"
        aria-label={`Text of block ${index + 1}`}
      />

      {openDisputes.length > 0 && (
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

      {(target || block.medicationCandidate) && (
        <Section label="Will file as">
          <p className="text-sm text-slate-700">
            {target ? NOTE_BLOCK_TARGET_LABEL[target] : "Not decided"}
            {block.medicationCandidate && (
              <span className="text-slate-500"> · {block.medicationCandidate}</span>
            )}
          </p>
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
                <RemoveButton
                  label={`Remove tag ${t}`}
                  onClick={() => setTags((v) => v.filter((x) => x !== t))}
                />
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
                <RemoveButton
                  label={`Remove proficiency ${c}`}
                  onClick={() => setCodes((v) => v.filter((x) => x !== c))}
                />
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

      {block.gibbs && (
        <Section label="Reflection stages found">
          <p className="text-xs text-slate-600">
            {Object.keys(block.gibbs)
              .map((k) => k.replace("_", " ").toLowerCase())
              .join(", ")}
          </p>
        </Section>
      )}
    </li>
  );
}

export function ReviewPanel({
  parsed,
  shift,
  selectedShiftId,
  onSelectShift,
}: {
  parsed: ParseResponse[];
  shift?: ShiftResolution;
  selectedShiftId?: string;
  onSelectShift?: (shiftId: string | undefined) => void;
}) {
  const blocks = useMemo(() => parsed.flatMap((p) => p.blocks), [parsed]);
  const corrections = useMemo(() => parsed.flatMap((p) => p.corrections), [parsed]);
  const toCheck = blocks.filter((b) => b.disputedWords.length > 0).length;
  const pageDate = parsed[0]?.pageDateRaw;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          {blocks.length} block{blocks.length === 1 ? "" : "s"} from {parsed.length} page
          {parsed.length === 1 ? "" : "s"}
        </span>
        {/* Shown exactly as written — the app resolves the year, the model never invents one (P8). */}
        {pageDate && <span>date on page: “{pageDate}”</span>}
        {toCheck > 0 && <span className="font-medium text-amber-700">{toCheck} to check</span>}
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
          <BlockCard key={`${b.text.slice(0, 24)}-${i}`} block={b} index={i} />
        ))}
      </ul>

      <p className="mt-3 text-center text-xs text-slate-400">
        Filing these into your records is the next piece — not built yet.
      </p>
    </div>
  );
}
