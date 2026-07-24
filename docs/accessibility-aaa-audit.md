# Accessibility audit — WCAG 2.2 Level AAA (marketing site)

**Scope:** the marketing site only — every page under `site/src/pages/**`, including the
two interactive tools (`/tools/drug-calculation-practice`, `/tools/placement-hours-calculator`).
The app at `app.placemate.uk` (`src/react/**`) is **out of scope** for this audit.

**Standard:** WCAG 2.2. Target: **Level AAA** on all technical/design criteria, with
content-level criteria satisfied where reasonable and otherwise documented as exceptions
(see [§4](#4-documented-exceptions)). This matches W3C's own guidance that full AAA is not
achievable as a blanket policy for all content.

**Date:** 2026-07-24. **Verified against:** local production build + live dev preview
(computed-style contrast sweep, keyboard-focus checks, target-size measurement).

---

## 1. Conformance model — how AAA contrast is delivered

The site ships **two contrast modes**:

| Mode | How it's reached | Contrast level |
|---|---|---|
| **Default** | as shipped | Meets AA for the large majority of content (see [§5](#5-known-default-mode-contrast-gaps) for the exceptions) |
| **High-contrast** | header toggle (◐), or automatically when the OS reports `prefers-contrast: more` | **AAA — 1.4.6 Contrast (Enhanced), ≥7:1** |

The brand palette was left unchanged by request; instead AAA contrast is a first-class,
**user-selectable mechanism** (WCAG permits meeting a criterion via a control the user can
activate). The choice persists in `localStorage` and is applied before first paint (no
flash). The header toggle is a real `<button>` with `aria-pressed`, present on desktop and
mobile, and is itself keyboard-operable with a 44×44px target.

**All *non-colour* AAA fixes apply to the default mode for every visitor** — they don't
depend on the toggle. Only the 7:1 contrast requirement sits behind it.

---

## 2. What changed

Three commits (plus the earlier structured-data fix):

1. **`feat(site): WCAG AAA structural/keyboard/focus/target fixes (site-wide)`**
   Focus indicator, reduced-motion, focus-not-obscured, 44px targets, status messages,
   line-length, abbreviation expansion.
2. **`feat(site): opt-in AAA high-contrast theme + header toggle`**
   `html[data-contrast="more"]` palette, no-flash script, persistence, `prefers-contrast`.
3. **`docs: this audit`.**

Key files: `site/src/styles/global.css`, `site/src/components/{Header,Footer,Button,ContrastToggle}.astro`,
`site/src/layouts/Layout.astro`, `site/src/pages/tools/*.astro`, `site/src/pages/guides/[...slug].astro`.

---

## 3. WCAG 2.2 AAA criteria — status

Only Level AAA criteria are itemised below (all relevant A/AA criteria were confirmed as a
prerequisite; notable A/AA work and any residual A/AA gaps are called out in [§5](#5-known-default-mode-contrast-gaps)).

| SC | Name | Status | Notes |
|---|---|---|---|
| 1.2.6 | Sign Language (Prerecorded) | **N/A** | No prerecorded audio/video on the site |
| 1.2.7 | Extended Audio Description | **N/A** | No video |
| 1.2.8 | Media Alternative (Prerecorded) | **N/A** | No prerecorded media |
| 1.2.9 | Audio-only (Live) | **N/A** | No live audio |
| 1.3.6 | Identify Purpose | **Pass** | Landmarks (`header`/`nav`/`main`/`footer`), ARIA labels on nav regions, native form labels; no ambiguous icon-only controls without a name |
| 1.4.6 | Contrast (Enhanced) 7:1 | **Pass (high-contrast mode)** | Delivered via the toggle/`prefers-contrast`; verified ≥7:1 across a 89-element on-page sweep and for white-on-CTA-gradient (7.68→9.72:1). Default mode: see [§5](#5-known-default-mode-contrast-gaps) |
| 1.4.7 | Low or No Background Audio | **N/A** | No audio |
| 1.4.8 | Visual Presentation | **Pass** | Text left-aligned (not justified); line-height ≥1.5 (guide body 1.75); guide body measure capped at 70ch (≤80); high-contrast mode provides a fg/bg selection mechanism; no loss of content at 200% zoom (responsive layout) |
| 1.4.9 | Images of Text (No Exception) | **Pass** | No text-as-raster in content. Logo/wordmark is live text + inline SVG (logotype exemption also applies). OG images are share metadata, not page content |
| 2.1.3 | Keyboard (No Exception) | **Pass** | All controls native/keyboard-operable: links, `<button>`s, `<details>` menus/accordions, form inputs, the contrast toggle. No custom pointer-only widgets |
| 2.2.3 | No Timing | **Pass** | No time limits anywhere (the practice quiz is untimed) |
| 2.2.4 | Interruptions | **Pass** | No interstitials, auto-popups or auto-updating content; analytics is passive |
| 2.2.5 | Re-authenticating | **N/A** | No authenticated session on the marketing site |
| 2.2.6 | Timeouts | **N/A** | No data-loss timeouts |
| 2.3.2 | Three Flashes | **Pass** | No flashing content |
| 2.3.3 | Animation from Interactions | **Pass** | `prefers-reduced-motion: reduce` disables smooth-scroll and near-zeroes all transitions/animations |
| 2.4.8 | Location | **Pass** | Visible breadcrumbs on guide/tool pages; `aria-current="page"` on the active nav item; breadcrumb structured data |
| 2.4.9 | Link Purpose (Link Only) | **Pass** | No "click here"/"read more"-style links; card links carry the full title in their accessible name; icon-only links (logo) have `aria-label` |
| 2.4.10 | Section Headings | **Pass** | Content organised under `h1→h2→h3` with no skipped levels |
| 2.4.12 | Focus Not Obscured (Enhanced) | **Pass** | `scroll-padding-top: 5rem` keeps focused controls clear of the sticky header |
| 2.4.13 | Focus Appearance | **Pass** | Single global `:focus-visible` = 3px solid outline, 2px offset (perimeter well over the 2px minimum); colour `--pm-focus` = 7.68:1 (default) / 9.72:1 (high-contrast). Verified live on keyboard focus |
| 2.5.5 | Target Size (Enhanced) 44px | **Pass** | ≥44×44px on buttons, header nav + mobile menu, footer links, tool inputs/buttons, contrast toggle (measured: 44–131px). Inline breadcrumb links use the inline-text exception — see [§4](#4-documented-exceptions) |
| 3.1.3 | Unusual Words | **Pass (mechanism present)** | Domain terms are expanded in context (e.g. "Practice Assessment Document", "Nursing and Midwifery Council (NMC)"); see also 3.1.4 |
| 3.1.4 | Abbreviations | **Pass** | `NMC` is expanded (`<abbr>` + spelled-out form in the footer, present on every page); other abbreviations are introduced spelled-out in body copy |
| 3.1.5 | Reading Level | **Documented exception** | See [§4](#4-documented-exceptions) — required NMC terminology sits above lower-secondary level |
| 3.1.6 | Pronunciation | **N/A** | No content whose meaning depends on pronunciation |
| 3.2.5 | Change on Request | **Pass** | No automatic context changes; no auto-opening new windows; disclosures/toggle act only on user request |
| 3.3.5 | Help | **Pass** | Contact route (email + `/contact`) is consistently available site-wide (nav + footer); tools include on-page instructions and worked examples |
| 3.3.6 | Error Prevention (All) | **N/A / Pass** | No legal/financial/data-submission forms. Tool inputs are numeric, non-destructive and reversible, with instructions and instant feedback |

---

## 4. Documented exceptions

- **3.1.5 Reading Level (AAA).** PlaceMate is YMYL health-adjacent content for UK student
  nurses and must use the NMC's own vocabulary — "proficiency", "Practice Assessment
  Document", "supervised practice learning", drug-calculation terminology. After removing
  proper nouns, some passages still sit above the lower-secondary reading level the SC asks
  for. We mitigate rather than dilute: plain-language ledes, expanded terms on first use,
  short sentences, and worked examples. A full plain-language alternate version is a
  possible future addition; the core copy intentionally keeps the assessed terminology.
- **2.5.5 Target Size — inline breadcrumb links.** The "Home / Tools" breadcrumb links are
  inline text within a line of text and rely on SC 2.5.5's **inline exception**. All
  standalone controls meet the full 44px target.

---

## 5. Known default-mode contrast gaps (recommendation)

The default palette was intentionally left unchanged. In default mode a few elements sit
below the AA **4.5:1** bar (all are fully resolved in high-contrast mode):

| Element | Default ratio | AA (4.5:1)? |
|---|---|---|
| Primary CTA — white text on `emerald-600` (`#059669`) | 3.77:1 | ✗ |
| CTA-section white text on the `emerald-600→700` gradient | 3.77–5.48:1 | partial |
| Footer column headings / copyright — `slate-400` | ~3:1 | ✗ |
| Muted helper text — `slate-500` | 4.76:1 | ✓ (fails AAA only) |

**Recommendation (optional, needs sign-off — would change the default look slightly):**
darkening just the primary-button background from `emerald-600` to `emerald-700` (`#047857`,
5.48:1) and the footer's tiny headings from `slate-400` to `slate-600` would clear **AA**
in the default theme with a barely-perceptible visual change, while high-contrast mode
continues to provide the AAA 7:1 experience. Not applied here per the "don't change the
current colour scheme" decision.

---

## 6. How to re-verify

```bash
cd site && npx astro build      # 24 pages, no errors
npm run dev                     # or the "placemate-site" preview config
```

- **Contrast:** toggle high-contrast (header ◐) or emulate `prefers-contrast: more`; sample
  computed `color` vs. effective background (resolve `oklch()` via a 1px canvas) and confirm
  ≥7:1 for text, ≥3:1 for control borders/graphics.
- **Focus:** Tab through the page — every control shows the 3px offset outline; confirm
  `:focus-visible` matches and the outline isn't clipped by the sticky header.
- **Targets:** `getBoundingClientRect()` ≥44×44 on all standalone controls.
- **Motion:** enable "reduce motion" at the OS level — smooth-scroll and transitions stop.
- **Structured data:** the pricing page emits `SoftwareApplication` (not `Product`), so the
  GSC merchant-listing errors (`image`, `hasMerchantReturnPolicy`, `shippingDetails`) no
  longer apply.
