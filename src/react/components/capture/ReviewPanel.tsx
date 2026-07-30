import { useMemo, useState } from "react";
import { NOTE_BLOCK_KIND_LABEL, type NoteBlockKind } from "../../../domain/types";
import type { ParseResponse, ParsedBlockView } from "../../../data/api/parseClient";
import { seedProficiencies } from "../../../data/seed/proficiencies";

/**
 * Review a parsed capture (spec-note-capture.md P35).
 *
 * **Mobile list is the primary layout, by decision** — students photograph notes on a phone,
 * so the list is the experience that has to be good and the wide-screen lanes are the
 * enhancement. This is the list; lanes come later.
 *
 * Two things are deliberately visible rather than hidden:
 *  - **disputed words** (P22), with both readings, because model disagreement is the only
 *    uncertainty signal that tracked correctness — self-reported confidence was worthless;
 *  - **sanitiser corrections** (P24), because `rawText` is frozen precisely so every
 *    correction stays inspectable.
 *
 * Nothing here writes to the student's record. Allocation is the next step (P4) and is
 * deliberately absent until this screen is judged worth allocating from.
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

/** Code → statement, so a shortlist shows what it actually means rather than "B2.1". */
const STATEMENTS = new Map(seedProficiencies.map((p) => [p.code, p.statement]));

function DisputedWord({ pair }: { pair: string }) {
  const [structure, check] = pair.split("|");
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">
      <span className="font-medium">{structure}</span>
      <span className="text-amber-500">or</span>
      <span>{check}</span>
    </span>
  );
}

function BlockCard({ block, index }: { block: ParsedBlockView; index: number }) {
  const [kind, setKind] = useState<string>(block.kind);
  const [text, setText] = useState(block.text);
  const [showCodes, setShowCodes] = useState(false);
  const disputed = block.disputedWords.length > 0;

  return (
    <li
      className={`rounded-xl border p-3 ${
        disputed ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
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
        {block.targetType && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            → {block.targetType.replace("_", " ").toLowerCase()}
          </span>
        )}
        {block.groupKey && (
          <span className="text-xs text-slate-400" title="Blocks sharing this belong together">
            group {block.groupKey}
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(8, Math.max(2, text.split("\n").length))}
        className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2 text-sm text-ink-900"
        aria-label={`Text of block ${index + 1}`}
      />

      {disputed && (
        <div className="mt-2">
          <p className="text-xs font-medium text-amber-900">
            Worth a check — the two readings differ:
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {block.disputedWords.map((p) => (
              <DisputedWord key={p} pair={p} />
            ))}
          </div>
        </div>
      )}

      {block.medicationCandidate && (
        <p className="mt-2 text-xs text-slate-500">
          Medication: <span className="text-slate-700">{block.medicationCandidate}</span>
        </p>
      )}

      {block.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {block.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-secondary-50 px-2 py-0.5 text-xs text-secondary-700"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {block.candidateCodes.length > 0 && (
        <div className="mt-2">
          {/* The top code is pre-selected and the rest are one tap away (P28) — the shortlist
              IS the uncertainty signal, so it must be visible, not buried. */}
          <button
            type="button"
            onClick={() => setShowCodes((v) => !v)}
            className="text-xs font-medium text-secondary-700 hover:underline"
          >
            {block.candidateCodes[0]} —{" "}
            {STATEMENTS.get(block.candidateCodes[0])?.slice(0, 70) ?? "?"}…
            {block.candidateCodes.length > 1 && ` (+${block.candidateCodes.length - 1} more)`}
          </button>
          {showCodes && (
            <ul className="mt-1 space-y-1">
              {block.candidateCodes.slice(1).map((c) => (
                <li key={c} className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{c}</span> —{" "}
                  {STATEMENTS.get(c)?.slice(0, 80) ?? "?"}…
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {block.gibbs && (
        <p className="mt-2 text-xs text-slate-500">
          Gibbs stages found: {Object.keys(block.gibbs).join(", ").toLowerCase()}
        </p>
      )}
    </li>
  );
}

export function ReviewPanel({ parsed }: { parsed: ParseResponse[] }) {
  const blocks = useMemo(() => parsed.flatMap((p) => p.blocks), [parsed]);
  const corrections = useMemo(() => parsed.flatMap((p) => p.corrections), [parsed]);
  const disputedCount = blocks.filter((b) => b.disputedWords.length > 0).length;
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
        {disputedCount > 0 && <span className="text-amber-700">{disputedCount} to check</span>}
      </div>

      {corrections.length > 0 && (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          Spell-checked:{" "}
          {corrections.map((c) => {
            const [from, to] = c.split("|");
            return (
              <span key={c} className="mr-2">
                <span className="line-through opacity-60">{from}</span> → {to}
              </span>
            );
          })}
        </p>
      )}

      <ul className="mt-3 space-y-2">
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
