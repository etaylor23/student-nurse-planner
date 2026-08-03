import { LogList, Panel, btnGhostSm, btnPrimary, inputCls } from "student-nurse-planner";

/** A titled card with a short hint — the default way to box a widget. */
export function Basic() {
  return (
    <Panel title="Recent check-ins" hint="Private to you, on this device">
      <ul className="divide-y divide-slate-100 text-sm">
        {[
          ["Tuesday", "Long day on Ward 9 — tiring but the handover went well."],
          ["Sunday", "Felt out of my depth on the drug round. Asked for a second check."],
          ["Friday", "Good shift. First time cannulating unsupervised."],
        ].map(([day, note]) => (
          <li key={day} className="py-2.5">
            <span className="font-medium text-slate-700">{day}</span>
            <p className="mt-0.5 text-slate-500">{note}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Numbered step badges turn a page into an obvious 1 → 2 → 3 flow without
 * extra copy — the pattern the feature pages are built from.
 */
export function SteppedFlow() {
  return (
    <div className="space-y-4">
      <Panel step="1" title="Pick a placement" hint="Which ward was this shift on?">
        <select className={inputCls} defaultValue="ward-9">
          <option value="ward-9">Ward 9 — Acute Medical Unit</option>
          <option value="ed">Emergency Department</option>
        </select>
      </Panel>
      <Panel step="2" title="Add your hours" hint="Breaks are deducted automatically">
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} defaultValue="07:30" aria-label="Start" />
          <input className={inputCls} defaultValue="20:00" aria-label="End" />
        </div>
      </Panel>
      <Panel step="3" title="Anything worth reflecting on?" hint="You can always come back to this">
        <button className={btnPrimary}>Save shift</button>
      </Panel>
    </div>
  );
}

/** The action slot sits on the right of the header, clear of the title. */
export function WithAction() {
  return (
    <Panel
      title="Timesheet"
      hint="Export what you've logged for your practice assessor"
      action={<button className={btnGhostSm}>Download CSV</button>}
    >
      <p className="text-sm text-slate-500">
        31 shifts across 3 placements, totalling 418 hours. Your PAD stays the official record —
        this is your copy of it.
      </p>
    </Panel>
  );
}

/**
 * `eyebrow` promotes a panel to a named chapter of the page — the same eyebrow voice
 * the larger headings use, so a panel can head a section without inventing a second
 * heading style. This is the "Your record" chapter on Home.
 */
export function AsAChapter() {
  return (
    <Panel
      eyebrow="Your record"
      title="Activity"
      hint="Your most recent captures"
      action={<button className={btnGhostSm}>See full audit log</button>}
    >
      <LogList
        showLabel
        items={[
          {
            id: "1",
            userId: "u1",
            createdAt: "2026-07-22T15:14:00.000Z",
            entityType: "SHIFT",
            entityId: "e-1",
            entityLabel: "B2.4",
            action: "PROFICIENCY_SIGNED_OFF",
            summary: "B2.4 signed off",
          },
          {
            id: "2",
            userId: "u1",
            createdAt: "2026-07-22T15:12:00.000Z",
            entityType: "SHIFT",
            entityId: "e-2",
            entityLabel: "Venepuncture and cannulation",
            action: "SKILL_STAGE_CHANGED",
            summary: "Skill stage moved to Performed under supervision",
          },
        ]}
      />
    </Panel>
  );
}

/** Empty states use the same box, so a page never changes shape as it fills. */
export function EmptyState() {
  return (
    <Panel title="Reflections" hint="Nothing here yet">
      <p className="text-sm text-slate-400">
        No reflections yet — there&apos;s no wrong way to use this. Write one whenever it helps.
      </p>
    </Panel>
  );
}
