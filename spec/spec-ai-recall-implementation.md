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
   URL (CORS: app.placemate.uk + localhost); IAM scoped to Bedrock invoke on the
   recorded ARN(s) + table read. **D6a:** the model call goes through a small
   **provider adapter** targeting `bedrock-mantle.eu-west-2.api.aws` with SigV4
   (verified): `openai-compat` route (interim open-weight model, streaming chat
   completions) and `anthropic` route (Sonnet 5 Messages API + cache_control, enabled
   post-support-case). `AI_MODEL_ID` + `AI_PROVIDER` are Lambda env config.
2. **[AGENT]** Auth: `aws-jwt-verify` against the existing user pool (same access token
   the SPA holds) → Cedar `Action::"aiAsk"` via the existing `authorize()` machinery
   (add the action to the policy store IaC) → audit-log entry (existing pattern).
3. **[AGENT]** Corpus assembly: reuse `DynamoRepository` owner-partition reads; format
   entity blocks per spec §Prompt design; **exclude `SelfCareCheckin` at assembly level
   with a unit test asserting it** (D4). Chronological; >150k-token truncation guard.
4. **[AGENT]** Prompt: frozen system prompt v1 (full contract per spec); question
   last. `cache_control` breakpoints after system and corpus apply on the `anthropic`
   provider only (no caching on the interim path — D6a); tighten the confidence-gate
   wording while on the interim model.
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
quality is plausible. *Status 2026-07-26: slice BUILT + DEPLOYED + verified live —
streamed SSE answer in ~2s on `deepseek.v3.2` via mantle; valid `<note ref="SHIFT:…"/>`
resolving to a real record (verbatim-by-ID contract held); no-note path gave the
capture nudge; 401/405/CORS negatives pass; kill switch flips to `KILLED` and back
without redeploy. Two live fixes folded in: ESM `createRequire` banner; mantle IAM is
`bedrock-mantle:CreateInference` on `project/*` (not `bedrock:InvokeModel*`).
`listProficiencies` comes from the static seed (Dynamo stub until Phase 2). Cache-read
assertion deferred to the Sonnet swap (no caching on the interim route). Awaiting
Ellis's quality sign-off.* **Deployment note:** the CI backend path-filter currently misses
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

*Status 2026-07-26: **GATE 2 PASSED** — built, deployed and verified live end-to-end.
Two-turn conversation on one thread: turn 1 opened thread `9845f401…` with
`remaining: 29`; turn 2 answered "what was that feedback you just mentioned?" correctly
(input tokens 744 → 866, i.e. history really was replayed) — a question unanswerable
without persistence. `ai/getThread` returned all 4 turns in order with `noteRefs`,
`stopReason` and token counts stored per message; `ai/listThreads` showed
`messageCount: 4` and the auto-title; `ai/feedback` stored `UP` on the right message;
error paths returned `not_found` (unknown + foreign thread id) and `bad_request` (bad
feedback value). Daily cap verified live by setting the counter row to 30 → `CAP` error
with the friendly copy, then restoring the true count. `ai/deleteThread` left only the
`DAILY#` counter in the partition and `listThreads` returned empty. Automated coverage —
16 new tests against
in-process DynamoDB (306 total passing) covering thread round-trip, chronological
message order, cross-user partition isolation, cap countdown/refusal/per-user scoping,
counter TTL, feedback hit+miss, history trimming in whole exchanges, note-ref
extraction, and two guardrail tests: `syncPull` never carries AI rows, and
`resetDatabase` purges AI chat. Live negatives pass (401 no/bad token, 405 GET, 401 on
`ai/*` RPC without a token).*

**Design note — storage partition.** D16 says "the user's partition"; the build uses a
sibling `AI#<sub>` partition instead. `syncPull` scans `USER#<sub>` wholesale and ships
every row to the client, where `applyRemote` resolves `db[entityType]` — an
unregistered `aiThreads` store is `undefined` and throws, breaking sync for anyone who
used the feature. A separate partition makes that exclusion structural. `resetDatabase`
purges both partitions so "Clear all data" still means all of it.

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

*Status 2026-07-26: BUILT + DEPLOYED LIVE to app.placemate.uk (manual `target=frontend`
dispatch — see the CI note below). Ask URL confirmed present in the served bundle; guest
path re-verified in production (Ask button hidden, sign-in copy, badge + demo intact, no
console errors). Components:
`sentinelParser.ts` (+13 tests), `aiClient.ts`, `useAskNotes.ts`, `NoteCard.tsx`,
`AskNotesPanel.tsx`, `AskNotesButton.tsx`, teaser rewired, `VITE_AI_ASK_URL` wired through CI.
Verified in-browser on the **guest** path: no Ask button, "Sign in to use the full
version" copy, coming-soon badge + scripted demo retained, no console errors. 319 tests,
lint + typecheck clean. **Signed-in path needs a live session, so it is Ellis's Gate 3
click-through** (below). One CI-only bug caught and fixed: `infra/.gitignore`'s blanket
`*.d.ts` silently excluded the lambda's hand-written ambient types, so local typecheck
passed while a fresh clone failed — negation added.

**CI note (bit us this phase):** the deploy jobs are path-filtered on the *triggering
push*. The Phase 3 code push failed CI (the gitignore bug) so it never deployed, and the
follow-up docs-only push passed CI but matched no deploy filter — leaving the code
merged, green, and **not deployed**. `gh workflow run "CI + Deploy" -f target=frontend`
bypasses the filters. Worth remembering: green CI on `master` does not imply deployed.*

**[GATE 3]** **[YOU]** click through on dev: ask → note card pops mid-stream → link
opens the reflection; history persists across refresh; guest view; cap/kill states
(forced via SSM flip). Sign off look/feel against the teaser's promise.
*Status 2026-07-26: **PASSED** — Ellis signed off ("works pretty well") against the
seeded third-year account. Three fixes came out of his first real use: the SPA's CSP
blocked the Function URL origin (CORS was right, CSP was not — the request never left
the browser); the overlay was clipped to the header because a `backdrop-filter` ancestor
becomes the containing block for `position: fixed`, so it is now portalled to
`document.body`; and the header affordance became a centred ~40% field rather than a
sparkle icon. **Lesson for later phases: the signed-in path cannot be agent-verified —
there is no session — so every UI phase needs a human gate.***

---

## Phase 4 — Guardrails hardening & observability

Goal: the failure modes are boring before real students touch it.

1. **[AGENT]** Metrics (EMF): `Questions`, `Errors{code}`, `LatencyMsP95`, token
   counts, `CacheHitRate`, `CapHits`. Alarms via `constructs/alarms.ts`: error-rate;
   **zero-cache-reads-over-24h** (the silent cost bug); optional daily-spend metric.
2. **[AGENT]** Load/abuse sanity: parallel-request behaviour (cap race — accept
   last-writer-wins overshoot of ±1–2), oversized question guard (~2k chars), rate of
   thread creation.
3. **[AGENT]** **Component tests for `AskNotesPanel`** (added 2026-07-26). Phase 3
   shipped with the parser unit-tested but the panel's state machine untested, because
   the repo has no React test setup (vitest runs `environment: "node"` over
   `tests/**/*.test.ts`). Add jsdom + `@testing-library/react`, scoped so the existing
   node-environment suites are untouched, and cover: streaming render (deltas append,
   cursor shows), a `<note/>` segment rendering a card, each error state
   (`CAP`/`KILLED`/`THROTTLED`), the first-use notice auto-dismissing on first ask,
   stop/abort keeping the partial answer, and feedback thumbs. This is the layer the
   CSP bug slipped through — not because a test would have caught CSP itself, but
   because there was no way to exercise the panel at all without a live session.
4. **[AGENT]** Re-verify the full error-state matrix live on dev (each `error` code
   driven for real at least once).

**[GATE 4]** Alarms visible in CloudWatch and one test alarm fired to email; component
tests green in CI.
*Status 2026-07-26: mostly PASSED. Three alarms live —
`AiAskErrors`, `AiAnswerErrors` (≥3 error frames/5min: in-stream failures return HTTP
200, so Lambda Errors never sees them), `AiCacheReadsZero`. The SNS→email path is proven
end-to-end: `AiCacheReadsZero` was forced to ALARM and the `ellis@placemate.uk`
subscription is confirmed (a pending subscription silently drops alarms, so this is worth
checking, not assuming). 12 component tests + 333 total green. Unauthenticated error
paths re-verified live (401/401/405; a malformed body also returns 401 because auth runs
first — correct, no parse detail leaks to unauthenticated callers). **Outstanding: EMF
metrics have not yet been observed landing** — they only emit on an authenticated ask,
and none has run since the deploy. First real question in the app will populate
`PlaceMate/AI`; confirm with `aws cloudwatch list-metrics --namespace PlaceMate/AI`.*

---

## Phase S — Sonnet swap (out of band: whenever the support case clears)

Not sequenced with the numbered phases — it unblocks on AWS, so run it the day the
Anthropic agreement becomes creatable, whatever phase is in flight.

1. **[AGENT]** Accept the Anthropic model agreement (Ellis pre-approved this on
   2026-07-26) and re-run the Phase 0 smoke test + token baseline against
   `eu.anthropic.claude-sonnet-5`.
2. **[AGENT]** Flip `config.ai` to `{ provider: "anthropic", modelId: "anthropic.claude-sonnet-5" }`
   and deploy. The provider adapter already carries the Anthropic route with
   `cache_control` breakpoints — no code change is expected, and any that IS needed is a
   signal the adapter seam leaked.
3. **[AGENT]** Assert prompt caching actually engages: a second question in the same
   thread must report non-zero `cacheReadTokens` (the D6 assumption that makes Sonnet
   cost roughly the same per question as the interim model — ~$0.005 warm vs ~$0.032
   cold on a ~10k-token corpus). If it does not, the zero-cache-reads alarm from Phase 4
   will fire, but catch it here first.
4. **[AGENT]** Re-run the Phase 5 eval harness on Sonnet and diff the transcripts against
   the interim model's — this is the evidence for the Gate 5 launch-model decision.
5. **[AGENT]** Re-tune the system prompt if needed: the confidence gate was tightened for
   the weaker interim model (D6a) and may be over-cautious on Sonnet.
6. **[YOU]** Downgrade AWS Business Support back to Basic once the case is closed (it
   bills ~$100/month minimum and was taken out for this one conversation).

**[GATE S]** Sonnet answering live, cache reads non-zero, eval transcripts compared.

---

## Phase 5 — Eval harness, prompt iteration, copy sign-off  ⏭️ **SKIPPED**

> **SKIPPED by Ellis on 2026-07-26**, after hands-on Gate 3 use ("works pretty well").
> Not built, not deferred-with-a-date — consciously dropped for the beta. Recorded here
> rather than deleted so the trade is legible later.
>
> **What we therefore do NOT have:**
> - No repeatable eval. Prompt changes are unverified beyond eyeballing; there is no
>   regression net, so a future system-prompt edit could quietly degrade recall.
> - **No systematic safety probing.** The dosing and prompt-injection cases were the
>   part of this phase with real teeth. The guardrails themselves ARE built (system
>   prompt rules, note-content-is-data instruction, search-URL-only links, notes read
>   from the DB by id) and the parser's injection-shaped-text case is unit-tested — but
>   nobody has adversarially tried to make the model give a dose. With 3 known beta
>   students that is a considered risk; it should be revisited before any wider release.
> - **No interim-model comparison.** DeepSeek v3.2 stays by default; Kimi K2.5 / GLM-4.7
>   / MiniMax M2.5 were never tried, so "best available interim model" is unevidenced.
> - **No copy sign-off gate (D19).** The shipped copy — system prompt, first-use notice,
>   caption, guest teaser line — went live on the author's judgement alone. The launch
>   email is the one piece still unwritten, so it picks up its sign-off in Phase 6.
> - **The Gate 5 launch-model decision disappears**, which resolves it by default:
>   beta students will meet the feature on the interim model unless Phase S lands first.
>
> **Cheapest partial reinstatement if appetite returns:** just the ~8 safety cases
> (dosing, injection, no-note honesty) as a script, skipping the recall-quality cases —
> roughly an hour, and it covers the part that carries actual risk.

Goal (unbuilt): quality proven repeatably; words approved (D18/D19).

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
**D6a decisions at this gate:** (a) the harness is also run across 2–3 interim-model
candidates (DeepSeek v3.2 / Kimi K2.5 / GLM-4.7 / MiniMax M2.5) to pick the interim
model; (b) **[YOU]** decide from the transcripts whether beta students launch on the
interim model or Phase 6 waits for the Sonnet swap (support case + agreement + eval
rerun).

---

## Phase 6 — Launch

1. **[AGENT]** Deploy everything to the live stack (push to master per CI; confirm the
   Phase-1 path-filter fix carried the lambda). Verify prod env vars/SSM/alarms.
2. **[AGENT]** Live smoke test on app.placemate.uk with your own account: ask → note
   card → link; second question cache-hit; cap counter visible; kill switch flip +
   restore.
3. **The launch email — DEFERRED, deliberately.** ⏳ *Decided 2026-07-26: the three
   beta students only just received their invite/sign-up emails, so a second mail this
   soon would read as bombardment. The feature ships live without an announcement; the
   email follows once there has been a decent gap (and ideally once there's a little
   usage to reference). Nothing about the deferral blocks steps 1, 2, 4 or 5.*

   Because Phase 5 is skipped, **this is the only copy gate left** (D19), so the
   drafting matters more than usual. Build it exactly like the existing beta mail —
   the pattern is proven and already deliverability-tested:

   a. **[AGENT]** New template directory `emails/templates/ai-recall-launch/` beside
      `welcome-beta/`, with the same three files: `subject.txt`, `body.html`,
      `body.txt`. Match `welcome-beta`'s **tone** (warm, plain, second-person, no
      marketing gloss, no exclamation-mark energy) and its **HTML conventions** —
      table-based layout, inline styles, `{{first_name}}` substitution defaulting to
      "there", and the `List-Unsubscribe` footer. Read `welcome-beta/body.html` first
      and mirror it rather than inventing a new house style.
   b. **[AGENT]** Content to cover, briefly: ask your notes in plain English; your own
      note comes back word-for-word; it's beta so answers get checked against your
      notes not the internet; the honest limits (study support, not clinical guidance);
      and where to find it (the Ask field in the header, or Home).
   c. **[AGENT]** `scripts/send-ai-launch-email.ts` — a thin wrapper over
      `emails/send.sh`, modelled on `scripts/send-pre-welcome-email.ts`: **dry-run by
      default** (renders a preview, sends nothing), `--execute` to send, `--name` for
      `{{first_name}}`, default BCC to Ellis + Nicola. Unlike the pre-welcome script it
      should be able to **resolve recipients from the `aiRecallInterestAt` flag**
      (query the table for users with the flag set) rather than taking one address, so
      the promise made by the teaser's "notify me" is honoured precisely — with a
      printed recipient list to confirm before `--execute`.
   d. **[YOU]** Read the rendered preview, approve the copy (the D19 gate), then
      approve the send.
   e. **[AGENT]** Send, then record who received it in
      `docs/runbooks/beta-recipients.md` (SES keeps no per-recipient record).
4. **[AGENT]** Ops notes: new runbook `docs/runbooks/ai-recall.md` (kill switch, cap
   tuning, budget alerts, how to read Q&A for quality review responsibly); update
   spec status lines (`spec-ai-recall.md` → BUILT, plans README, memory).
   *Status 2026-07-27: **runbook DONE** — every command in it was executed before
   committing, so none of it is aspirational. Grounded in real production numbers
   (147-block corpus, 12.8–13k input tokens, 5.2–5.9s latency, ≈$0.0064/question on the
   interim model) and carries the six failure modes this build actually hit. Remaining
   Phase 6 items: the deferred launch email (step 3) and the 48h watch (step 5).*
5. **[AGENT]** Post-launch watch: first 48h — check alarms, spend, cache-hit rate,
   thumbs; summarise findings.

**[GATE 6 / Done]** Three beta students can use it; spend visible and sane. *The
notify-me promise is honoured LATER, when the deferred launch email goes out — so this
gate closes with that one item explicitly outstanding rather than pretending it's done.* *With Phase 5 skipped, the launch rests on hands-on use
rather than an eval — so the post-launch watch (step 5) and the 👎 feedback signal carry
more weight than they otherwise would.*

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
- **Model access:** Anthropic use-case form submitted 2026-07-24. Still blocked as of
  **2026-07-26** — `Error 002: Access to Bedrock models is not allowed for this
  account` on **every region and every model** (verified eu-west-2 + us-east-1,
  Sonnet 5 + Claude 3 Haiku), i.e. an **account-level Bedrock block**, not the model
  grant. Fix is [YOU]-side: (a) Billing console → if a "Free plan" badge/upgrade
  banner exists, **upgrade to the Paid plan** (free-plan accounts cannot invoke
  Bedrock; upgrading costs nothing and keeps the credits), else (b) open an AWS
  Support case (Account and billing) quoting Error 002 and asking for Bedrock
  invocation to be enabled on 641364901830. Smoke test (Phase 0 §3) and token
  baseline (§5) remain pending.
  **Update 2026-07-26:** free-plan theory ruled out (no banner; freetier
  GetAccountPlanState has no record). Per-gate diagnosis via
  GetFoundationModelAvailability: authorizationStatus=AUTHORIZED (use-case form
  recorded), entitlement+region AVAILABLE, **agreementAvailability=NOT_AVAILABLE** —
  and CreateFoundationModelAgreement (offer-2ykemehpsyf7g, user-approved) is itself
  rejected with Error 002. Conclusion: AWS account-standing gate above the agreement
  layer. Console playground also blocked
  (same Error 002 on Sonnet 5 chat, verified by screenshot) — **AWS Support case is
  the only remaining path** (Account and billing, cite the per-gate diagnostics +
  playground screenshot; also verify Billing → Payment preferences has a valid card,
  a known trigger for this gate).
  **Mantle probe (2026-07-26):** the new `bedrock-mantle.eu-west-2.api.aws` endpoint
  authenticates and serves inference fine on this account (open-weight
  `openai.gpt-oss-20b` → HTTP 200, billed) but lists **no Anthropic models** (38
  open-weight only) — Claude everywhere hinges on the marketplace agreement the
  account is blocked from creating. Inference/billing proven healthy → the support
  case is narrowly about lifting the agreement-creation block.
  **Interim plan adopted (D6a, 2026-07-26):** mantle accepts **plain IAM SigV4**
  (service name `bedrock`, verified with gpt-oss-120b → 200), so the Lambda needs no
  API keys. Build proceeds on an open-weight interim model via mantle's OpenAI-compat
  route behind a provider adapter; Sonnet 5 via the Anthropic route once the
  agreement unblocks. Gate 0 is considered PASSED for build purposes (streamed
  inference proven on the account); the Sonnet-specific smoke test + token baseline
  re-run at swap time.
- **Budgets:** `ai-bedrock-credit-burn` created — $400/mo, Service=Amazon Bedrock,
  **`IncludeCredit: false`** (tracks gross usage = credit burn; the pre-existing
  `nurse-planner-dev-monthly` $20 budget includes credits so nets ~$0 and won't
  false-alarm). Absolute-value ACTUAL alerts at $50/$150/$400 → **ellis@placemate.uk**.
  No enforcement actions on the account (verified — nothing will hard-stop the app).
- Cost baseline from Phase 0 §5: _(TBD — after model access)_
