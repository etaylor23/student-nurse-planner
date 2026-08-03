import { StatTile } from "student-nurse-planner";

/** The compact stat used across hero blocks and summary panels. */
export function Default() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile dot="bg-primary-500" label="Practice hours" value="418 h" sub="of 2300" />
      <StatTile dot="bg-secondary-500" label="Simulated" value="62 h" sub="538 h headroom" />
      <StatTile dot="bg-accent-500" label="Self-care" value="9" sub="check-ins this month" />
    </div>
  );
}

/** The dot is optional — drop it when the tiles aren't colour-coded. */
export function WithoutDot() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile label="Shifts logged" value="31" sub="across 3 placements" />
      <StatTile label="Reflections" value="6" />
      <StatTile label="Proficiencies" value="14 / 22" sub="evidenced" />
    </div>
  );
}

/** Values are strings, so units, ratios and dates all sit in the same tile. */
export function ValueShapes() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile dot="bg-primary-500" label="On pace for" value="14 Jun" sub="at 24 h/week" />
      <StatTile dot="bg-secondary-500" label="Longest shift" value="12.5 h" />
      <StatTile dot="bg-accent-500" label="Medications" value="24" sub="logged on shift" />
    </div>
  );
}
