import { HoursSummaryPanel } from "student-nurse-planner";

const TARGET = 2300;
const CAP = 600;

/** Build a complete HoursSummary — the component reads every field. */
const summary = (practiceHours, simulatedHours, plannedHours) => ({
  practiceHours,
  simulatedHours,
  remainingHours: Math.max(0, TARGET - practiceHours),
  simulatedRemaining: CAP - simulatedHours,
  simulatedCapReached: simulatedHours >= CAP,
  plannedHours,
  progressFraction: Math.min(1, practiceHours / TARGET),
  targetHours: TARGET,
  simulatedCap: CAP,
});

/** Early on — under the first milestone, with a pace to project from. */
export function InProgress() {
  return (
    <HoursSummaryPanel
      summary={summary(418, 62, 96)}
      projection={{ shiftsToGo: 157, perWeek: 24.5, finishDate: "2028-03-14" }}
    />
  );
}

/** Nothing completed yet, so there's no pace and no projection. */
export function NoProjection() {
  return <HoursSummaryPanel summary={summary(0, 0, 37.5)} />;
}

/** Past three-quarters, and the 600-hour simulated cap has been reached. */
export function SimulatedCapReached() {
  return (
    <HoursSummaryPanel
      summary={summary(1794, 600, 150)}
      projection={{ shiftsToGo: 44, perWeek: 28, finishDate: "2027-02-02" }}
    />
  );
}

/** Target met — the milestone note switches to the celebration. */
export function TargetMet() {
  return (
    <HoursSummaryPanel
      summary={summary(2312, 480, 0)}
      projection={{ shiftsToGo: 0, perWeek: 26.2, finishDate: null }}
    />
  );
}
