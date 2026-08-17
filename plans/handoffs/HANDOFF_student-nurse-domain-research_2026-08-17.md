# Capture shipped to beta + announcement sent → next: student-nurse domain research

**Date:** 2026-08-17
**Status:** COMPLETED (this session's build/rollout work) → next session is a RESEARCH task
**Bead(s):** none
**Epic:** none (PlaceMate beta rollout; next: "what should we build next" discovery)
**Chain:** `standalone-b9d39fab` seq `1`
**Parent:** none — first in chain
**Prior chain:** none — first in chain

---

## Reference Documents

- `plans/2026-07-22-connected-spine.md` — **the ethos bible.** North star, locked decisions D1–D11, tone rules. Read this FIRST; the research task exists to serve it.
- `spec/roadmap-usability.md` — the "squeeze the existing screens" philosophy; product intent §0 is the quality bar ("changes my mental model", "can't help but take the next action").
- `spec/spec-note-capture.md` + `spec/spec-note-capture-hardening.md` — the capture feature that just shipped (P1–P45, H1–H12, all DONE).
- `docs/runbooks/beta-recipients.md` — source of truth for who is in the beta and every email they've received.
- `docs/runbooks/beta-invites.md` — how to provision/invite (relevant when Kyra's call happens).
- Memory files (auto-loaded via MEMORY.md): `placemate-ethos`, `beta-engagement-zero`, `note-capture-spec`, `marketing-website`.

## The Goal

PlaceMate turns the scattered work of nursing placement into visible progress toward NMC registration: capture once → it counts toward hours, skills, competency evidence, sign-offs. The second AI layer (photograph handwritten notes → filed, searchable domain records) is now LIVE in production for beta users, and the announcement email went out 2026-08-17 with an explicit ask: reply to book an induction call.

**The next session's goal is different in kind: it is a research task, not a build task.** Ellis is not a nurse. Before choosing the next project, he needs to genuinely understand the student-nurse domain — what placement life is actually like, what the paperwork and assessment machinery is (PAD, proficiencies, supervisor/assessor roles), where the real pain lives — so that the next direction is chosen from domain understanding rather than from what's technically adjacent. Explicitly: the answer may or may not involve AI. The induction calls happening over the next ~2 weeks are live discovery interviews; the research should also arm those calls.

## Where We Are

- **Photo capture is LIVE on app.placemate.uk** for signed-in users. The localhost-only gate (`photoCaptureAvailable()`) was deleted on Ellis's instruction (master `ef0a359`), after all hardening gates passed.
- **Hardening spec is 100% done:** `spec/spec-note-capture-hardening.md` header reads "ALL PHASES DONE — H1–H12 built + gates met on dev, 2026-08-17".
- **H4 (fail-safe when the check model fails):** `checkMissing` flows Lambda → ParseResponse → persisted per NoteBlock → amber "Not double-checked" chip in review. Investigation showed gemma fails by *format drift* (~7% of calls), never throttling.
- **H5 (sanitiser may swap, never extend):** corrections rejected when `to` ⊇ `from` or `to` has more words. Prevents the model "helpfully" expanding a note.
- **Corpus regression net:** 12 real handwritten pages in `tests/pages/`, expectations in `tests/pages/expectations.md`, recorded runs in `tests/pages/runs/{aug10-new-pages,aug10-round1,aug13-full-corpus}/REPORT.md`.
- **Classifier UNKNOWN collapsed 82/110 → 17/60** across the two-round prompt-iteration budget; 15 of the 17 remaining are in-drawing fragments, which the user-approved bar explicitly permits.
- **Margin-note-intrusion bug (user-reported) fixed:** a nominated island can no longer join a drawing's cluster unless contiguous (`f02bfcc`); cluster provenance is now logged.
- **Three-view hard connection shipped:** clicking a node in a rebuilt diagram focuses the corresponding block in the photo and the block list (`5e2540d`, MermaidDiagram `targets`/`onSelect`).
- **Two prod-only rollout gaps found and fixed:** `VITE_PARSE_URL` repo variable was never set (deployed bundle had no parse endpoint), and the CSP blocked the presigned S3 PUT (`12bcd76`) — localhost serves no CSP header, so this class of bug is invisible until production.
- **Announcement email `intelligence-capture` designed through 6 iterations (v1→v6)** and SENT by Ellis on 2026-08-17 to all five provisioned beta students (Francesca, Ruby, Nicole, Darlene, Regine, bcc Ellis) **plus Kyra** as a reply-nudge (she remains `inbound`, NOT provisioned — provision only after her call).
- **The email's foot asks every recipient to REPLY to book an induction call.** Replies arrive at hello@placemate.uk. This is the imminent discovery channel.
- **Runbook updated** (`b534ad7`): per-person send histories + a new Announcements row recording the 2026-08-17 send and the watch-hello@ note.
- **Beta engagement was ZERO as of 2026-08-03:** no beta student has a single row in DynamoDB. Sign-ins are unattributable (auth Lambdas don't log who). 9 "User not found" attempts July–Aug = unprovisioned people trying to sign in = real leads.
- **Existing feature set** (the surface the research maps against): shifts/hours log (2,300-hour target), medication notes, clinical skills tracker, NMC proficiencies/competency tracker with real-PAD-sign-off distinction, reflections (Gibbs), revision timetable, self-care, activity log, ask-your-notes AI recall, and now photo capture.
- **Known parse gaps recorded, deliberately not chased:** SBAR mind-map rebuild absent 3 runs running; lecture "ask about X" → CLINICAL_SKILL; TODO↔OBSERVATION wobble on red reminders; heart-failure page under-coverage; Enoxaparin list flattening (pre-existing).
- **Caps in prod:** 10 photos/day/user, 30 fresh parses/day (fails open), cache hits free (content-addressed by SHA-256 of downscaled bytes).
- Working tree clean, everything on `master`, HEAD = `b534ad7`, all pushed.

## What We Tried (Chronological)

1. **Six new corpus images** (assess → rename → import → reconcile): imported cleanly; surfaced the 82/110 UNKNOWN problem and the margin-note intrusion.
2. **UNKNOWN reduction round 1:** classifier prompt rework (account for every region; type bullets/cautions; UNKNOWN reserved for junk + in-drawing labels) + salvage pass rebuilding guard-failed blocks from their own regions → 82/110 → 17/60. Two-round budget respected; stopped at the user's bar.
3. **Margin-note bug:** user theorised an index swap; disproved with persisted bboxes — actual cause was the unconditional single-cluster union folding region 5 into the flowchart. Fix: contiguity-bounded union chaining outward from the cluster; islands can't jump in.
4. **Full 12-page corpus rerun** (`c1a8b9a`): no regressions; variance separated from regression by re-reads (≥4 runs before model judgments).
5. **H4 build:** first attempt at a check-model contract hit gemma's shape drift — "not JSON" (3440 chars, finish=stop) → trimmed prompt; then a 1102-char valid answer rejected by a too-tight schema → per-entry salvage tolerating bare arrays/string entries; `opens=` logging then revealed a third shape (`[{"blocks":[{...`) → fold array-of-wrappers. All three pinned by tests (`ee574d3`, `6faf9ba`).
6. **H5 build:** swap-never-extend guard in `sanitise.ts`, alongside the existing from-verbatim/no-op/case-only guards (`ef7715e`).
7. **Deploy race lesson:** a gate read ran against a stale Lambda because `gh run list --limit 1` caught the *previous* run's completion. Fixed by SHA-matched waits (`gh run list --json headSha`) or Lambda `LastModified` checks.
8. **Gate removal + prod verification:** probed from the real prod origin (not localhost) → found the missing `VITE_PARSE_URL` and the CSP hole; fixed both; confirmed the Photo button and a full parse in Ellis's signed-in session.
9. **Email v1→v6:** each version answered a specific round of Ellis's feedback (see Evidence table). Screenshots taken window-scoped (never full-screen — see Risks), deployed to placemate.uk, CloudFront invalidated when an edge served a stale image.
10. **Send + runbook:** Ellis sent all six himself; this session logged them and pushed (`b534ad7`). Push needed `-c credential.helper='!gh auth git-credential'` — the osxkeychain helper isn't reachable from this shell.

## Key Decisions

- **Capture ships now, imperfect:** the corpus was judged "large enough for beta" because every failure mode is recoverable in-app (nothing files without the user, photo stays alongside) — the recorded gaps are quality wobbles, not data-loss risks.
- **UNKNOWN bar = junk + in-drawing fragments only** (user-chosen); boxed lists may legitimately be drawings.
- **Kyra gets the announcement despite not being provisioned** — deliberately, as a reply-nudge; she stays `inbound` and is provisioned only after her call.
- **The reply IS the booking mechanism** for induction calls — no scheduling links to break (especially through NHSmail Defender Safe Links).
- **Phase 5 eval of AI recall was SKIPPED** (no safety probing) — standing decision to revisit before any wider release.
- **`/activity` has no nav entry on purpose** (reachable from Home digest only) — don't "fix" it.
- **Assessors/mentors are NOT users** (ethos D11): the student self-reports PAD sign-off. Any research proposal that requires assessor accounts fights a locked decision.
- **Revision + self-care stay** (adjacent aids, not core) — don't propose cutting them.

## Evidence & Data

**Corpus quality trajectory:**

| Measure | Before round 1 | After round 1 | Full-corpus rerun (aug-13) |
|---|---|---|---|
| UNKNOWN blocks (6 new pages) | 82/110 | 17/60 | held |
| …of which in-drawing fragments | — | 15 | held |
| Regressions on the original 6 pages | — | — | 0 |

**Email iteration history (v1→v6, all committed):**

| Ver | Commit | What Ellis asked for |
|---|---|---|
| v1 | `4f2accf` | First draft in the repo's existing template pattern + induction-call foot |
| v2 | `45fbad9` | Headline "Write them, snap them, save them, search them"; diagrams searchable; screenshots; no em dashes; sign-off Nicola & Ellis; slightly promotional |
| v3 | `75af7fe` | Numbered 1-2-3 + 4-as-results (incl. auto-tagged skills/reflections); decoration was "rubbish/garish" → neutral mats; caption "written notes in → certifiable searchable notes out"; fix broken image |
| v4 | `aa93283` | Sweep: smaller page, section-to-section hooks that force reading on |
| v5 | `d1b5d5f` | Every PlaceMate mention two-toned like the logo |
| v6 | `7810532` | Bold PlaceMate + PlaceMate Intelligence (0 nested/0 bare strongs asserted) |

**Beta roster as of 2026-08-17** (source of truth: `docs/runbooks/beta-recipients.md`):

| Person | Status | Emails received | DynamoDB data |
|---|---|---|---|
| Francesca (Gmail) | invited 2026-07-24 | welcome-beta, magic-link, intelligence-recall, intelligence-capture | none (as of 08-03) |
| Ruby (Live) | invited 2026-07-24 | same four | none |
| Nicole (Hotmail) | invited 2026-07-24 | same four | none |
| Darlene (NHSmail) | invited 2026-08-03 | welcome-beta, magic-link, intelligence-recall, intelligence-capture | none |
| Regine (Hotmail) | invited 2026-08-03 | magic-link, intelligence-recall, intelligence-capture | none |
| Kyra (iCloud) | **inbound — NOT provisioned** | intelligence-capture (reply-nudge) | n/a |

**Sign-in signals (21 Jul–3 Aug):** 7 successful magic-link verifications (unattributable), 9 "User not found" attempts (unprovisioned emails — leads), 1 `Invalid redirectUri: undefined` failure.

**Parse pipeline (4 model calls per page):** qwen3-vl structure + gemma-3-27b check in parallel → deepseek sanitise → glm-5 classify; ~70–110s end-to-end, streamed over SSE from a Lambda Function URL.

**Prod-only gaps found on rollout (the three-gates lesson):** a new origin needs (1) endpoint CORS, (2) bucket CORS, (3) the page CSP in `infra/lib/constructs/web.ts` — localhost serves no CSP header so proves nothing about the third.

**Check-model (H4) failure investigation:** gemma-3-27b fails by *format drift* in roughly 7% of calls (finish reason always `stop`, never throttling, never truncation) — which is why the fix was schema tolerance + a fail-safe chip, not retries. Three observed drift shapes, all now folded and pinned by tests: plain-text non-JSON (3,440 chars), a bare array of strings (1,102 chars), and array-of-wrappers `[{"blocks":[...]},...]`.

**Deploy race, concretely:** the stale gate read hit a Lambda with `LastModified 06:25:16` while the invocation ran at `06:34:54` — `gh run list --limit 1` had matched the *previous* pipeline run. Verify deploys by `gh run list --json headSha` matched to your commit, or by the Lambda's `LastModified`, never by "latest run is green".

**Send command pattern** (for any future announcement; `--dry-run` renders `preview.html` and sends nothing):

```
cd emails && ./send.sh intelligence-capture --to <email> --name <First> --bcc ellis@placemate.uk
# Kyra's variant carried: --var "footer_reason=You're receiving this because you asked to join the PlaceMate beta."
```

Dogfood-first convention: every template went to `ellis.taylor499@gmail.com` before any student. Images must be absolute `https://placemate.uk/...` URLs deployed to `site/public/` first; a stale CloudFront edge once served a broken image → fix is an invalidation on distribution `E1IRM1Q7HVVAWJ`, not a re-upload.

**Screenshot technique (reusable):** window-scoped only — Swift `CGWindowListCopyWindowInfo` to find the window ID, then `screencapture -x -o -l<id>`; crop via `getBoundingClientRect` + empirical 236px chrome offset at dpr 1.8 / 90% zoom.

## Code Analysis

- `infra/lambda/parse/sanitise.ts` — guard chain: from-verbatim present + not case-only + `!to.includes(from)` + `wordCount(to) <= wordCount(from)`; rejected corrections logged, never applied.
- `infra/lambda/parse/schema.ts` — `checkResponseSchema` preprocess folds three drift shapes (array-of-wrappers, bare array, string entries) with per-entry `rawText` salvage.
- `infra/lambda/parse/diagram.ts` — `mergeNomination`: 0 clusters→standalone, 1→contiguity-bounded union (adjacency chaining outward), ≥2→ignored.
- `src/react/components/MermaidDiagram.tsx` — `targets`/`onSelect` props + click-listener effect that never re-renders the SVG.
- `src/react/components/capture/config.ts` — gate function deleted; CaptureButton hides only for guests.
- Caps: `DAILY#PHOTO#date#PAGE#hash` idempotent markers (10/day), `DAILY#PARSE` (30/day, fails open).
- kms:Sign is ungrantable in this account — the test harness authenticates with `PARSE_REFRESH_TOKEN` instead.
- Model contracts are null-tolerant throughout the parse pipeline (a model omitting a field degrades gracefully rather than failing the parse) — a deliberate posture worth carrying into any next AI feature.
- **Bedrock model availability (matters if the research recommends an AI direction):** Claude Sonnet 5 is LIVE on Bedrock in this account as of 2026-08-13 (Error 002 lifted; invoke via the `eu.anthropic.claude-sonnet-5` inference profile). The current parse pipeline predates this and runs on qwen3-vl/gemma/deepseek/glm-5; a Sonnet 5 consolidation was never evaluated.

## Files Changed (this session, all pushed)

### Source / infra
- `infra/lambda/parse/{sanitise,vision,schema,classify,diagram,index}.ts` — H4/H5 + UNKNOWN reduction + cluster fix + drift tolerance
- `infra/lib/constructs/web.ts`, `infra/lib/nurse-planner-stack.ts` — capture bucket origin into CSP
- `src/react/components/capture/{config,ReviewPanel,blockState}.ts(x)`, `src/react/components/MermaidDiagram.tsx` — gate removal, unchecked chip, three-view focus
- `src/domain/types.ts` — `NoteBlock.checkMissing?: boolean` (+ regenerated zod)

### Tests & evidence
- `tests/pages/expectations.md`, `tests/pages/runs/{aug10-new-pages,aug10-round1,aug13-full-corpus}/REPORT.md`

### Email & docs
- `emails/templates/intelligence-capture/*` (v1→v6)
- `site/public/email-capture-{review,ask-drawing}.png` (deployed, CloudFront invalidated)
- `spec/spec-note-capture-hardening.md` — marked ALL DONE
- `docs/runbooks/beta-recipients.md` — the 2026-08-17 send logged

## User Feedback & Preferences (REQUIRED — never omit)

- **"82/110 unknown blocks is awful"** — Ellis notices quality numbers and expects them driven down; quantify before/after.
- **Tone calibration is precise:** "slightly more promotional… still mostly informational"; v2's decoration was "rubbish/garish" → wants polish that *blends*, never decoration for its own sake.
- **No em dashes, ever, in outward copy.** Also: no "reads the page twice by two readers" style mechanics-exposure — say the *benefit*, not the plumbing (final copy says "reads it twice" without mentioning reader counts).
- **Generic marketing phrases rejected:** "real entries" was "too generic" → replaced with the concrete "written notes in → certifiable, searchable notes out".
- **Brand rendering matters:** every PlaceMate mention two-toned (`place` ink #16212f, `mate` emerald #059669) and bold; sign-off "Nicola & Ellis" (Nicola's voice fronts student-facing email).
- **Ellis executes sends himself** — this session designs and provides commands; he runs them. Keep it that way.
- **Work directly on master, push to master** (auto-deploys by path). **All AWS via `--profile personal`.** Never touch the corporate account (987960985651).
- **Format only touched files** — never whole-repo prettier.
- **Never full-screen `screencapture`** — one capture caught another client's data on screen (deleted immediately, nothing used). Window-scoped (`-l<CGWindowID>`) only. This constraint stands permanently.
- **Ellis asks "why" and tests theories** (the index-swap theory) — he wants investigation with evidence (the bbox disproof landed well), not agreement.
- **He self-identifies as not a nurse** and wants domain understanding "so that we can vibe in the right direction" — the research deliverable should be plain-English education for HIM first, product strategy second.

## Where We're Going (the research task — the whole point of this handoff)

**Task: understand what might help student nurses (AI or no AI) improve their experience further. Domain education for Ellis to steer the next project.**

1. **Domain primer for Ellis** (plain-English, no assumed nursing knowledge). Map the machinery a UK student nurse lives inside — as *research seeds to verify, not established facts*: the NMC Future Nurse standards (2018) and their 7 platforms + annexes; the Practice Assessment Document (PAD — e.g. the pan-London PLPAD) and what filling it in actually involves; practice supervisor vs practice assessor vs academic assessor roles (SSSA 2018); supernumerary status; the ~2,300 practice-hours requirement PlaceMate already tracks; episodes of care and medicines-management assessments; OSCEs and medication-calculation exams; preceptorship after registration.
2. **Pain-point research from primary-ish sources:** RCN student resources, HEE/NHS England reports, the RePAIR report on attrition (worth verifying — attrition is reputedly ~25%+), NHS Learning Support Fund and placement travel/cost pain, student forums (r/StudentNurseUK etc.), recent surveys. Separate *structural* pain (money, travel, rota chaos) from *paperwork/assessment* pain (PAD duplication, chasing sign-offs, evidence anxiety) from *confidence* pain (feeling unsafe, not knowing things, fear of medication errors). Further seed threads worth pulling (all to verify): "belongingness" as a placement-experience factor in the nursing-education literature; hub-and-spoke placement models; medication-calculation competency tools (e.g. safeMedicate) as an exam students fear; the practice-assessor engagement lottery (quality of sign-off experience varies wildly by ward); and whether any incumbent apps already own a niche here (PAD-adjacent tools, revision apps like Quesmed/Passmed equivalents for nursing) — the competitive gap matters as much as the pain.
3. **Opportunity map, ranked against the ethos.** Every candidate scored against: capture-once→registration spine, shift-as-spine, payoff-on-capture, encouraging-never-nagging, "your notes not guidance", assessors-are-not-users. Explicitly include non-AI candidates. Note which locked decisions (D1–D11) a candidate would bend.
4. **Induction-call discussion guide** — the calls ARE discovery interviews. Questions that test the research's hypotheses against real students (e.g. "walk me through what you do with the PAD after a shift", "what did you write down last week that went nowhere?"). Nicola (RN co-founder) is the in-house domain checkpoint for anything the research is unsure of.
5. **Synthesis: a short "next project direction" note** for Ellis to react to — 2–3 candidate directions, not one recommendation, each grounded in a named pain point and a named ethos principle.
6. Suggested homes: `docs/research/` for the primer + findings, `plans/` for the direction note. Nothing in this task modifies app code.

## Risks & Blockers

- **Beta engagement is the elephant:** zero data from any beta student as of 2026-08-03, and sign-ins are unattributable. If nobody replies to the email, the calls (and the discovery channel) don't happen — Ellis may need to chase individually. The observability fix (log email/sub in VerifyAuthChallenge + a per-request user line in the router) is specced-in-memory but unbuilt.
- **Darlene is on NHSmail** — Defender Safe Links rewrites URLs; if her sign-in link misbehaves, ask her for a personal address.
- **UCLH WiFi block** on placemate.uk (newly-registered-domain filter) was due to age out ~2026-08-09 — unverified since; students on hospital WiFi may still be blocked.
- **AI-recall Phase 5 eval (safety probing) was skipped** — must be revisited before any wider release; the research may recommend widening, so this gate matters.
- Research-specific: web sources on nursing education drift out of date (standards revised periodically); verify against NMC primary sources, and treat this handoff's domain seeds as unverified.

## Open Questions

- Which of the six will actually reply and book a call? (Watch hello@placemate.uk.)
- Has ANY beta student signed in since 2026-08-03? (Unanswerable until the observability fix lands — is that fix worth doing before the calls?)
- What does a student actually do, step by step, between end-of-shift and PAD sign-off? (The core workflow PlaceMate wants to eat; nobody on the team has watched it happen.)
- Is the biggest lever more capture (deeper into PAD territory), more recall (revision/confidence), or something structural we haven't seen (rota, travel, money)?
- Do students trust an app with quasi-clinical content enough to use it on-ward, given "your notes not guidance"?

## Quick Start for Next Session

```bash
# THIS IS A RESEARCH TASK — no build. Read the ethos first:
#   plans/2026-07-22-connected-spine.md   (north star + locked decisions D1-D11)
#   spec/roadmap-usability.md             (§0 product intent = the quality bar)
#   docs/runbooks/beta-recipients.md      (who the six beta students are)

# Current product surface (what research maps against):
ls spec/            # one spec per feature; spec-note-capture*.md just shipped
git log --oneline -20

# Verify current state (should be clean, HEAD b534ad7 or later):
git status -sb

# Next action: start the domain primer (Where We're Going step 1) —
# NMC 2018 standards / PAD / SSSA roles / placement structure, written
# plain-English for a non-nurse, with every claim source-linked.
# Suggested output: docs/research/student-nurse-domain-primer.md
```
