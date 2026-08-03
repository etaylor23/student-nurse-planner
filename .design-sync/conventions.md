# Building with PlaceMate

PlaceMate is a placement companion for UK student nurses. Tone throughout is
encouraging and never nagging: it offers a next step, it doesn't chase. Copy says
"your PAD stays the official record" — the app supports the student's record, it
never claims to be it.

## Setup

Components are plain React with Tailwind classes — there is no theme provider and
nothing to configure. Two real requirements:

1. **Wrap the tree in a react-router router.** `Tabs`, `NudgeList`, `LogList`,
   `PlacementBreakdown` and `PlacementPalette` render `<Link>`/`<NavLink>` and throw
   outside one. Anything else works standalone.
2. **Serve `/placemate-mark.svg` from the host app root.** `Logo` (and the
   `AppErrorFallback` / `StorageBlockedScreen` screens that embed it) loads the mark
   by absolute path. Without that file the mark is a broken image and only the
   "placemate" wordmark renders.

```jsx
import { MemoryRouter } from "react-router-dom";
<MemoryRouter><App /></MemoryRouter>
```

## Styling: Tailwind utilities plus exported class tokens

Style with Tailwind utility classes. Do **not** hand-roll buttons, inputs or card
surfaces — the design system exports them as class strings, and using them is what
keeps a new screen on-brand:

| Export | Use for |
|---|---|
| `card` | the white rounded surface every widget sits on |
| `inputCls` | text inputs, selects, textareas |
| `btnPrimary` | the main action (emerald) |
| `btnSecondary` | an action alongside the main one (NHS blue) |
| `btnGhost` / `btnGhostSm` | secondary and compact actions |
| `link` | inline links inside body copy |

```jsx
import { Panel, btnPrimary, inputCls } from "<this design system>";

<Panel step="1" title="Add your hours" hint="Breaks are deducted automatically">
  <input className={inputCls} defaultValue="07:30" />
  <button className={btnPrimary}>Save shift</button>
</Panel>
```

### Colour families

Three brand ramps, plus Tailwind's own `slate-*` and `emerald-*` (pinned to the same
values as `primary-*`). Every `bg-`, `text-`, `border-`, `ring-`, `divide-`,
`outline-`, `fill-`, `stroke-`, `from-` and `to-` prefix works, with `hover:`
variants:

- **`primary-50 … primary-900`** — emerald. The lead: CTAs, active states, progress,
  success, step badges.
- **`secondary-50 … secondary-900`** — NHS blue. Trust: links, info, second-rank
  buttons.
- **`accent-50 … accent-700`** — coral. Warmth, used *sparingly* — self-care, gentle
  nudges, "worth a check". **Stops at 700; there is no `accent-800`/`accent-900`.**
- **`text-ink`** — off-black body text (`#16212f`), never pure black. It is the
  default on `body`, so you rarely set it explicitly.

Neutrals are `slate-*` throughout (`text-slate-500` for secondary copy,
`text-slate-400` for hints, `ring-slate-200/70` for hairlines).

## Layout recipe

The canonical feature page — hero, then a grid of panels:

```jsx
<div className="space-y-6">
  <PageHero eyebrow="Your progress" title="Placement hours" subtitle="…" aside={…} />
  <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
    <div className="min-w-0 space-y-6">
      <Panel step="1" title="…">…</Panel>
      <Panel step="2" title="…">…</Panel>
    </div>
    <Panel title="…" className="xl:col-span-2">…</Panel>
  </div>
</div>
```

Always start grids at `grid-cols-1` and give multi-column wrappers `min-w-0`, or a
wide child (a table, a long drug name) forces page overflow.

## Where the truth lives

- The design system's `styles.css` and the `_ds_bundle.css` it imports hold every
  token and utility — read them before inventing a class name.
- Each component's `.d.ts` is its real prop contract, and its `.prompt.md` carries
  the usage notes and examples. Prefer those over guessing from a name.
