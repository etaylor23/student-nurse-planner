/**
 * Generate test pages for the note-capture importer (spec-note-capture.md).
 *
 * The importer has exactly one real test page, and the spec is blunt about the gap: "only ONE
 * real page tested, and it was single-column and evenly lit. The scattered, multi-orientation
 * page the feature was conceived for has never been tried." This produces a corpus that aims at
 * the specific decisions the pipeline makes, so a failure points at a cause instead of a vibe.
 *
 * Two outputs per page, because they test different halves of the pipeline:
 *
 *   `<id>.txt`  the page as prose, with layout notes — copy it out by hand and photograph it.
 *               ONLY real handwriting exercises the two-model consensus (P21/P22): the whole
 *               design rests on the two vision models disagreeing on hard words, and they
 *               disagree because handwriting is ambiguous. A font is not.
 *   `<id>.jpg`  a rendered page. Ruled paper, five handwriting faces, per-block rotation and
 *               per-line jitter. Exercises everything downstream of transcription — region
 *               geometry, the classifier, the review overlay — in seconds instead of an evening.
 *               It will NOT reproduce genuine handwriting ambiguity. Don't read a clean run here
 *               as evidence that P22 works.
 *
 * Jitter is seeded from the page id, so a page renders identically every time: a corpus you
 * cannot regenerate is a corpus you cannot trust a regression against.
 *
 * Usage:
 *   AWS_PROFILE=personal npx tsx scripts/make-note-pages.ts [--out DIR] [--only ID]
 *
 * Needs `rsvg-convert` (librsvg) and `magick` (ImageMagick), both already on this machine.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** 3:4 portrait at a size the client's 2400px downscale will actually have to work on. */
const PAGE_W = 2400;
const PAGE_H = 3200;

/**
 * Handwriting faces present on macOS, checked with `fc-list`. Varied per block because a page
 * written in one uniform face is the single least paper-like thing about a render.
 */
const FONTS = {
  print: "Bradley Hand",
  marker: "Marker Felt",
  round: "Chalkboard SE",
  scrawl: "Chalkduster",
  cursive: "Snell Roundhand",
} as const;
type FontKey = keyof typeof FONTS;

/** Biro blues and blacks, plus the highlighter-ish red a student uses for "IMPORTANT". */
const INKS = {
  blue: "#1f3a6e",
  navy: "#16264a",
  black: "#23262b",
  red: "#8e2230",
  pencil: "#4a4f57",
} as const;
type InkKey = keyof typeof INKS;

interface Block {
  /** The words. Newlines are the student's own breaks; wrapping is worked out per width. */
  text: string;
  /** Fractions of the page, so layout is resolution-independent. */
  x: number;
  y: number;
  /** Width as a fraction. Text wraps inside it. */
  w: number;
  /** Degrees, about the block's own top-left. The whole point of the chaotic page. */
  rotate?: number;
  /** Relative to the page's base size. 1 is body text. */
  scale?: number;
  font?: FontKey;
  ink?: InkKey;
  /** Draw a hand-drawn-ish box around it — students box the thing that matters. */
  boxed?: boolean;
  /** Underline the first line, twice if `double`. */
  underline?: boolean | "double";
  /** How this sits on the paper, for the hand-writing instructions in the .txt. */
  note?: string;
}

interface Page {
  id: string;
  /** What this page is FOR — which pipeline decisions it aims at. Goes in the .txt header. */
  targets: string;
  paper: "ruled" | "plain" | "squared";
  /** Base font size in px at PAGE_W. */
  size?: number;
  blocks: Block[];
  /** Freehand arrows, as fraction pairs. The mind-map page needs them; nothing else does. */
  arrows?: { from: [number, number]; to: [number, number] }[];
}

/* ─────────────────────────────────────────────────────────────────────────────
   The corpus. Every drug, score and abbreviation here is UK practice, and every
   phone number is in Ofcom's reserved-for-drama 07700 900xxx range.
   ───────────────────────────────────────────────────────────────────────────── */

const PAGES: Page[] = [
  {
    id: "page-1-medications",
    targets:
      "MED_LOG routing · P33 drug-card offers · P22 disputes (Furosemide/Frusemide, Co-amoxiclav) · reflow keeping a list a list",
    paper: "ruled",
    size: 62,
    blocks: [
      {
        text: "Meds — Bay 4 drug round",
        x: 0.1,
        y: 0.055,
        w: 0.7,
        font: "marker",
        ink: "navy",
        scale: 1.25,
        underline: true,
        note: "page heading, underlined",
      },
      {
        text: `Furosemide 40mg OD — loop diuretic. Given for fluid overload / oedema in heart failure. Watch U&Es, it can drop potassium. Give it in the morning so they aren't up all night for the loo.`,
        x: 0.09,
        y: 0.13,
        w: 0.82,
        font: "print",
        ink: "blue",
        rotate: -0.6,
      },
      {
        text: `Co-amoxiclav 625mg TDS — broad spectrum antibiotic (amoxicillin + clavulanic acid). For chest infections. Check penicillin allergy FIRST — ask every time, don't trust the chart.`,
        x: 0.1,
        y: 0.31,
        w: 0.8,
        font: "print",
        ink: "blue",
        rotate: 0.7,
      },
      {
        text: `Bisoprolol 2.5mg OD — beta blocker, slows the heart rate. Hold if HR under 50 or systolic under 100 and escalate. Don't stop it abruptly.`,
        x: 0.09,
        y: 0.47,
        w: 0.78,
        font: "print",
        ink: "navy",
        rotate: -0.4,
      },
      {
        text: `Enoxaparin 40mg SC nocte — LMWH, VTE prophylaxis. Check the weight band and renal function.
Side effects:
- bruising at the site
- bleeding risk
- rare: HIT (platelets drop)
Rotate the injection sites.`,
        x: 0.1,
        y: 0.62,
        w: 0.8,
        font: "print",
        ink: "blue",
        note: "the four bullet lines must stay as separate lines — this is the list the reflow has to preserve",
      },
      {
        text: "ALL of these need a second checker on the round",
        x: 0.12,
        y: 0.88,
        w: 0.72,
        font: "marker",
        ink: "red",
        boxed: true,
        rotate: -1.2,
        note: "boxed in red at the bottom",
      },
    ],
  },

  {
    id: "page-2-reflection",
    targets:
      "REFLECTION routing · Gibbs stage splitting · P8 date-as-written (“Tues 12/8”) · not being pulled to MED_LOG by the drug names",
    paper: "ruled",
    size: 60,
    blocks: [
      {
        text: "Reflection — Tues 12/8",
        x: 0.1,
        y: 0.05,
        w: 0.7,
        font: "marker",
        ink: "navy",
        scale: 1.2,
        underline: true,
        note: "heading. The date is deliberately written the way a student writes it — no year.",
      },
      {
        text: `First time I set up a syringe driver with my PS watching. Palliative patient on the bay, morphine sulfate and midazolam.`,
        x: 0.09,
        y: 0.12,
        w: 0.82,
        font: "print",
        ink: "blue",
      },
      {
        text: `I was so nervous. My hands were shaking when I drew up and I had to ask her to check the calculation twice. Felt embarrassed asking a second time but she said checking twice IS the job.`,
        x: 0.1,
        y: 0.26,
        w: 0.8,
        font: "print",
        ink: "blue",
        rotate: 0.5,
      },
      {
        text: `It went fine in the end. The maths was right both times — I just didn't trust myself.`,
        x: 0.09,
        y: 0.42,
        w: 0.8,
        font: "print",
        ink: "navy",
      },
      {
        text: `I think what got to me was how much it mattered. It's a dying patient and their comfort is the whole point. The pressure was mine, not the task's. The task I actually knew.`,
        x: 0.1,
        y: 0.53,
        w: 0.8,
        font: "print",
        ink: "blue",
        rotate: -0.5,
      },
      {
        text: `Next time: draw up before I go in, and say out loud that I'm double checking instead of apologising for it.`,
        x: 0.09,
        y: 0.7,
        w: 0.8,
        font: "print",
        ink: "black",
      },
      {
        text: "she signed my PAD for this one",
        x: 0.14,
        y: 0.85,
        w: 0.6,
        font: "scrawl",
        ink: "pencil",
        scale: 0.85,
        rotate: -2.2,
        note: "squeezed in at an angle at the bottom, smaller and messier",
      },
    ],
  },

  {
    id: "page-3-proficiency",
    targets:
      "PROFICIENCY_EVENT routing · candidateCodes shortlist · P30 refusing to file without a code · UK skills vocabulary (ANTT, VIP, NEWS2, sepsis six)",
    paper: "ruled",
    size: 58,
    blocks: [
      {
        text: "Skills — what I actually did today",
        x: 0.09,
        y: 0.05,
        w: 0.8,
        font: "marker",
        ink: "navy",
        scale: 1.18,
        underline: "double",
      },
      {
        text: `Cannula care — VIP scored all 4 in bay 3. One was a 2 (redness, slight pain) so I took it out and documented it. ANTT throughout: hand hygiene, gloves, cleaned the ports.`,
        x: 0.1,
        y: 0.13,
        w: 0.8,
        font: "print",
        ink: "blue",
        rotate: -0.5,
      },
      {
        text: `NG tube — checked pH before the feed. 4.5, so safe to use (has to be 5.5 or below). Documented the aspirate and the length at the nostril. Did NOT flush before checking.`,
        x: 0.09,
        y: 0.3,
        w: 0.82,
        font: "print",
        ink: "blue",
        rotate: 0.6,
      },
      {
        text: `NEWS2 — bed 2 scored 6. RR 24, sats 92 on air, HR 110. Escalated to the nurse in charge straight away, she called the reg. Sepsis six started inside the hour.`,
        x: 0.1,
        y: 0.47,
        w: 0.8,
        font: "print",
        ink: "navy",
      },
      {
        text: `Catheter — CSU taken aseptically and sent to the lab. Explained it to the patient first and got consent.`,
        x: 0.09,
        y: 0.63,
        w: 0.8,
        font: "print",
        ink: "blue",
        rotate: -0.4,
      },
      {
        text: `Still need: IM injection, and a second supervised NG.`,
        x: 0.1,
        y: 0.76,
        w: 0.76,
        font: "marker",
        ink: "red",
        boxed: true,
      },
      {
        text: "get PA to sign these off Friday",
        x: 0.13,
        y: 0.88,
        w: 0.66,
        font: "scrawl",
        ink: "pencil",
        scale: 0.9,
        rotate: -1.6,
      },
    ],
  },

  {
    id: "page-4-shift-and-junk",
    targets:
      "SHIFT_NOTES + DATE_HEADER + TODO · P42 two-tap dismissal (phone number, shopping list) · P8 date-as-written · lists surviving reflow",
    paper: "ruled",
    size: 58,
    blocks: [
      {
        text: "Thurs 14/8 — long day — Ward 12",
        x: 0.09,
        y: 0.05,
        w: 0.82,
        font: "marker",
        ink: "navy",
        scale: 1.15,
        underline: true,
        note: "date header — must come through EXACTLY as written, no year",
      },
      {
        text: `Handover:
Bay 3 — 4 pts, 2 for discharge, TTOs pending pharmacy. Bed 1 NBM for endoscopy at 11.
Bay 4 — bed 3 confused overnight. Not 1:1 but eyes on. Waterlow 18.`,
        x: 0.09,
        y: 0.13,
        w: 0.83,
        font: "print",
        ink: "blue",
        note: "keep 'Handover:' on its own line and the two bay lines separate",
      },
      {
        text: `Physio coming for bed 2 at 2pm. Falls risk — bed rails up, checked it with the patient first.`,
        x: 0.1,
        y: 0.34,
        w: 0.8,
        font: "print",
        ink: "blue",
        rotate: 0.5,
      },
      {
        text: "ASK PA TO SIGN MY MED CALC BEFORE FRIDAY!!",
        x: 0.11,
        y: 0.5,
        w: 0.78,
        font: "marker",
        ink: "red",
        boxed: true,
        rotate: -1,
        note: "a to-do, boxed and shouty — should come through as TODO, not as a shift note",
      },
      {
        text: `Mum's mobile 07700 900123`,
        x: 0.1,
        y: 0.63,
        w: 0.6,
        font: "scrawl",
        ink: "pencil",
        rotate: 1.4,
        note: "JUNK — this is one of the two blocks that should be dismissable, not filed",
      },
      {
        text: `milk
bread
teabags`,
        x: 0.62,
        y: 0.66,
        w: 0.3,
        font: "scrawl",
        ink: "pencil",
        scale: 0.9,
        rotate: -2,
        note: "JUNK — a shopping list in the corner, at an angle",
      },
      {
        text: `Bed 4 discharged 16:10, took own TTOs. Bed 1 back from endoscopy 12:40, obs stable, ate a sandwich.`,
        x: 0.09,
        y: 0.8,
        w: 0.82,
        font: "print",
        ink: "blue",
      },
    ],
  },

  {
    id: "page-5-chaos-mindmap",
    targets:
      "THE UNTESTED ONE — P26 (regions are guidance, not boundaries) and P36 against a genuinely scattered, multi-orientation page. Sideways margin notes, a mind-map, arrows, an upside-down corner.",
    paper: "plain",
    size: 56,
    arrows: [
      { from: [0.5, 0.42], to: [0.26, 0.28] },
      { from: [0.5, 0.42], to: [0.74, 0.27] },
      { from: [0.5, 0.44], to: [0.24, 0.55] },
      { from: [0.5, 0.44], to: [0.76, 0.56] },
      { from: [0.5, 0.46], to: [0.34, 0.72] },
      { from: [0.5, 0.46], to: [0.68, 0.73] },
    ],
    blocks: [
      {
        text: "SEPSIS SIX\nwithin 1 hour",
        x: 0.38,
        y: 0.4,
        w: 0.24,
        font: "marker",
        ink: "red",
        scale: 1.3,
        boxed: true,
        note: "dead centre of the page, boxed — everything else radiates from it on arrows",
      },
      {
        text: "1. O2 — keep sats 94–98%",
        x: 0.08,
        y: 0.22,
        w: 0.32,
        font: "print",
        ink: "blue",
        rotate: -4,
        note: "top left spoke, tilted",
      },
      {
        text: "2. blood cultures BEFORE abx",
        x: 0.62,
        y: 0.2,
        w: 0.33,
        font: "print",
        ink: "blue",
        rotate: 3,
        note: "top right spoke, tilted the other way",
      },
      {
        text: "3. IV antibiotics — per trust guideline",
        x: 0.1,
        y: 0.51,
        w: 0.3,
        font: "print",
        ink: "navy",
        rotate: -8,
      },
      {
        text: "4. IV fluids — 500ml bolus, reassess",
        x: 0.64,
        y: 0.52,
        w: 0.31,
        font: "print",
        ink: "navy",
        rotate: 7,
      },
      {
        text: "5. lactate + FBC + cultures",
        x: 0.16,
        y: 0.7,
        w: 0.3,
        font: "print",
        ink: "blue",
        rotate: -5,
      },
      {
        text: "6. urine output — catheter + fluid balance",
        x: 0.56,
        y: 0.71,
        w: 0.33,
        font: "print",
        ink: "blue",
        rotate: 5,
      },
      {
        text: "NEWS2 5 or more → think sepsis",
        x: 0.035,
        y: 0.72,
        w: 0.42,
        font: "marker",
        ink: "red",
        rotate: -90,
        note: "WRITTEN SIDEWAYS up the left margin, reading bottom-to-top",
      },
      {
        text: "red flag: lactate over 2",
        x: 0.93,
        y: 0.3,
        w: 0.36,
        font: "marker",
        ink: "red",
        rotate: 90,
        boxed: true,
        note: "WRITTEN SIDEWAYS down the right margin",
      },
      {
        text: "ask about immunosuppression — chemo? steroids? splenectomy?",
        x: 0.1,
        y: 0.87,
        w: 0.55,
        font: "print",
        ink: "navy",
        rotate: -3,
      },
      {
        text: "BUFALO — the old mnemonic",
        x: 0.62,
        y: 0.93,
        w: 0.33,
        font: "scrawl",
        ink: "pencil",
        scale: 0.85,
        rotate: 181,
        note: "UPSIDE DOWN in the bottom right corner — written with the pad turned round",
      },
      {
        text: "Sepsis lecture — wk 4",
        x: 0.06,
        y: 0.06,
        w: 0.4,
        font: "cursive",
        ink: "pencil",
        scale: 1.05,
        rotate: -1.5,
      },
    ],
  },

  {
    id: "page-6-mixed-boundaries",
    targets:
      "P26 semantic re-splitting — one visual paragraph holding TWO different notes, and one note running across a column break. Two columns, so the vision regions and the real blocks deliberately disagree.",
    paper: "squared",
    size: 54,
    blocks: [
      {
        text: "Wed 20/8 — resp ward",
        x: 0.08,
        y: 0.05,
        w: 0.5,
        font: "marker",
        ink: "navy",
        scale: 1.15,
        underline: true,
      },
      {
        text: `Salbutamol neb 5mg PRN — short acting beta agonist, opens the airways. Watch for tremor and tachycardia, it's not a sign anything is wrong. Mrs in bed 5 was shaky after two back to back and got upset because she thought it meant her heart was failing. I sat with her and explained it and she settled. I should have warned her BEFORE the second neb.`,
        x: 0.07,
        y: 0.13,
        w: 0.4,
        font: "print",
        ink: "blue",
        note: "ONE paragraph that is really TWO notes — a drug note and a reflection. The classifier should split it; the vision model will see one region.",
      },
      {
        text: `Prednisolone 30mg OD for 5 days — steroid, reduces airway inflammation. Take it in the morning with food. Don't stop suddenly if the course is long.`,
        x: 0.07,
        y: 0.52,
        w: 0.4,
        font: "print",
        ink: "navy",
        rotate: -0.8,
      },
      {
        text: `Peak flow technique — sit up, full breath in, tight seal, hard fast blow. Best of 3. I coached bed 5`,
        x: 0.53,
        y: 0.13,
        w: 0.4,
        font: "print",
        ink: "blue",
        note: "THIS SENTENCE CONTINUES in the next block, across the column break — one note, two regions",
      },
      {
        text: `through it and her numbers went up 60 L/min once she stopped puffing her cheeks. Recorded on the chart.`,
        x: 0.53,
        y: 0.26,
        w: 0.4,
        font: "print",
        ink: "blue",
        note: "continuation of the block above — do not repeat the earlier words when writing it out",
      },
      {
        text: `Oxygen — target range written on the chart, 88–92% for the COPD patients. Never just crank it up.`,
        x: 0.53,
        y: 0.55,
        w: 0.4,
        font: "print",
        ink: "navy",
        rotate: 0.7,
      },
      {
        text: "ask about a spirometry study day",
        x: 0.1,
        y: 0.83,
        w: 0.55,
        font: "scrawl",
        ink: "pencil",
        rotate: -1.8,
      },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Rendering
   ───────────────────────────────────────────────────────────────────────────── */

/** Seeded PRNG (mulberry32). A corpus you can't regenerate is one you can't trust. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Wrap to a pixel width, honouring the student's own newlines as hard breaks.
 *
 * Handwriting faces have no metrics available here, so width is estimated at 0.46em per
 * character — measured against Bradley Hand at these sizes and close enough that a line lands
 * inside its block. Being slightly narrow is the safe direction: a line that overflows its box
 * would sit on top of the next block.
 */
function wrap(text: string, maxPx: number, fontPx: number): string[] {
  const perChar = fontPx * 0.46;
  const limit = Math.max(8, Math.floor(maxPx / perChar));
  const out: string[] = [];
  for (const hard of text.split("\n")) {
    if (!hard.trim()) continue;
    let line = "";
    for (const word of hard.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > limit && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Where the rules sit, derived from the page's body size rather than fixed.
 *
 * This is what makes a render look written rather than typeset: handwriting sits ON the line.
 * Ruling the paper at an arbitrary spacing and then setting text at `1.52em` puts the words in
 * the gaps and drifts them further out of step down the page — the single loudest tell, and it
 * also gives a vision model line boundaries that no real page would have.
 */
const RULE_TOP = 190;
function ruleSpacing(page: Page): number {
  return Math.round((page.size ?? 58) * 1.52);
}

/** Snap a baseline to the nearest rule, so every line of body text lands on one. */
function snapToRule(baseline: number, page: Page): number {
  if (page.paper === "plain") return baseline;
  const gap = ruleSpacing(page);
  return RULE_TOP + Math.round((baseline - RULE_TOP) / gap) * gap;
}

function paperDefs(page: Page): string {
  const lines: string[] = [];
  const gap = ruleSpacing(page);
  if (page.paper === "ruled") {
    for (let y = RULE_TOP; y < PAGE_H - 40; y += gap) {
      lines.push(`<line x1="140" y1="${y}" x2="${PAGE_W - 90}" y2="${y}" class="rule"/>`);
    }
    lines.push(`<line x1="250" y1="60" x2="250" y2="${PAGE_H - 40}" class="margin"/>`);
  }
  if (page.paper === "squared") {
    for (let y = RULE_TOP; y < PAGE_H - 40; y += gap) {
      lines.push(`<line x1="90" y1="${y}" x2="${PAGE_W - 90}" y2="${y}" class="rule"/>`);
    }
    for (let x = 90; x < PAGE_W - 60; x += gap) {
      lines.push(`<line x1="${x}" y1="${RULE_TOP}" x2="${x}" y2="${PAGE_H - 90}" class="rule"/>`);
    }
  }
  return lines.join("\n");
}

function renderBlock(b: Block, page: Page, rand: () => number): string {
  const base = page.size ?? 58;
  const fontPx = base * (b.scale ?? 1);
  const x = b.x * PAGE_W;
  const y = b.y * PAGE_H;
  const widthPx = b.w * PAGE_W;
  const lines = wrap(b.text, widthPx, fontPx);
  // On ruled or squared paper every line steps by exactly one rule, so the writing sits on the
  // lines all the way down. Plain paper has nothing to sit on, so it uses its own leading.
  const lineH = page.paper === "plain" ? fontPx * 1.52 : ruleSpacing(page);
  const font = FONTS[b.font ?? "print"];
  const ink = INKS[b.ink ?? "blue"];
  const firstBaseline = snapToRule(y + fontPx, page);

  // Per-line jitter: a hand does not return to the same left margin twice, and a baseline
  // drifts a little. This is the difference between "a font" and "someone wrote this" — kept
  // small on ruled paper, because a real hand still tracks the line it is given.
  const drift = page.paper === "plain" ? 0.1 : 0.05;
  const tspans = lines
    .map((line, i) => {
      const dx = (rand() - 0.5) * fontPx * 0.22;
      const dy = i * lineH + (rand() - 0.5) * fontPx * drift;
      return `<tspan x="${(x + dx).toFixed(1)}" y="${(firstBaseline + dy).toFixed(1)}">${esc(line)}</tspan>`;
    })
    .join("");

  const parts: string[] = [];
  if (b.boxed) {
    // Four separate strokes with wobbly ends, because a boxed note is drawn round the words
    // after the fact and never closes neatly.
    const pad = fontPx * 0.45;
    const bx = x - pad;
    const by = firstBaseline - fontPx - pad * 0.4;
    const bw = widthPx + pad * 1.6;
    const bh = (lines.length - 1) * lineH + fontPx + pad * 1.3;
    const w = () => (rand() - 0.5) * fontPx * 0.3;
    parts.push(
      `<path d="M${bx + w()},${by + w()} L${bx + bw + w()},${by + w()} L${bx + bw + w()},${by + bh + w()} L${bx + w()},${by + bh + w()} Z" fill="none" stroke="${ink}" stroke-width="${(fontPx * 0.055).toFixed(1)}" stroke-linejoin="round" opacity="0.85"/>`,
    );
  }
  if (b.underline) {
    const uy = firstBaseline + fontPx * 0.24;
    const uw = Math.min(widthPx, lines[0].length * fontPx * 0.46);
    const stroke = (fontPx * 0.05).toFixed(1);
    parts.push(
      `<line x1="${x}" y1="${uy}" x2="${x + uw}" y2="${uy + w2(rand, fontPx)}" stroke="${ink}" stroke-width="${stroke}" opacity="0.8"/>`,
    );
    if (b.underline === "double") {
      parts.push(
        `<line x1="${x + fontPx * 0.1}" y1="${uy + fontPx * 0.16}" x2="${x + uw * 0.94}" y2="${uy + fontPx * 0.16 + w2(rand, fontPx)}" stroke="${ink}" stroke-width="${stroke}" opacity="0.7"/>`,
      );
    }
  }
  parts.push(
    `<text font-family="${font}" font-size="${fontPx.toFixed(1)}" fill="${ink}">${tspans}</text>`,
  );

  const transform = b.rotate ? ` transform="rotate(${b.rotate} ${x} ${y})"` : "";
  return `<g${transform}>${parts.join("")}</g>`;
}

/** A hand-drawn line never ends level with where it started. */
function w2(rand: () => number, fontPx: number): number {
  return (rand() - 0.5) * fontPx * 0.12;
}

function renderArrow(
  a: { from: [number, number]; to: [number, number] },
  rand: () => number,
): string {
  const [fx, fy] = [a.from[0] * PAGE_W, a.from[1] * PAGE_H];
  const [x2, y2] = [a.to[0] * PAGE_W, a.to[1] * PAGE_H];
  // Start clear of whatever sits at the origin. An arrow drawn out of a boxed heading begins at
  // the box's edge, not from under the words — and starting inside it drew six lines straight
  // through the one thing on the page that mattered.
  const lead = 0.18;
  const x1 = fx + (x2 - fx) * lead;
  const y1 = fy + (y2 - fy) * lead;
  // Bow the line, because nobody rules an arrow freehand.
  const mx = (x1 + x2) / 2 + (rand() - 0.5) * 90;
  const my = (y1 + y2) / 2 + (rand() - 0.5) * 90;
  const ang = Math.atan2(y2 - my, x2 - mx);
  const head = 34;
  const hx = (d: number) => x2 - head * Math.cos(ang + d);
  const hy = (d: number) => y2 - head * Math.sin(ang + d);
  return `<g opacity="0.7"><path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="${INKS.pencil}" stroke-width="5" stroke-linecap="round"/><path d="M${hx(0.5)},${hy(0.5)} L${x2},${y2} L${hx(-0.5)},${hy(-0.5)}" fill="none" stroke="${INKS.pencil}" stroke-width="5" stroke-linecap="round"/></g>`;
}

function toSvg(page: Page): string {
  const rand = rng(page.id);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
  <style>
    .rule { stroke: #c9d6e4; stroke-width: 2.4; }
    .margin { stroke: #e3b3b8; stroke-width: 3.2; }
  </style>
  <rect width="${PAGE_W}" height="${PAGE_H}" fill="#fbf8f1"/>
  ${paperDefs(page)}
  ${(page.arrows ?? []).map((a) => renderArrow(a, rand)).join("\n  ")}
  ${page.blocks.map((b) => renderBlock(b, page, rand)).join("\n  ")}
</svg>`;
}

/** The hand-writing instructions. Layout matters as much as the words on these pages. */
function toText(page: Page): string {
  const head = [
    `# ${page.id}`,
    ``,
    `WHAT THIS PAGE IS FOR`,
    `  ${page.targets}`,
    ``,
    `HOW TO WRITE IT`,
    `  Paper: ${page.paper}. Write it out by hand in your own writing — the messier the better,`,
    `  that is the point. Don't print. Keep the positions roughly as described: the layout is`,
    `  part of what's being tested. Photograph it in normal room light, whole page in frame.`,
    ...(page.arrows?.length
      ? [
          ``,
          `  Then draw ${page.arrows.length} freehand arrows from block [1] out to the numbered`,
          `  spokes — one per spoke, starting clear of the box. They are part of the layout under`,
          `  test: the vision model has to segment text that arrows run through.`,
        ]
      : []),
    ``,
    `─────────────────────────────────────────────────────────────────────────────`,
    ``,
    ``,
  ];
  const body = page.blocks.map((b, i) => {
    const where: string[] = [];
    if (b.rotate && Math.abs(b.rotate) >= 3) where.push(`rotated ~${Math.round(b.rotate)}°`);
    if (b.boxed) where.push("boxed");
    if (b.underline) where.push(b.underline === "double" ? "double underlined" : "underlined");
    if (b.ink === "red") where.push("in red");
    if (b.ink === "pencil") where.push("in pencil / scruffier");
    const meta = [b.note, where.length ? where.join(", ") : ""].filter(Boolean).join(" — ");
    return [
      `[${i + 1}]${meta ? `  (${meta})` : ""}`,
      ...b.text.split("\n").map((l) => `    ${l}`),
    ].join("\n");
  });
  return `${head.join("\n")}${body.join("\n\n")}\n`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main
   ───────────────────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const outDir = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : "evidence/note-capture/pages";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

mkdirSync(outDir, { recursive: true });
const chosen = only ? PAGES.filter((p) => p.id === only) : PAGES;
if (chosen.length === 0) {
  console.error(`No page matches --only ${only}. Ids: ${PAGES.map((p) => p.id).join(", ")}`);
  process.exit(1);
}

for (const page of chosen) {
  const svgPath = join(outDir, `${page.id}.svg`);
  const pngPath = join(outDir, `${page.id}.png`);
  const jpgPath = join(outDir, `${page.id}.jpg`);
  const txtPath = join(outDir, `${page.id}.txt`);

  writeFileSync(svgPath, toSvg(page));
  writeFileSync(txtPath, toText(page));

  execFileSync("rsvg-convert", ["-w", String(PAGE_W), "-o", pngPath, svgPath]);
  // JPEG at 88, because that is what a phone hands the client and what the 2400px downscale
  // then re-encodes — testing against a pristine PNG would test a file type nobody uploads.
  execFileSync("magick", [
    pngPath,
    "-quality",
    "88",
    "-attenuate",
    "0.4",
    "+noise",
    "Gaussian",
    jpgPath,
  ]);
  rmSync(pngPath);

  console.log(`${page.id}  →  ${jpgPath}  +  ${txtPath}`);
}

console.log(`\n${chosen.length} page(s) in ${outDir}`);
console.log("The .jpg files import straight away. The .txt files are for writing out by hand —");
console.log("only real handwriting exercises the two-model consensus (P21/P22).");
