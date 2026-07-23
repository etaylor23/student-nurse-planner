---
title: "Unit conversions for nursing drug calculations"
description: "Master the g → mg → microgram ladder and mL/L conversions for nursing — the ×1,000 rule, worked examples, common traps, and a practice set with answers."
pillar: "drug-calculations"
isPillar: false
draft: true
datePublished: 2026-07-22
author: "placemate-team"
---

<!--
  WAVE 3 — staged draft. GATED ON PHARMACIST REVIEW (spec-seo-growth.md §4/§9: the
  med-numeracy cluster requires [PHARM] sign-off before publish). To publish after review:
  set draft:false, update datePublished, add to llms.txt + llms-full.txt.
  All arithmetic in this piece has been machine-verified; pharmacist review is the
  clinical-framing gate.
-->

Every conversion you need for nursing drug calculations runs on one rule: **each step down the ladder — grams to milligrams to micrograms — multiplies by 1,000; each step up divides by 1,000.** The same rule connects litres and millilitres. Most calculation errors are unit errors, so this is the highest-value ten minutes of practice in medicines maths. (This guide is for practice and study only; the [pillar guide](/guides/nursing-drug-calculations) covers the dose and rate formulas the conversions feed into.)

## The ladder

```
grams (g)  ×1,000 →  milligrams (mg)  ×1,000 →  micrograms
grams (g)  ← ÷1,000  milligrams (mg)  ← ÷1,000  micrograms

litres (L)  ×1,000 →  millilitres (mL)
```

Going **down** to a smaller unit, the number gets **bigger** (multiply). Going **up** to a larger unit, the number gets **smaller** (divide). If your converted number moved in the wrong direction, you've inverted the operation — the most common conversion slip there is.

## Worked conversions

| Convert | Operation | Answer |
|---|---|---|
| 0.5 g → mg | 0.5 × 1,000 | 500 mg |
| 0.125 g → mg | 0.125 × 1,000 | 125 mg |
| 250 micrograms → mg | 250 ÷ 1,000 | 0.25 mg |
| 62.5 micrograms → mg | 62.5 ÷ 1,000 | 0.0625 mg |
| 1.5 L → mL | 1.5 × 1,000 | 1,500 mL |
| 750 mL → L | 750 ÷ 1,000 | 0.75 L |

The multiply/divide-by-1,000 shortcut is a decimal shift: three places right to multiply, three places left to divide. 0.125 g → 125 mg is just the point moving three places right.

## The traps

- **Same amount, different clothes.** 0.5 mg and 500 micrograms are identical. Prescriptions and stock labels often use different units for the same medicine — convert to one unit *before* the [dose formula](/guides/nursing-drug-calculations), never during.
- **The invisible leading zero.** Write **0.5**, never .5 — a naked decimal point is easily missed, turning 0.5 into 5. (This is also why prescribing guidance prefers 500 micrograms over 0.5 mg in the first place.)
- **µg, mcg, micrograms.** Write **micrograms** in full. The abbreviations are misread as mg — a thousand-fold error waiting to happen.
- **Trailing zeros.** 5 mg, not 5.0 mg — a missed point turns 5.0 into 50.
- **Two-step conversions.** Grams to micrograms is ×1,000,000 (two ladder steps). Take the steps one at a time: 0.001 g → 1 mg → 1,000 micrograms.

## Practice set

Cover the answers, work through, then check. Full working beats a fast guess — in tests and on wards alike.

1. Convert 0.75 g to milligrams.
2. Convert 250 micrograms to milligrams.
3. Convert 1.2 L to millilitres.
4. Convert 0.06 g to milligrams.
5. Convert 125 micrograms to milligrams.
6. Convert 2,500 mL to litres.
7. Convert 0.4 mg to micrograms.
8. Convert 5,000 micrograms to milligrams.

**Answers:** 1) 750 mg · 2) 0.25 mg · 3) 1,200 mL · 4) 60 mg · 5) 0.125 mg · 6) 2.5 L · 7) 400 micrograms · 8) 5 mg

If any of these took more than a few seconds, that's not a knowledge gap — it's a fluency gap, and fluency is buildable. Our free [drug calculation practice tool](/tools/drug-calculation-practice) generates unlimited conversion questions (among others) with instant checking, and the [common mistakes guide](/guides/drug-calculation-common-mistakes) covers the errors conversions feed into.

## Frequently asked questions

**How many micrograms are in a milligram?**
1,000 micrograms = 1 mg, and 1,000 mg = 1 g. Every step of the ladder is a factor of 1,000.

**Why do prescriptions say "micrograms" instead of µg or mcg?**
Because µg and mcg are easily misread as mg — a thousand-fold error. UK guidance is to write micrograms (and nanograms) in full.

**What's the quickest safe way to convert?**
Shift the decimal three places — right for multiplying (larger→smaller unit), left for dividing (smaller→larger) — then sanity-check the direction: smaller unit means a bigger number.

**Do I need conversions if I'm using a calculator?**
Yes — the calculator computes whatever you type. Choosing the conversion, its direction and the units is exactly the part it can't do for you.

---

*Practice only — real doses come from the prescription, local policy and a registered checker. Drill the ladder with our free [drug calculation practice tool](/tools/drug-calculation-practice).*
