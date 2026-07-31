# Handoff — Note capture review screen redesign

**For:** Claude Code, working in `student-nurse-planner`
**Design source:** `Note capture — redesign.dc.html` (this project) — open it and click
through the five state tabs. `Note capture — current.dc.html` is a faithful recreation of
what ships today, for side-by-side comparison.
**Spec:** `spec/spec-note-capture.md`. Every P-decision is preserved. Where this redesign
touches one, it is called out explicitly below.

---

## 0. Process — how this lands in the app

Do it in this order. Steps 1 and 2 are independent of each other; 3 depends on both.

| # | What | Where | Why this order |
|---|---|---|---|
| 1 | Add the four new primitives (§5) | `src/react/components/capture/` | Self-contained, testable, no layout churn |
| 2 | Thread `bbox*` through to `ReviewPanel` (§6) | `useCapture.ts` → `ReviewPanel` | The photo pane can't exist without it; it's a plumbing change, not a design one |
| 3 | Rebuild `ReviewPanel`'s layout (§3) | `ReviewPanel.tsx`, delete `LaneBoard.tsx` | Needs 1 + 2 |
| 4 | Restyle the other four modal stages (§7) | `CaptureButton.tsx` | Independent; can ship separately |
| 5 | Promote to `ds-bundle` (§9) | after it's proven in the app | Never promote an unproven component |

**On the design system:** don't amend `ds-bundle` first. Three of the four new primitives
are capture-specific and should never leave `src/react/components/capture/`. Only
`ProgressSpine` and `MetaChip` are plausibly reusable, and only once a second screen wants
them. `ds-bundle` is compiled *from* the app (`_ds_sync.json`), so the flow is
app → bundle, never bundle → app.

---

## 1. The problem being fixed

The current screen puts six things on one plane at equal weight: the count line, the
cache banner, the spell-check banner, the shift bar, five full-detail cards, and four
permanently-visible empty lanes. Consequences:

- **No first action.** Nothing on screen says what to do next, so the student starts at the top-left and reads everything.
- **Empty lanes cost ~50% of the width** to communicate four labels. Four dashed boxes saying "Drag a note here" is four times the same instruction.
- **Every card shows every field, always.** Tags, NMC evidence, drug offer, dispute resolution, allocate bar — for a block the student hasn't even decided the destination of yet.
- **Nothing shows the AI did anything hard.** Four model calls, two-model consensus, a 219-statement match — and the output reads like a form.

## 2. The direction — three moves

**Move 1: the photo becomes the map.** A sticky left pane shows the page with each block
outlined on it, numbered, colour-coded by state. Clicking a region focuses that card;
focusing a card highlights that region. This is the single biggest change: it makes the
extraction legible ("it found *these* five things on *my* page"), it grounds trust (P1 —
the photo is the only ground truth), and it makes the whole page's state readable at a
glance in a way four lanes never did.

**Move 2: one card expanded, the rest one line each.** The stack is grouped
`Needs you (n)` / `Filed (n)`. The focused block is a full card; everything else is a
single row — number, truncated text, `worth a check` pip if flagged, destination chip.
Progressive disclosure without a wizard. The student still sees the whole page's routing
in one eyeful, which was the lanes' actual job.

**Move 3: destination is four tiles, not a `<select>` and not four lanes.** Inside the
expanded card, `Where does this go?` is a 4-up row of tiles with an icon, the destination
name, and what it becomes. It replaces *both* the select and the lane board. Lanes still
exist — as a drop bar that slides up from the bottom **only while a drag is in progress**
(your answer to `lanes_fate`).

### What this buys, against the answers you gave

| You said | How it's addressed |
|---|---|
| Cards are dense, every field always | Detail drawer is conditional on the chosen destination: `MED_LOG` → drug card offer; `PROFICIENCY_EVENT` → code shortlist; `REFLECTION` → Gibbs stages; `SHIFT_NOTES` → nothing. Tags always, because they apply to all four. |
| Banners are noise | Cache and spell-check become two small chips in a meta strip; the full text is one click away. Shift becomes a right-aligned chip: *"This page belongs to · Thu 23 Jul · Long day · WORTH A CHECK"*. Three banners (~120px) → one 40px strip. |
| Doesn't feel like AI did something | The photo-to-block mapping, and a parsing screen that names the four pipeline stages as they happen instead of one spinner. |
| Looks unfinished / higgledy-piggledy | One elevation scale, one radius scale, one type ramp, one 4px spacing grid. §4 has the numbers. |
| Progress "3 of 5 sorted" | Progress spine in the header: one pip per block, clickable, `2 of 5 filed` beside it. |
| Keyboard-driven | `↑↓` move · `1–4` set destination · `⏎` file. Legend shown in the header, not hidden. |
| Motion on file | Card collapses to its filed row, its pip and its photo region tick green together. |
| Satisfying confirmation | The tick animation plus a `Filed (n)` group that visibly grows. |
| No bulk accept | **Honoured.** There is no "file all". Every block is filed by its own button. |

---

## 3. Layout spec — review screen

Modal width `max-w-none` with the existing `sm:px-10 lg:px-20 xl:px-24` gutters (unchanged
from `CaptureButton.tsx`). The design canvas is 1500px; everything below is
proportion-stable from ~1180px up.

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER          h≈58   title+sub │ progress spine │ kbd legend │ ✕    │
├──────────────────────────────────────────────────────────────────────┤
│ META STRIP      h≈40   ⟳ Read earlier today · Aa 1 spelling fixed     │
│                        ……… This page belongs to [Thu 23 Jul ▾]        │
│                        (expanded detail pushes in below, full width)  │
├──────────────┬───────────────────────────────────────────────────────┤
│ PHOTO 340px  │ STACK  1fr                                            │
│ sticky       │   NEEDS YOU (3)   1 worth a check                      │
│ aspect 3/4   │   ┌ row #1 ────────────────────────────────────────┐  │
│ 45% white    │   └────────────────────────────────────────────────┘  │
│ scrim +      │   ┌ CARD #2 ══════════════════════════════════════╗   │
│ per-block    │   ║ head · text · dispute · 4 tiles · drawer · file║   │
│ outlines     │   ╚═══════════════════════════════════════════════╝   │
│              │   ┌ row #3 ─┐ ┌ row #4 ─┐ ┌ row #5 ─┐               │
│              │   FILED (2)  collapsed green rows + Undo              │
├──────────────┴───────────────────────────────────────────────────────┤
│ Close — this stays here   Start again      Closing keeps this page…  │
└──────────────────────────────────────────────────────────────────────┘
   ┌ drag only ─────────────────────────────────────────────┐
   │  [Reflection] [Medication log] [Proficiency] [Shift]   │  fixed bottom
   └────────────────────────────────────────────────────────┘
```

Grid: `grid grid-cols-1 lg:grid-cols-[340px_1fr] items-start`. Photo aside is
`lg:sticky lg:top-5`. Both columns `min-w-0` (the existing overflow guard still matters —
`Phenoxymethylpenicillin` is 24 characters).

### Header

```jsx
<header className="flex items-center gap-6 border-b border-slate-100 px-6 py-3.5">
  <div className="w-[230px] min-w-0">
    <h2 className="text-[15px] font-semibold tracking-tight text-ink">Photograph your notes</h2>
    <p className="text-xs text-slate-400">5 notes from 1 page · 3 worth a check</p>
  </div>
  <div className="flex min-w-0 flex-1 items-center justify-center gap-3.5">
    <ProgressSpine blocks={blocks} focusId={focus} onFocus={setFocus} />
    <div className="h-6 w-px bg-slate-200" />
    <p className="whitespace-nowrap text-xs font-semibold text-ink">2 of 5 filed</p>
  </div>
  <div className="flex items-center gap-2.5">
    <KeyLegend />          {/* hidden below xl */}
    <CloseButton />
  </div>
</header>
```

Copy note: **"notes", not "blocks"** — everywhere the student can see it. "Block" is our
word, not theirs. Keep `NoteBlock` in the code.

### Meta strip

`flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-6 py-2.5`

Two `MetaChip`s on the left, the shift chip pushed right with `ml-auto`. Exactly one
detail panel open at a time (opening one closes the others) — it expands full-width as a
new flex line below the chips, `animate` in. Chip is `bg-ink text-white` while its panel
is open, so it reads as a toggle.

- **Cache chip** — icon `rotate-ccw`, label `Read earlier today` (from `relativeDay()`, keep that helper verbatim). Panel: the current P41 sentence + `Read it again from scratch`. Add the phrase *"and no charge against your daily photos"* — P41 says it, the UI never did.
- **Spell chip** — label `{n} spelling{s} fixed`. Panel: the `from → to` pairs + Undo. Add *"your wording and abbreviations are untouched"* — that's the P24 boundary and it's reassuring.
- **Shift chip** — `This page belongs to` (slate-400, 11px) then the chip: label, `worth a check` pill when `resolution.isFallback`, chevron. Panel: the fallback sentence + candidate buttons + `Don't attach to a shift`. This is `ShiftBar` restructured, not rewritten — keep `formatShiftLabel`, `resolution.isFallback`, `DATE_MATCH`.

### Photo pane — `PagePreview` (new)

```jsx
<div className="relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
  <img src={pageUrl} className="block aspect-[3/4] w-full object-cover" alt="Your page of notes" />
  <div className="absolute inset-0 bg-white/50" />        {/* base scrim */}
  {blocks.map(b => <RegionButton … />)}
</div>
<p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
  Your page, kept as the record. Click a note on it to jump to that card.
</p>
```

Each region is a `<button>` at `left/top/width/height` = `bboxX0/Y0` and the deltas, ×100%.
`rounded-md border-2`, `transition-all duration-200`, plus a badge at `-left-2 -top-2`
(18px circle, number or tick).

| State | Border | Fill | Badge |
|---|---|---|---|
| focused | `border-ink` + `shadow-[0_0_0_9999px_rgba(255,255,255,0.42)]` `z-10` | none | `bg-ink text-white` |
| filed | `border-primary-600/75` | `bg-primary-500/12` | `bg-primary-600 text-white` + tick |
| worth a check | `border-accent-600/60` | `bg-accent-500/10` | `bg-accent-600 text-white` |
| plain pending | `border-slate-500/45` | `bg-white/28` | white, `ring-1 ring-slate-300` |

The focused region's giant inset shadow is the whole trick — it dims everything *except*
the block you're on, on top of the base 50% scrim. Cheap, no masks, no canvas.

**Reduced motion:** drop `transition-all`; the states still differ by colour and border.

### The stack

Groups render only when non-empty.

```jsx
<h3 className="text-xs font-bold uppercase tracking-[0.12em] text-ink">Needs you (3)</h3>
<span className="text-xs text-slate-400">1 worth a check</span>
```

`Filed (n)` uses `text-primary-800` and the hint `real entries now` — say plainly that
allocation created a genuine row (P4). Rows are `space-y-2.5`.

**Collapsed row** — `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5`, `bg-white
ring-1 ring-slate-200 hover:ring-slate-300` (filed: `bg-primary-50/60 ring-primary-200`).
Contents: number/tick badge (21px) · truncated preview · `worth a check` pip · destination
chip (`bg-slate-100 text-slate-600`, or `border border-dashed border-slate-300
text-slate-400` reading `Not decided`, or plain `text-primary-800` reading
`Filed as Medication log`) · `Undo` on filed rows only.

The preview is a **summary, not the first 60 characters** — `Aciclovir — antiviral
medication, HSV prevention in haematology`. If the classifier can't supply one, truncate
`text` at a word boundary; do not truncate mid-drug-name.

**Expanded card** — `rounded-2xl bg-white ring-1 ring-slate-900/7` with
`shadow-[0_1px_2px_rgba(16,24,40,.04),0_16px_40px_-16px_rgba(16,24,40,.22)]`. That
elevation is the only one on the screen; it is what makes "this is the one you're on"
legible without a colour wash. Three bands:

1. **Head** `border-b border-slate-100 px-4 py-2.5` — 24px ink circle with the number · `kindLabel` (11px bold uppercase slate-400) · `worth a check` pill · `⠿ drag me` pushed right in `text-slate-300` · dismiss ✕. Keep the two-tap dismiss confirm from today's `BlockCard` — it's right, it just needs the current copy.
2. **Body** `px-4 py-4.5` — textarea, dispute strip, destination tiles, detail drawer.
3. **Foot** `border-t border-slate-100 bg-slate-50/60 px-4 py-3` — file button, hint, `Skip for now ↓`.

**Textarea:** `text-[15px] leading-relaxed`, `bg-slate-50 ring-1 ring-slate-200 border-0
rounded-xl p-3.5`, focus `bg-white ring-2 ring-primary-400`. **Keep the ResizeObserver
auto-fit from the current `BlockCard` verbatim** — the comment there explains why a
computed `rows` can't work, and it's still true. `resize-none` now that height is measured.
Persist on blur, as today.

**Dispute strip** (replaces the `WorthACheck` + list block) — one line, coral-tinted:

```
The two readings differ —  [ Aciclovir | Acyclovir ]  which matches your handwriting?
```

A segmented control, not two loose buttons: the applied reading is `bg-accent-600
text-white`, the other `bg-white text-accent-700`. It's one control because it's one
question with two answers, and a segmented control says "currently A, could be B" — which
is exactly the state. `chooseReading()` keeps its current behaviour (swap in the text,
persist text + shortened `disputedWords`).

**Destination tiles:**

```jsx
<p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Where does this go?</p>
<div className="mt-2.5 grid grid-cols-2 gap-2 xl:grid-cols-4">
  {DESTS.map(d => (
    <button className={selected
      ? "relative flex flex-col items-start gap-1.5 rounded-xl border border-primary-600 bg-primary-50 p-2.75 text-left shadow-[0_0_0_3px_rgba(4,120,87,0.12)]"
      : "relative flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-white p-2.75 text-left hover:border-primary-300"}>
      <Icon />                                  {/* 18px lucide, primary-700 / slate-400 */}
      <span className="text-[12.5px] font-bold leading-tight">{d.name}</span>
      <span className="text-[11px] leading-tight">{d.blurb}</span>
      <kbd className="absolute right-2 top-2 rounded px-1 text-[10px] font-bold">{d.key}</kbd>
    </button>
  ))}
</div>
```

Icons, from `lucide-react` (already a dependency — **do not draw new SVGs**):
`RotateCcw` (Reflection) · `Pill` (Medication log) · `ShieldCheck` (Proficiency) ·
`CalendarDays` (Shift notes).

Labels: `Reflection` / `Medication log` / `Proficiency` / `Shift notes`. Blurbs:
`A Gibbs reflection` / `A medication log` / `NMC evidence` / `Onto the shift`. These are
`TARGET_BLURB` shortened to fit a tile — keep the long forms for screen readers via
`aria-label`.

**This replaces the `<select>`.** The module comment in `ReviewPanel.tsx` about "one
control decides the block, not two" still holds — this *is* that one control, made
visible. `setDestination()` keeps `kind` in step underneath, unchanged.

**Detail drawer** — `rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200`, rendered only
when a destination is chosen and it isn't `SHIFT_NOTES`. Contents by destination:

- `MED_LOG` → `MedicationOffer` on one line: `DRUG CARD  Aciclovir  — you don't have a card yet.  [Create it]  No thanks`. Same component, laid out inline.
- `PROFICIENCY_EVENT` → codes as **selectable pills** (`4.15` `4.17` `B2.11` + `Search all 219`), the selected one `bg-secondary-600 text-white`, with the chosen statement in full underneath. This replaces the stacked list — the codes are a *choice*, so they should look like one. Removing a code stays available on long-press/right-click or a `×` on hover; don't put five `×`es on screen.
- `REFLECTION` → the Gibbs stages the classifier found, 3-up cards, each `stage` label in `text-primary-700`. Currently the student is told *"the reflection stages we found will be filled in"* and shown nothing. Show them.
- Tags row, always, separated by `border-t border-slate-200 pt-3`. Applied = `bg-secondary-50 text-secondary-800 ring-1 ring-secondary-200` with `✓`; proposed = `border-dashed border-slate-300 text-slate-500` with `+`. Opt-in semantics for new labels (P37) unchanged.

**Foot:**

```jsx
<button disabled={blocked} className={blocked
  ? "inline-flex items-center gap-2.5 rounded-xl bg-slate-100 px-4 py-2.5 text-[13.5px] font-bold text-slate-400"
  : "inline-flex items-center gap-2.5 rounded-xl bg-primary-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm hover:bg-primary-700"}>
  File as Medication log <kbd className="rounded bg-white/22 px-1.5 text-[10px]">⏎</kbd>
</button>
<span className="text-xs text-slate-400">Nothing is written to your records until you press this.</span>
<button className="ml-auto text-xs font-semibold text-slate-400 hover:text-ink">Skip for now ↓</button>
```

Blocked hints, unchanged in meaning, sentence-cased: `Choose where it goes first.` /
`Pick a proficiency first.` Both P34 and P30 guards stay.

### Drag

`LaneBoard.tsx` is **deleted.** Drag survives as:

- Collapsed rows and the expanded card are `draggable` when `status !== "ALLOCATED"`.
- `onDragStart` sets `dragging`, which renders a fixed bottom bar: `rounded-2xl bg-white/97 p-2.5 shadow-2xl ring-1 ring-slate-900/10 backdrop-blur`, four 132px dashed drop tiles with the same icon + name.
- `onDragOver` → `border-primary-600 bg-primary-50 scale-[1.04]`.
- Drop calls the same `onEdit(id, { targetType })` the lanes called. Filed blocks don't drag (they'd desync the real row).

Keep the existing comment's point: drag is never the only route. The tiles in the card and
keys `1–4` both do the same thing.

### Keyboard

Bind on `window`, guarded by `e.target.tagName !== "TEXTAREA" && !== "INPUT"`.

| Key | Action |
|---|---|
| `↑` `↓` | Move focus through **pending** blocks only |
| `1`–`4` | Set the focused block's destination |
| `⏎` | File the focused block (no-op when blocked) |
| `Esc` | Existing close behaviour, unchanged |

After filing or dismissing, focus moves to the next pending block. When none remain,
focus is empty and the stack shows only `Filed (n)` — that's the natural end state.

### Motion

All inside `@media (prefers-reduced-motion: no-preference)`, matching `index.css`'s
existing convention. Add to `index.css` next to `pm-modal-in`:

```css
@keyframes pm-card-in { 0%{transform:scale(.97);opacity:0} 60%{transform:scale(1.005)} 100%{transform:scale(1);opacity:1} }
@keyframes pm-tick    { from{transform:scale(.3);opacity:0} to{transform:scale(1);opacity:1} }
@keyframes pm-panel-in{ from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
```

`pm-card-in` 240ms on the expanded card · `pm-tick` 320ms with a slight overshoot on every
tick (pip, photo badge, filed row) · `pm-panel-in` 220ms on meta panels and the detail
drawer. Filing fires all three ticks in the same frame, which is what makes it feel like
one event rather than three updates.

---

## 4. Design system used

Everything is `brand-palette.css` + `slate-*`. Nothing new.

| Role | Value |
|---|---|
| Primary action, filed, progress | `primary-600 #047857`, hover `primary-700`, tints `primary-50 #ecfdf5` / `primary-100` |
| Selected destination ring | `shadow-[0_0_0_3px_rgba(4,120,87,0.12)]` |
| Links, codes, tags, second-rank | `secondary-600 #005eb8`, `secondary-700`, tint `secondary-50` |
| Worth a check, disputes only | `accent-600 #be123c` on `accent-100 #ffe4e6`; strip bg `accent-50` |
| Focused / current | `ink #16212f` — deliberately *not* a brand colour. "Where you are" is not a semantic state, and using emerald for it would collide with "filed". |
| Body / secondary / muted | `ink` · `slate-600 #475569` · `slate-400 #64748b` (AA-pinned) |

**Never hardcode `#94a3b8` or `#cbd5e1` as a text or icon-control colour.**
`brand-palette.css` pins `slate-400` to `#64748b` precisely because Tailwind's stock
`#94a3b8` is ~2.9:1 on white. Use the `text-slate-400` *class* (which resolves to the
pinned value) rather than a literal. `#94a3b8`/`#cbd5e1` are fine only for decoration
that sits beside its own label — a chip's leading glyph, a chevron, an unselected tile
icon. An icon-only control (the dismiss ✕, the drag handle) needs 3:1 under WCAG 1.4.11,
so those get `#64748b` too.
| Hairlines / surfaces | `slate-100 #f1f5f9` dividers · `slate-200 #e2e8f0` rings · `slate-50 #f8fafc` recessed |

**Coral discipline.** Accent appears in exactly two places: the `worth a check` pip and the
dispute strip. It never fills a panel and never carries body text (it's sub-AA on white) —
same rule `ShiftBar`'s comment already states.

**Type ramp** (the whole screen): 27/22/20px headings · 15px note text · 14px body · 13.5px
buttons and rows · 12.5px secondary · 12px meta · 11px labels and captions · 10px badges
and kbd. Uppercase labels always carry `tracking-[0.12em]` and `font-bold`.

**Radius:** 20 modal · 16 card · 12 tile/row/button · 9 chip-square · 999 pill.
**Spacing:** 4px grid; 24px page gutter, 16px card padding, 10px between rows, 8px in grids.
**Elevation:** exactly two. The modal, and the focused card. Everything else is a `ring-1`.

---

## 5. New components

All in `src/react/components/capture/`.

```ts
// PagePreview.tsx — the photo with block regions overlaid
interface PagePreviewProps {
  imageUrl: string;
  blocks: NoteBlock[];        // needs bboxX0/Y0/X1/Y1 populated
  focusId?: string;
  onFocus: (blockId: string) => void;
}

// ProgressSpine.tsx — one pip per block, in the header
interface ProgressSpineProps {
  blocks: NoteBlock[];
  focusId?: string;
  onFocus: (blockId: string) => void;
}

// MetaChip.tsx — a toggling chip whose panel expands full-width below the strip
interface MetaChipProps {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;   // the panel
}

// DestinationTiles.tsx — the 4-up chooser, also the source of the drag drop-bar tiles
interface DestinationTilesProps {
  value: NoteBlockTarget | "";
  onChange: (t: NoteBlockTarget) => void;
  disabled?: boolean;
}
```

`DestinationTiles` owns the icon ↔ target mapping so the card and the drop bar can't drift.

## 6. Changes to existing files

| File | Change |
|---|---|
| `ReviewPanel.tsx` | Rebuild the layout. **Keep:** `STATEMENTS`/`GROUPING`/`ID_FOR_CODE`, `relativeDay`, `list`, `BlockPatch`, `KnownContext`, `ReviewHandlers`, `chooseReading`, `dropTag`/`dropCode`/`pickCode`, `setDestination`, the textarea ResizeObserver, `revert`. **Drop:** the `Row` label component (labels are contextual now), the `<select>`, the always-on sections. **Add:** `focusId` state, keyboard binding, group split, drag state. |
| `LaneBoard.tsx` | **Delete.** Its job is split between the stack (see everything at once) and the drop bar (drag targets). |
| `useWideScreen.ts` | **Keep.** Still the right call for list-vs-lanes on mobile, and its comment about one mounted copy still applies. |
| `ShiftBar.tsx` | Restructure into the chip + panel form. Keep all the resolution logic and the `isFallback` copy verbatim. |
| `AllocateBar.tsx` | Becomes the card foot. Destination select already removed; add the `⏎` affordance and sentence-case the hints. Keep the filed/undo branch and its P19 warning path. |
| `WorthACheck.tsx` | Unchanged. Used in three places now (pip, card head, shift chip) — exactly what its comment argues for. |
| `MedicationOffer.tsx` | Unchanged component, laid out inline inside the drawer. |
| `ProficiencyPicker.tsx` | Unchanged. Reached from `Search all 219`. |
| `CaptureButton.tsx` | Restyle the other four stages (§7). Portal, no-backdrop-dismiss, `close()`-keeps-capture all unchanged. |
| `useCapture.ts` | **Expose the page image URL and ensure `bbox*` reach `ReviewPanel`.** They're on the row already (`spec-note-capture.md`, data model) — they just aren't passed down. A presigned GET for `imageKeys[0]` is the one piece of new plumbing. |

If a presigned GET is more than a day's work, ship the redesign with the photo pane behind
`imageUrl ?? null` — everything else stands without it, the grid just becomes single-column.
But get the photo in: it's the move the rest of the design is built around.

## 7. The other four stages

**Start.** Two columns: left = title, PII warning, CTA; right = a `What happens next` 1-2-3
on `bg-slate-50`. The 1-2-3 exists to make a 70-second wait feel bought rather than
suffered, and to say the two things students most need to hear — *we never rewrite your
words*, *nothing saves until you say so*. The PII warning keeps its prominence and its
exact wording (P2); it gains a warning-triangle glyph and 16px radius. CTA unchanged, plus
`· 7 photos left today` in the footnote.

**Parsing.** Photo on the left with regions **appearing as they're found**; on the right,
the four pipeline stages as a checklist (`Reading your handwriting` → `Cross-checking every
word` → `Spell-checking clinical terms` → `Working out where each note goes`), each with a
result once complete (`3 to look at`, `1 fixed`). Then the existing streamed text preview,
restyled. This is P40's staging made visible: the wait stops being blank and starts being
the product demonstrating itself. Wire the stages to the same stream events `state.activity`
already carries.

**Done.** Photo with every region ticked, then `All five notes filed.` and a 2-up grid of
what was created, each with an `Open` link to the real row. This is P4's whole promise —
show that a Reflection *is* a Reflection now. Replace the current placeholder copy
("Reading them into notes comes next — that part isn't built yet"), which is stale.

**Capped.** Centred, calm, no coral. Clock glyph, `That's today's ten pages read`, ten
filled pips, and a primary action that goes to the pages they *do* have. Currently the cap
screen is a dead end; the student almost always still has unfiled blocks.

## 8. Mobile (P35 — mobile is the primary path)

The desktop screen above degrades cleanly; below `lg` it becomes:

- Photo pane → a collapsed strip above the stack, tap to expand full-width. It's still the map, just not always on screen.
- Progress spine → stays in the header (five 25px pips fit at 360px).
- Meta chips → wrap to two lines; shift chip drops to its own line.
- Destination tiles → `grid-cols-2`.
- Drop bar → not rendered; touch drag is unreliable and the tiles already do the job.
- Keyboard legend → hidden.

No second layout, no second set of mounted cards — `useWideScreen`'s reason for existing
goes away with `LaneBoard`, but keep the hook for the photo-strip collapse.

## 9. Promoting to `ds-bundle`

After it ships and survives a week. Only these two, and only if a second screen wants them:

- `ProgressSpine` — generic "n items, m done, click to jump".
- `MetaChip` — generic "quiet chip, expandable detail".

`PagePreview` and `DestinationTiles` are capture-specific; putting them in the bundle would
make the DS lie about its own scope. Run the normal `_ds_sync` flow; don't hand-edit
`_ds_bundle.js`.

## 10. Acceptance criteria

1. Opening review on a 5-block page shows **one** expanded card and four one-line rows.
2. Clicking a region on the photo focuses that card; focusing a card highlights that region. Both directions.
3. The four destinations are visible **only** inside the focused card, and as the drop bar **only** during a drag. No permanent empty lanes anywhere.
4. Tags/NMC/drug-card UI appears only after a destination is chosen, and only the parts that destination needs.
5. `↑↓` `1–4` `⏎` work and don't fire while typing in the textarea.
6. Filing ticks the pip, the photo region and the filed row in one motion; `Undo` reverses all three.
7. Cache, spell-check and shift occupy one ~40px strip; each expands to full detail in one click; only one is open at a time.
8. No "file all" control exists.
9. Coral appears only on `worth a check` pips and the dispute strip.
10. `prefers-reduced-motion` removes all animation; every state remains distinguishable by colour and border alone.
11. Existing tests (`reviewPanel.test.tsx`, `captureButton.test.tsx`, `allocateBlock.test.ts`) pass or are updated for the new DOM — **no behaviour change**: the same handlers, the same writes, the same guards.

## 11. Explicitly unchanged

P2 warning-first · P4 allocation materialises the real row · P9 one recommendation with
alternates and a plainly-labelled fallback · P11 `rawText` frozen, revert always available ·
P19 undo reverses the write · P22 disagreement-not-confidence gating · P24 corrections
auto-applied and surfaced · P28 shortlist plus a route to all 219 · P30/P34 refuse to guess
rather than default · P33 offer, never create silently · P37 existing tags applied, new ones
opt-in · P41 cached parse declared · P42 two-tap dismiss.

Nothing here changes what the app writes. It changes only what the student sees and the
order they're asked to decide things.
