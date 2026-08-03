import { PageHero, StatTile, btnPrimary } from "student-nurse-planner";

/**
 * The canonical page hero, ported from HoursSummaryPanel — an eyebrow, title
 * and subtitle on the left, a headline metric on the right.
 */
export function WithMetric() {
  return (
    <PageHero
      eyebrow="Your progress"
      title="Placement hours"
      subtitle="Counting toward 2300 practice hours. Your PAD stays the official record."
      aside={
        <>
          <div className="text-3xl font-semibold tabular-nums tracking-tight text-ink">
            418<span className="text-lg font-normal text-slate-400"> / 2300 h</span>
          </div>
          <div className="text-sm font-medium text-emerald-600">18% complete</div>
        </>
      }
    />
  );
}

/** Hero with content underneath — a progress bar and supporting stats. */
export function WithProgress() {
  return (
    <PageHero
      eyebrow="Ward 9 — Acute Medical Unit"
      title="Placement 3 of 6"
      subtitle="12 January – 20 March. Sign-offs due before your final interview."
      aside={
        <>
          <div className="text-3xl font-semibold tabular-nums tracking-tight text-ink">31</div>
          <div className="text-sm text-slate-400">shifts logged</div>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>Proficiencies evidenced</span>
            <span className="tabular-nums">14 of 22</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[64%] rounded-full bg-primary-600" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile dot="bg-primary-500" label="This week" value="37.5 h" sub="3 shifts" />
          <StatTile
            dot="bg-secondary-500"
            label="Reflections"
            value="6"
            sub="2 awaiting sign-off"
          />
          <StatTile dot="bg-accent-500" label="Medications" value="24" sub="logged on shift" />
        </div>
      </div>
    </PageHero>
  );
}

/**
 * `asideBlock` swaps the right-aligned headline number for a panel of its own — Home
 * uses it to make the hero's aside the one next action rather than a statistic. The
 * CTA is `self-start`, so it stays button-sized instead of stretching the card.
 */
export function WithAsideBlock() {
  return (
    <PageHero
      eyebrow="Today"
      title="Hi, Ellis"
      subtitle="Your day at a glance — pick up where you left off, and capture as you go."
      asideBlock
      aside={
        <div className="flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 sm:min-w-[19rem]">
          <span className="text-xs font-medium text-slate-500">Next shift</span>
          <p className="mt-1 text-sm font-medium text-ink">Tomorrow, Tue 4 Aug</p>
          <p className="text-xs text-slate-400">Ward 9 — Acute Medical · 07:30–19:30</p>
          <button className={`${btnPrimary} mt-3 self-start`}>Open in planner</button>
        </div>
      }
    />
  );
}

/** `eyebrowTone` switches the eyebrow to NHS blue for progress-over-time screens. */
export function BlueEyebrow() {
  return (
    <PageHero
      eyebrow="Toward registration"
      eyebrowTone="secondary"
      title="You're in part 2 of 3"
      subtitle="Every shift you capture builds toward the NMC register. Your PAD stays the official record."
    />
  );
}

/** The minimum: a title on its own. Everything else is optional. */
export function TitleOnly() {
  return <PageHero title="Self-care" />;
}
