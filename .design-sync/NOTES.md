# design-sync notes — PlaceMate

Repo-specific gotchas for future syncs. Read this before re-running.

## Shape: this is an app, not a component library

- No Storybook, no library build, no published `.d.ts`. `package.json` `main` points
  at a non-existent `index.js`; `dist/` is the Vite SPA, not a component entry.
- `.design-sync/entry.tsx` is a **hand-maintained barrel** — it *is* the design
  system's boundary. It re-exports the reusable parts of `src/react/components` plus
  the `ui.tsx` class tokens, and also re-exports `MemoryRouter` purely so
  `cfg.provider` has a bundle export to wrap previews in.
- **Adding a component means editing two files**: the barrel *and* `componentSrcMap`
  in `config.json`. The map is what decides the card list (with no shipped `.d.ts`,
  pinned entries *are* the component list); the barrel is what puts it in the bundle.

## Sync 2 (3 Aug 2026) — the home-redesign vocabulary, and drift repaired

`spec/landing-page-rebuild/spec-home-redesign.md` needed shared parts rather than
page-local markup, so this sync added four:

- `SectionHeading` — the one eyebrow + title + subtitle + action row, at three sizes
  (`page` / `section` / `panel`). `PageHero` and `Panel` now both render through it,
  which is why their `.d.ts` changed: `PageHero` gained `eyebrowTone` + `asideBlock`,
  `Panel` gained `eyebrow` + `eyebrowTone` and its `hint` widened to `ReactNode`.
  Its `HomeChapters` preview cell composes the **whole redesigned Home** out of DS
  parts — that cell is the spec's page order, so keep it in step with the page.
- `MetricTile` — label + value + thin bar + caption, optionally a link. Promoted from
  the private `Meter` inside `RegistrationProgress`.
- `CaptureFlowDiagram` — the mindmap SVG, extracted from `MindmapBand` to pure props
  so the full and collapsed bands share it. Lands in a new `home` group. Its marker id
  comes from `useId()`, so two on a page don't collide.
- `pillBase` / `pillNeutral` / `pillPrimary` — header pill geometry (decision 13).

**Drift found and fixed on the way in** (exactly the risk flagged at the bottom of
this file): `LaneBoard` had been deleted from `src/` and `ShiftBar` renamed to
`ShiftChip` since sync 1, so the tsc types step failed. `LaneBoard` was dropped from
the barrel, `componentSrcMap` and the previews; `ShiftBar` was renamed throughout, and
its preview fixture gained the now-required `open`/`onToggle` props (it would have
rendered blank without them). Both old component dirs and `_preview/*.js` were deleted
from the remote project. **If a future sync's types step fails, suspect this first** —
the barrel is hand-maintained and does not follow renames.

## Deliberately excluded

- Route pages and screens (`PlannerPage`, `ProfilePage`, `ReviewPanel`,
  `ProficiencyDetailPage`, …) — bound to `RepositoryContext` / `ShiftsContext` /
  Dexie / auth, and not parts a design agent should compose new screens from.
- `FeedbackButton` — imports `@sentry/react`, which is app plumbing and would pull
  Sentry into the bundle.
- `guidelinesGlob` is set to `[]` **on purpose**. The only `docs/*.md` match was
  `accessibility-aaa-audit.md`, which is explicitly scoped to the *marketing site*
  and says the app is out of scope — shipping it would mislead the design agent.
  Note `docs/runbooks/beta-recipients.md` contains real beta students' details and
  must never reach a design project. Don't widen this glob without checking.

## Build pipeline (`cfg.buildCmd`) — three steps, all required

1. `npx tsc -p .design-sync/tsconfig.types.json` → emits real declarations to
   `dist/types/`. **Without this every `<Name>Props` degrades to
   `[key: string]: unknown`** and the design agent gets no API to code against.
2. `echo 'export * from "./dist/types/.design-sync/entry";' > index.d.ts` → the
   converter's `projectFor()` looks for the types entry at `<pkgDir>/index.d.ts`
   (not at the types root), so this root shim is what makes step 1 visible to it.
   Gitignored.
3. `tailwindcss -i .design-sync/ds.css -o .design-sync/.cache/ds.css` → the DS
   stylesheet. See below.

`npm run build` is **not** part of it — nothing in the sync needs the SPA bundle, and
`vite build` empties `dist/`, which would delete `dist/types`. If you do run it, run
the type step afterwards.

### Extra dependency the standard setup misses

`buildCmd` step 3 uses `./.ds-sync/node_modules/.bin/tailwindcss`. The skill's staged
install line only installs `esbuild ts-morph @types/react`, so on a fresh clone also:

```
cd .ds-sync && npm i @tailwindcss/cli@4.3.1
```

Keep it pinned to the repo's own `tailwindcss` version.

## Why `.design-sync/ds.css` exists (do not point `cssEntry` back at the app CSS)

Tailwind only emits utilities it finds in the sources it scans, so the app's compiled
`dist/assets/*.css` contains exactly the classes PlaceMate happens to use today —
`bg-accent-500` was genuinely missing, and the accent dot in a preview rendered
invisible. Any class absent from the shipped stylesheet renders unstyled in **every
design built from this system**, so `ds.css` re-imports `src/index.css` verbatim and
safelists the full brand ramp via `@source inline(...)`.

- `accent` legitimately stops at **700** — `accent-800`/`accent-900` are not defined
  in `brand-palette.css`, so those utilities don't resolve. `conventions.md` says so.
- `cfg.tokensGlob` was tried and removed: `copyTokens()` returns early unless
  `tokensPkg` is set, so it only works for a tokens package in `node_modules`. The
  tokens ship inside `_ds_bundle.css` anyway.

## Known limitation: the logo mark 404s

`Logo` renders `<img src="/placemate-mark.svg">` — an absolute path served by the host
app. The design system doesn't ship that asset and the approved upload plan has no
glob for a root-level `.svg`, so the mark is a broken image in `Logo`,
`AppErrorFallback` and `StorageBlockedScreen`. The wordmark still renders.
The `MarkOnly` preview cell was **removed** because it was nothing but broken boxes.
Fixes, in order of preference: inline the mark as an SVG in `Logo.tsx`, or add
`placemate-mark.svg` to the upload plan's writes and confirm it resolves at the
project root.

## Verification was done by hand, not by the render harness

Playwright/chromium was **not installed** (user declined the ~200 MB download), so
`package-validate.mjs` ran with `--no-render-check` and `package-capture.mjs` never
ran — there are no `_screenshots/`, no `.render-check.json`, and no
`.design-sync/.cache/review/*.grade.json`.

Instead every one of the 18 components was served locally
(`node .ds-sync/storybook/http-serve.mjs ./ds-bundle`) and inspected in a browser,
plus a DOM sweep over `.review.html` confirming no card has an empty root. If a
future sync installs playwright, expect a **full re-grade** — nothing carries forward
from this run except the uploaded `_ds_sync.json` anchor.

Two real bugs that sweep caught, worth knowing about:

- **Fixtures must satisfy the whole interface.** `HoursSummaryPanel` threw and
  rendered blank in all four cells because the fixture omitted `progressFraction`,
  `targetHours` and `simulatedCap`. `Shift` likewise requires `isSimulated`.
- **`NudgeList` defaults to `max = 2`**, so an "all three tones" cell silently showed
  two until `max={3}` was passed.

## Known render warns

- None recorded — the render check never ran. Treat every warn on the first
  playwright-enabled sync as new.

## Re-sync risks

- **The barrel and `componentSrcMap` can drift from `src/`.** A component renamed or
  deleted in the app breaks the tsc types step (loudly — good) but a component whose
  *props* change silently invalidates the authored preview's fixture, which will then
  render blank. Re-check any component whose `.d.ts` diff is non-trivial.
- **Preview fixtures are hand-built object literals**, not typechecked (esbuild
  strips types without checking). They will rot as domain types gain required fields
  — exactly the `isSimulated` failure above. If a card goes blank, suspect the
  fixture first.
- **`.design-sync/ds.css` re-imports `src/index.css`.** Changes to the app's base
  layer or FullCalendar theme flow through automatically (intended), but a breaking
  change there breaks the DS stylesheet too.
- **Grouping is weak**: 13 components land in `general` and 5 in `capture`, derived
  from the src directory. `docsMap` group stubs were rejected because pointing a
  component at a stub `.md` replaces its rich synthesized `.prompt.md` (props + JSDoc
  + preview examples) with an empty file. To improve grouping properly, write real
  per-component docs with `category:` frontmatter and set `cfg.docsDir`.
- Node 22.15.1, tailwindcss 4.3.1, react 18.3.1 at time of sync. `npm ci` was **not**
  run — the existing `node_modules` was verified healthy instead.
