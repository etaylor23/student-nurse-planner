import { useState } from "react";

/**
 * Link a medication block to one of the student's own cards, or offer to create one (P33).
 *
 * The classifier returns a drug NAME, never an id — so the match happens here, where the
 * student's cards actually are. A name match is applied automatically because it is the same
 * drug; anything else is an offer, because creating a card silently would fill their
 * medications list with things they never asked for.
 *
 * Declining is a real option: the `MedicationLog` still gets filed, just unlinked (P33).
 */
export function MedicationOffer({
  candidate,
  medications,
  linkedId,
  onLink,
  onCreate,
}: {
  /** The drug name the classifier read off the page. */
  candidate: string;
  medications: { id: string; name: string }[];
  linkedId?: string;
  onLink: (medicationId: string | undefined) => void;
  /** Creates the card and returns its id, so filing can link to it straight away. */
  onCreate: (name: string) => Promise<string | undefined>;
}) {
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string>();

  const match = medications.find((m) => m.name.toLowerCase() === candidate.toLowerCase());
  const linked = medications.find((m) => m.id === linkedId) ?? match;

  async function create() {
    setBusy(true);
    setError(undefined);
    const id = await onCreate(candidate);
    setBusy(false);
    if (id) onLink(id);
    else setError("Couldn't add that card. The note will file without it.");
  }

  if (linked) {
    return (
      <p className="mt-1 text-xs text-slate-600">
        Linked to your <span className="font-medium">{linked.name}</span> card.{" "}
        <button
          type="button"
          onClick={() => onLink(undefined)}
          className="text-slate-400 hover:text-slate-600 hover:underline"
        >
          Unlink
        </button>
      </p>
    );
  }

  if (declined) {
    return (
      <p className="mt-1 text-xs text-slate-400">
        No card, so the note files on its own.{" "}
        <button
          type="button"
          onClick={() => setDeclined(false)}
          className="text-secondary-700 hover:underline"
        >
          Change my mind
        </button>
      </p>
    );
  }

  return (
    <div className="mt-1">
      <p className="text-xs text-slate-600">
        You don&apos;t have a card for <span className="font-medium">{candidate}</span> yet. Add
        one? Your note becomes its first set of notes.
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="rounded-lg border border-secondary-300 bg-white px-2 py-0.5 text-xs font-medium text-secondary-800 hover:bg-secondary-50 disabled:opacity-50"
        >
          {busy ? "Adding…" : `Add ${candidate}`}
        </button>
        <button
          type="button"
          onClick={() => setDeclined(true)}
          className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
        >
          No thanks
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
