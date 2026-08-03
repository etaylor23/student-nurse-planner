import { MetricTile } from "student-nurse-planner";

/**
 * The three dimensions of "how far to registration?", side by side — the row that
 * heads the progress chapter on Home. `to` makes each tile the way into its detail
 * screen, so the summary is also the navigation.
 */
export function TowardRegistration() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricTile
        label="Practice hours"
        value="418 / 2,300 h"
        pct={18}
        caption="18% of the way there · ≈ 157 shifts to go"
        to="#hours"
      />
      <MetricTile
        label="NMC competencies"
        value="14 / 219 achieved"
        pct={6}
        caption="31 with evidence gathered"
        to="#competencies"
      />
      <MetricTile
        label="Clinical skills"
        value="22 / 84 signed off"
        pct={26}
        caption="a permanent record"
        to="#skills"
      />
    </div>
  );
}

/**
 * Day one. The bars are empty and the copy still says what's building rather than
 * what's missing — a zero is a starting line, never a deficit.
 */
export function AtTheStart() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricTile label="Practice hours" value="0 / 2,300 h" pct={0} caption="ready when you are" />
      <MetricTile label="NMC competencies" value="0 / 219 achieved" pct={0} caption="part 1 of 3" />
      <MetricTile
        label="Clinical skills"
        value="0 / 84 signed off"
        pct={0}
        caption="a permanent record"
      />
    </div>
  );
}

/**
 * Both optional parts dropped: no `pct` means no bar, and without `to` the tile is
 * static — for a number that isn't heading anywhere in particular.
 */
export function WithoutBarOrLink() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MetricTile label="This placement" value="31 shifts" caption="Ward 9 — Acute Medical Unit" />
      <MetricTile label="Longest shift" value="12.5 h" />
    </div>
  );
}

/** Nearly there — the bar clamps at 100 rather than overrunning its track. */
export function NearlyThere() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MetricTile
        label="Practice hours"
        value="2,284 / 2,300 h"
        pct={99}
        caption="99% of the way there · 2 shifts to go"
        to="#hours"
      />
      <MetricTile
        label="Clinical skills"
        value="84 / 84 signed off"
        pct={100}
        caption="all signed off — a permanent record"
        to="#skills"
      />
    </div>
  );
}
