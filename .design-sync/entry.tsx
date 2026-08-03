/**
 * Design-system entry point for the claude.ai/design sync.
 *
 * PlaceMate is an application, not a published component library, so there is no
 * `dist/` library build for the converter to bundle. This barrel is that entry:
 * it re-exports the parts of `src/react/components` that are genuinely reusable
 * design vocabulary — the shared primitives and tokens from `ui.tsx` plus the
 * presentational components that render from props alone.
 *
 * Deliberately NOT exported: route pages and screens (PlannerPage, ProfilePage,
 * ReviewPanel, …), anything bound to RepositoryContext / ShiftsContext / Dexie,
 * and FeedbackButton (couples to Sentry). Those aren't parts a design agent
 * should compose new screens from.
 *
 * Keep this list in sync with `componentSrcMap` in `.design-sync/config.json` —
 * that map is what decides which of these get preview cards.
 */

// ── Class tokens: the styling vocabulary. Not components, but the design agent
// composes its own layout glue out of these, so they must be in the bundle.
export {
  card,
  inputCls,
  btnPrimary,
  btnSecondary,
  btnGhost,
  btnGhostSm,
  link,
  pillBase,
  pillNeutral,
  pillPrimary,
} from "../src/react/components/ui";

// ── Foundations
export { PageHero, SectionHeading, Panel, StatTile, MetricTile } from "../src/react/components/ui";
export type { EyebrowTone, HeadingSize } from "../src/react/components/ui";
export { Logo } from "../src/react/components/Logo";

// ── Navigation
export { Tabs } from "../src/react/components/Tabs";

// ── Feedback & status
export { NudgeList } from "../src/react/components/Nudge";
export { AttachEvidenceNudge } from "../src/react/components/AttachEvidenceNudge";
export { WorthACheck } from "../src/react/components/capture/WorthACheck";
export { AppErrorFallback, StorageBlockedScreen } from "../src/react/components/AppError";

// ── Data display
export { CaptureFlowDiagram } from "../src/react/components/home/CaptureFlowDiagram";
export type {
  CaptureFlowNode,
  CaptureFlowEnd,
} from "../src/react/components/home/CaptureFlowDiagram";
export { LogList } from "../src/react/components/LogList";
export { HoursSummaryPanel } from "../src/react/components/HoursSummaryPanel";
export { PlacementBreakdown } from "../src/react/components/PlacementBreakdown";
export { PlacementPalette } from "../src/react/components/PlacementPalette";

// ── Capture
export { ShiftChip } from "../src/react/components/capture/ShiftBar";
export { AllocateBar } from "../src/react/components/capture/AllocateBar";
export { ProficiencyPicker } from "../src/react/components/capture/ProficiencyPicker";

// ── Preview provider only. Several components render react-router <Link>/<NavLink>
// and throw outside a router. `cfg.provider` needs a component that is a bundle
// export, so it is re-exported here rather than imported by the harness.
export { MemoryRouter } from "react-router-dom";
