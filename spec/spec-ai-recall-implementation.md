# Spec — AI Recall Implementation Guide (agent execution order + human-in-the-loop)

_The build playbook for [`spec-ai-recall.md`](./spec-ai-recall.md) (decisions D1–D19).
Turns the spec into an ordered sequence an implementing agent follows, with the actions
**you** (the human) must take called out inline. Read the spec first; this guide assumes
its vocabulary (sentinel tags, corpus, thread model, SSE protocol)._

## How to use this

- Work **phase by phase, in order**. Each phase is independently deployable and
  verifiable; don't start a phase until the previous **GATE** is signed off.
- **The golden rule: prove the whole seam end-to-end with ONE streamed answer
  (Phase 1) before building breadth (threads, UI, polish).** Depth before width.
- Legend:
  - **[AGENT]** — implementing agent does this (code, tests, IaC authoring, CLI checks).
  - **[YOU]** — human-only action (console clicks, sign-offs). Agent **stops and asks**.
  - **[GATE]** — checkpoint before the next phase.
- Standing rules: all AWS ops use **`--profile personal`** (account 641364901830,
  eu-west-2 — never the corporate account); prettier only on touched files; the
  existing $-budget + deny-list autonomy posture from
  [`spec-implementation-roadmap.md`](./spec-implementation-roadmap.md) applies.

## 0. What I need from you — front-loaded checklist

| When | Action | Why |
|---|---|---|
| ⏳ **Now** (lead time possible) | **[YOU]** Bedrock console (eu-west-2) → Model access → enable **Anthropic Claude** models | Some model grants are instant, some queue for review. Nothing works without it. |
| Phase 0 | **[YOU]** Confirm you're happy with Budgets alert emails going to your usual address | The $50/$150/$400 alerts (D11) need a recipient. |
| Phase 5 | **[YOU]** Sign off all copy: system prompt guardrails, first-use notice, caption, guest teaser line, launch email (D19) | You are the sole copy gate — no RN review pre-beta. |
| Phase 6 | **[YOU]** Approve the launch email send to the `aiRecallInterestAt` list | External-facing send; scripts are dry-run by default. |

---

## Phase 0 — Enablement & ground truth (no app code)

Goal: Bedrock provably invokable on this account, in-region, on credits, before any
code exists.

1. **[YOU]** Enable Anthropic model access (checklist above).
2. **[AGENT]** Discover the Sonnet 5 serving path in eu-west-2:
   `aws bedrock list-foundation-models` + `list-inference-profiles --profile personal`.
   Record in this file's appendix which ID/ARN serves it (direct `anthropic.claude-sonnet-5`
   vs `eu.` cross-region profile) — **whatever keeps inference in-EU**. If Sonnet 5
   isn't offered yet in eu-west-2, stop and present options (wait / EU profile /
   Sonnet 4.6 interim) — do not silently pick a US region.
3. **[AGENT]** CLI smoke test: one `InvokeModelWithResponseStream` call ("say hello"),
   confirm streamed chunks and that the charge appears under Bedrock in this account.
4. **[AGENT]** Create the SSM kill-switch parameter (`/nurse-planner/ai/enabled` =
   `"true"`) and the AWS Budgets alerts at $50/$150/$400 filtered to Bedrock spend
   (IaC in the app stack where practical; Budgets may sit account-level).
5. **[AGENT]** Baseline token maths: run `count_tokens`-equivalent sizing on a realistic
   corpus (seeded dev user) to sanity-check the $0.01–0.05/question estimate.

**[GATE 0]** A streamed Bedrock response from eu-west-2 shown in the terminal; model ID
recorded; kill switch + budgets exist. **[YOU]** eyeball the Bedrock console cost page
once so you know where to look.

---

## Phase 1 — Thin vertical slice: one streamed answer (depth first)

Goal: `curl` with a real Cognito token → AI Lambda Function URL → JWT verify → Cedar →
corpus from dev DynamoDB → Bedrock → SSE stream with a working `<note ref/>` tag.
**No threads, no persistence, no UI.**

Files: `infra/lambda/ai/index.ts` (new), `infra/lambda/ai/{auth,corpus,prompt,stream}.ts`,
`infra/lib/constructs/ai.ts` (new construct wired into `nurse-planner-stack.ts`).

1. **[AGENT]** CDK: Node Lambda (streaming response mode, 60s timeout, 512MB) + Function
   URL (CORS: app.placemate.uk + localhost); IAM scoped to
   `bedrock:InvokeModelWithResponseStream` on the recorded ARN(s) + table read.
2. **[AGENT]** Auth: `aws-jwt-verify` against the existing user pool (same access token
   the SPA holds) → Cedar `Action::"aiAsk"` via the existing `authorize()` machinery
   (add the action to the policy store IaC) → audit-log entry (existing pattern).
3. **[AGENT]** Corpus assembly: reuse `DynamoRepository` owner-partition reads; format
   entity blocks per spec §Prompt design; **exclude `SelfCareCheckin` at assembly level
   with a unit test asserting it** (D4). Chronological; >150k-token truncation guard.
4. **[AGENT]** Prompt: frozen system prompt v1 (full contract per spec) with
   `cache_control` breakpoints after system and corpus; question last.
5. **[AGENT]** SSE protocol exactly per spec (`meta`/`delta`/`done`/`error`); map
   Bedrock throttles/errors to `THROTTLED`/`UPSTREAM`; kill switch check → `KILLED`.
6. **[AGENT]** Typecheck: the new lambda joins a tsconfig that actually runs in CI —
   do **not** inherit the `infra/lambda/**` typecheck hole; fix the gap at least for
   `infra/lambda/ai/**`.
7. **[AGENT]** Verify on dev: seeded notes; `curl -N` with a real token; confirm
   (a) streamed markdown, (b) a syntactically valid `<note ref>` matching a real entity
   ID, (c) 401 without token, (d) `usage.cache_read_input_tokens > 0` on the second
   identical-corpus call, (e) kill switch flips to `KILLED` without redeploy.

**[GATE 1]** You watch one live `curl` session end-to-end and sign off the answer
quality is plausible. **Deployment note:** the CI backend path-filter currently misses
`src/**` for lambda bundles — the AI lambda imports `src/data/**`; **[AGENT]** update
`.github/workflows` path filters in this phase so pushes deploy it correctly.

---

## Phase 2 — Persistence: threads, messages, caps, read routes

Goal: the slice becomes durable — persistent chat data model (D15/D16) + daily cap.

Files: `src/domain/types.ts` (+`gen:zod`), `infra/lambda/ai/*`,
`infra/lambda/router/index.ts`, `src/data/dynamo/*` as needed.

1. **[AGENT]** Entities per spec §Data model: `AiThread`, `AiMessage`, `AiDailyCount`,
   `User.aiFirstUsedAt?` — one `gen:zod` run. **No Dexie/sync registration** (D16).
2. **[AGENT]** `ask` flow: create-or-load thread; persist the user `AiMessage`
   immediately; persist the assistant `AiMessage` on `done` **and** on abort
   (`stopReason:"aborted"`, partial content); bump thread `messageCount`/`lastMessageAt`;
   auto-title on thread creation (first question, ~60 chars).
3. **[AGENT]** History-in-prompt: last ~8k tokens of turns between corpus and question;
   50-message soft cap → `error` code `THREAD_FULL` (client will nudge "new chat").
4. **[AGENT]** Daily cap: `AiDailyCount` (`id = ${userId}:${isoDate}`, TTL 48h),
   increment-and-check before Bedrock; over → `CAP` error with reset time; remaining
   count included in `meta` frames so the UI can show "5 left".
5. **[AGENT]** Router RPC additions (existing dispatch + AVP gate):
   `ai/listThreads`, `ai/getThread`, `ai/deleteThread` (hard delete thread+messages),
   `ai/feedback` (`UP`/`DOWN` + optional comment).
6. **[AGENT]** Tests: unit (cap rollover/TTL, title truncation, history budget,
   self-care exclusion) + an integration pass against dev.

**[GATE 2]** `curl` conversation across two turns shows the second answer using
first-turn context; rows visible in the table; cap manually driven to exhaustion and
reset verified; delete removes everything.

---

## Phase 3 — Frontend: the teaser becomes real

Goal: full UX per spec §UX states. **The only phase with major UI risk — demo early.**

Files: `src/react/components/ai/` (new: `AskNotesPanel.tsx`, `AskThread.tsx`,
`ThreadList.tsx`, `NoteCard.tsx`, `MoreChip.tsx`, `useAiStream.ts`, `sentinelParser.ts`),
`home/AiRecallTeaser.tsx` (replaced/repurposed), `AppLayout.tsx` (global ask bar),
`src/data/api/*` (SSE client + RPC calls + session read-cache).

1. **[AGENT]** `sentinelParser.ts`: incremental parser for `<note ref/>` / `<more/>`
   inside streamed markdown; fail-closed on malformed/unknown; unit-test heavily
   (split-across-chunks tags, nested markdown, injection attempts).
2. **[AGENT]** `NoteCard`: resolve `TYPE:id` **from the local DB** (guest-visible
   entities all exist locally for a synced user); render the real note + deep link to
   its screen; unknown id → render nothing (fail closed, D17).
3. **[AGENT]** `MoreChip`: client-side source registry → search URLs (D10);
   `target="_blank" rel="noopener"`.
4. **[AGENT]** `AskNotesPanel` (one shared component, D8): input, thread view,
   `ThreadList` history (open/delete), streaming render with stop button, feedback
   thumbs (+comment on 👎), all states: first-use notice (auto-dismiss on first send →
   `aiFirstUsedAt`), persistent caption, cap countdown/`CAP`, `KILLED` banner,
   `THROTTLED`/`UPSTREAM` retry keeping partials, `THREAD_FULL` nudge.
5. **[AGENT]** Mounting: Home hero slot replaces the teaser internals ("Coming soon" →
   "New" badge, mock bar → real panel); **global ask bar** affordance in `AppLayout`
   header opens the same component as an overlay. Guest: teaser stays, copy → sign-in
   variant (D14) — reuse the existing demo animation.
6. **[AGENT]** Read cache: session-scoped memo over `listThreads`/`getThread` (D16);
   server remains source of truth (refetch on overlay open).
7. **[AGENT]** Tests: parser unit suite; component tests for state machine; a
   Playwright-or-manual scripted pass on dev (per repo norm).

**[GATE 3]** **[YOU]** click through on dev: ask → note card pops mid-stream → link
opens the reflection; history persists across refresh; guest view; cap/kill states
(forced via SSM flip). Sign off look/feel against the teaser's promise.

---

## Phase 4 — Guardrails hardening & observability

Goal: the failure modes are boring before real students touch it.

1. **[AGENT]** Metrics (EMF): `Questions`, `Errors{code}`, `LatencyMsP95`, token
   counts, `CacheHitRate`, `CapHits`. Alarms via `constructs/alarms.ts`: error-rate;
   **zero-cache-reads-over-24h** (the silent cost bug); optional daily-spend metric.
2. **[AGENT]** Load/abuse sanity: parallel-request behaviour (cap race — accept
   last-writer-wins overshoot of ±1–2), oversized question guard (~2k chars), rate of
   thread creation.
3. **[AGENT]** Re-verify the full error-state matrix live on dev (each `error` code
   driven for real at least once).

**[GATE 4]** Alarms visible in CloudWatch and one test alarm fired to email.

---

## Phase 5 — Eval harness, prompt iteration, copy sign-off

Goal: quality proven repeatably; words approved (D18/D19).

1. **[AGENT]** `scripts/eval-ai-recall.ts` (dry-run-safe, like the beta scripts):
   seeds/uses a dedicated **test user** corpus (~25 notes, all entity types, one locked
   reflection, one injection-attempt note); runs ~30 cases from spec §Eval plan against
   the real dev endpoint; mechanical asserts (note-ID correctness, ≤3 refs, labels,
   error codes, no directive dosing language via denylist heuristics); writes a
   transcript file for eyeball review.
2. **[AGENT]** Iterate the system prompt until the harness is green and transcripts
   read well; every tweak = a rerun (cheap: cached corpus).
3. **[AGENT]** Draft all copy in-repo: system prompt final, first-use notice, caption,
   guest teaser line, launch email (new `emails/` template).
4. **[YOU]** **Copy sign-off** — the D19 gate. Also skim 5–10 transcripts.

**[GATE 5]** Harness green + transcripts approved + copy signed off.

---

## Phase 6 — Launch

1. **[AGENT]** Deploy everything to the live stack (push to master per CI; confirm the
   Phase-1 path-filter fix carried the lambda). Verify prod env vars/SSM/alarms.
2. **[AGENT]** Live smoke test on app.placemate.uk with your own account: ask → note
   card → link; second question cache-hit; cap counter visible; kill switch flip +
   restore.
3. **[YOU]** Approve the email send. **[AGENT]** Send the launch email to the
   `aiRecallInterestAt` list via the existing tooling (dry-run first); record
   recipients in `docs/runbooks/beta-recipients.md`.
4. **[AGENT]** Ops notes: new runbook `docs/runbooks/ai-recall.md` (kill switch, cap
   tuning, budget alerts, how to read Q&A for quality review responsibly); update
   spec status lines (`spec-ai-recall.md` → BUILT, plans README, memory).
5. **[AGENT]** Post-launch watch: first 48h — check alarms, spend, cache-hit rate,
   thumbs; summarise findings.

**[GATE 6 / Done]** Three beta students can use it; spend visible and sane; promise to
the notify-me list honoured.

---

## Cross-phase cautions

- **CI deploy gaps (known):** backend deploy path-filter misses `src/**`; deploys don't
  gate on CI. Phase 1 fixes the filter for the AI lambda; don't rely on green CI as a
  deploy gate — verify live after each phase's push.
- **`infra/lambda/**` typecheck hole:** the AI lambda must not join it (Phase 1 §6).
- **Never** let a non-AWS dependency into the ask path (D-hard-constraint): no external
  search/telemetry/LLM SaaS.
- **Prompt changes invalidate the cache** — batch prompt tweaks; expect a cold first
  question after each deploy.
- **Model swap escape hatch:** model ID is config; if Sonnet 5 quality disappoints,
  Opus 4.8 is a one-line change (accepting ~2× cost and a cache rebuild).

## Appendix — filled in during Phase 0

- **Sonnet 5 serving path in eu-west-2 (verified 2026-07-24):** the base model
  `anthropic.claude-sonnet-5` is listed directly in eu-west-2 (ACTIVE, streaming
  supported). Invoke via the **EU cross-region inference profile
  `eu.anthropic.claude-sonnet-5`** (ACTIVE) — in-EU routing with capacity resilience.
  A `global.anthropic.claude-sonnet-5` profile also exists — **do not use** (leaves EU).
  IAM note: `InvokeModelWithResponseStream` needs the inference-profile ARN **and** the
  underlying foundation-model ARNs in the resource list.
- **Kill switch:** SSM `String` param `/nurse-planner/ai/enabled` = `"true"` created
  (eu-west-2). Flip to `"false"` to disable the ask endpoint without redeploy.
- **Model access:** NOT yet granted as of 2026-07-24 (`Error 002` on converse) —
  blocked on the [YOU] console step (Bedrock → Model access → enable Anthropic;
  involves accepting the EULA/use-case form). Smoke test (Phase 0 §3) and token
  baseline (§5) pending that grant.
- Budgets alert recipient: _(TBD — confirm address)_
- Cost baseline from Phase 0 §5: _(TBD — after model access)_
