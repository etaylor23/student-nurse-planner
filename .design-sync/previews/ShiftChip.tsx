import { ShiftChip } from "student-nurse-planner";

const shift = (id, date, shiftType) => ({
  id,
  userId: "u1",
  createdAt: `${date}T21:00:00.000Z`,
  updatedAt: `${date}T21:00:00.000Z`,
  placementId: "p1",
  date,
  shiftType,
  entryMode: "RAW",
  netHours: 11.5,
  isSimulated: false,
  status: "COMPLETED",
});

const CANDIDATES = [
  { shift: shift("s1", "2026-06-18", "LONG_DAY"), confidence: "DATE_MATCH" },
  { shift: shift("s2", "2026-06-16", "LONG_DAY"), confidence: "RECENT" },
  { shift: shift("s3", "2026-06-15", "NIGHT"), confidence: "RECENT" },
];

/**
 * The chip lives in the review screen's meta strip, and its panel opens as a
 * full-width line underneath — so it needs a flex row as its direct parent.
 */
function Strip({ children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        4 notes read
      </span>
      {children}
    </div>
  );
}

/** A date was read off the page and matched to a shift — stated as a match. */
export function Matched() {
  return (
    <Strip>
      <ShiftChip
        resolution={{ suggested: CANDIDATES[0], candidates: CANDIDATES, isFallback: false }}
        selectedShiftId="s1"
        onSelect={() => {}}
        pageDateRaw="18/6"
        open={false}
        onToggle={() => {}}
      />
    </Strip>
  );
}

/**
 * The distinction that matters: no date could be matched, so this is the most
 * recent shift and says so — flagged rather than dressed up as a match.
 */
export function FallbackGuess() {
  return (
    <Strip>
      <ShiftChip
        resolution={{ suggested: CANDIDATES[0], candidates: CANDIDATES, isFallback: true }}
        selectedShiftId="s1"
        onSelect={() => {}}
        open={false}
        onToggle={() => {}}
      />
    </Strip>
  );
}

/** Open: the reasoning and the alternates, one tap away from the chip. */
export function Open() {
  return (
    <Strip>
      <ShiftChip
        resolution={{ suggested: CANDIDATES[0], candidates: CANDIDATES, isFallback: true }}
        selectedShiftId="s1"
        onSelect={() => {}}
        open
        onToggle={() => {}}
      />
    </Strip>
  );
}

/** No shifts logged at all — the notes simply aren't attached to one. */
export function NoShifts() {
  return (
    <Strip>
      <ShiftChip
        resolution={{ candidates: [], isFallback: false }}
        onSelect={() => {}}
        open={false}
        onToggle={() => {}}
      />
    </Strip>
  );
}
