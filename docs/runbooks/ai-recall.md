# Runbook: AI recall ("ask your own notes")

Operating the AI feature — what to do when it misbehaves, costs too much, or needs
turning off. Design decisions live in [`spec/spec-ai-recall.md`](../../spec/spec-ai-recall.md);
build order in [`spec-ai-recall-implementation.md`](../../spec/spec-ai-recall-implementation.md).
All AWS commands use `--profile personal` (account 641364901830, eu-west-2).

**What it is, in one line:** a signed-in student asks a question; a Lambda assembles
*their own notes* into a prompt, streams an answer back over SSE, and the app renders the
matched note **from its own local database by id** — so a quoted note cannot be
fabricated, only pointed at.

| Thing | Where |
|---|---|
| Ask endpoint (streaming) | Lambda `nurse-planner-ai-ask-dev` + its Function URL (`AiAskUrl` stack output) |
| Handler code | `infra/lambda/ai/` (`index.ts`, `corpus.ts`, `prompt.ts`, `provider.ts`, `metrics.ts`) |
| Chat storage | DynamoDB `nurse-planner-dev`, partition `AI#<sub>` (separate from `USER#<sub>` — see below) |
| Thread reads | `ai/listThreads` · `ai/getThread` · `ai/deleteThread` · `ai/feedback` on the normal RPC router |
| UI | `src/react/components/ai/` — same panel on Home and in the header overlay |
| Kill switch | SSM parameter `/nurse-planner/ai/enabled` |
| Metrics | CloudWatch namespace `PlaceMate/AI` |
| Alarms | `nurse-planner-dev-Ai*` → SNS `nurse-planner-alarms-dev` → ellis@placemate.uk |

---

## 1. Turn it off, right now

The single most useful thing in this document. Takes effect within ~30 seconds (the
Lambda caches the flag for that long); **no redeploy**.

```bash
aws ssm put-parameter --name /nurse-planner/ai/enabled --value false --type String --overwrite \
  --region eu-west-2 --profile personal
```

Students then see *"Ask-your-notes is taking a short break."* and the input disables.
Nothing else in the app is affected — notes, sync, hours and everything else keep working.

Turn it back on with `--value true`.

> **Fail-open by design.** If SSM itself is unreachable the Lambda assumes *enabled*, on
> the grounds that an SSM outage shouldn't take a working feature down. The corollary: the
> kill switch is not a security control. To hard-stop it, remove the Function URL or set
> the Lambda's reserved concurrency to 0.

---

## 2. Cost

**Real numbers, observed in production (2026-07-27, `deepseek.v3.2`, a 147-block corpus):**

| | Measured |
|---|---|
| Corpus size | 147 blocks ≈ 41k characters |
| Input tokens per question | 12,800 – 13,000 |
| Output tokens per question | 150 – 200 |
| End-to-end latency | 5.2 – 5.9 s |
| **Cost per question** | **≈ $0.0064** (at $0.48/Mtok in, $1.43/Mtok out) |

At the 30/question daily cap, one heavy user costs about **$0.19/day**. Three beta
students asking flat-out is well under **$1/day**.

Two things make this bigger later: a student with far more notes (cost scales with corpus
size, since the whole corpus goes in every question), and switching to Sonnet — roughly 6×
per question *uncached*, but about the same once prompt caching is warm. Which is why
§3's cache alarm matters.

**Budget alerts** are already wired: AWS Budgets `ai-bedrock-credit-burn`, filtered to the
Bedrock service, alerting ellis@placemate.uk at **$50 / $150 / $400**. It sets
`IncludeCredit: false` deliberately, so it tracks *gross usage* — i.e. how fast the $1,000
of credits is burning — rather than netting to zero.

```bash
# What has Bedrock actually cost? (Cost Explorer lags ~24h)
aws ce get-cost-and-usage --time-period Start=$(date -u -v-7d +%F),End=$(date -u +%F) \
  --granularity DAILY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock","Claude in Amazon Bedrock"]}}' \
  --region us-east-1 --profile personal
```

**If spend spikes:** flip the kill switch (§1) first, ask questions second. Then check
`Questions` in `PlaceMate/AI` — a spike in question *count* is abuse or a client retry
loop; flat count with rising cost is a corpus that has grown, or caching having broken.

---

## 3. Alarms — what each one means

All three notify `ellis@placemate.uk`. The subscription is confirmed; if you ever recreate
the topic, **confirm the subscription email or alarms silently go nowhere**.

### `nurse-planner-dev-AiAskErrors`
The Lambda threw an unhandled error. Look at the log group:

```bash
aws logs tail /aws/lambda/nurse-planner-ai-ask-dev --since 30m --region eu-west-2 --profile personal
```

Usually a code or IAM problem, not a user problem. See §7 for the ones already hit.

### `nurse-planner-dev-AiAnswerErrors` (≥3 error frames in 5 min)
This one exists because **in-stream failures return HTTP 200**. The request succeeds, then
an `error` frame is written into the stream — so Lambda's own Errors metric never sees it.
Without this alarm, sustained model throttling would be completely invisible.

Filter by cause:

```bash
aws logs filter-log-events --log-group-name /aws/lambda/nurse-planner-ai-ask-dev \
  --filter-pattern '{ $.ErrorCode = "*" }' --start-time $(( ($(date +%s) - 3600) * 1000 )) \
  --region eu-west-2 --profile personal --query 'events[].message' --output text
```

`THROTTLED` → the model provider is busy; usually self-resolves, consider a lower cap if
persistent. `UPSTREAM` → anything else; read the log line above it.

### `nurse-planner-dev-AiCacheReadsZero` — **the cost alarm**
Fires when a whole day of traffic produced **zero** prompt-cache reads. Prompt caching is
what keeps a frontier model affordable, and it fails *silently* — one stray byte in the
cached prefix and every question quietly pays full price with no error anywhere.

`CacheReadTokens` is emitted even when it is zero, precisely so this can breach; an absent
metric would read as "no data" and never alarm.

**Expected to be dormant while on the interim model** — the OpenAI-compat route does not
cache, so this only becomes meaningful after the Sonnet swap (§6). If it fires *after* the
swap: something changed the stable prefix. Check whether the system prompt, the corpus
ordering, or the model id was edited.

---

## 4. The daily cap

30 questions per user per day, counted in DynamoDB at `AI#<sub>` / `DAILY#<date>` with a
48-hour TTL. Over the cap the student sees a friendly "back tomorrow" message; the
countdown appears in the UI from 5 remaining.

To change it, edit `DAILY_QUESTION_CAP` in `infra/lambda/ai/index.ts` and redeploy — it is
deliberately not runtime-configurable, because a cap that can be raised in a panic is a
cap that gets raised in a panic.

To grant one person more today (support gesture), reset their counter:

```bash
SUB=<cognito-sub>; TODAY=$(date -u +%F)
aws dynamodb update-item --table-name nurse-planner-dev --region eu-west-2 --profile personal \
  --key "{\"PK\":{\"S\":\"AI#$SUB\"},\"SK\":{\"S\":\"DAILY#$TODAY\"}}" \
  --update-expression "SET #c = :v" --expression-attribute-names '{"#c":"count"}' \
  --expression-attribute-values '{":v":{"N":"0"}}'
```

The counter uses an atomic `ADD`, so two simultaneous asks can overshoot by one. That is
accepted — it is a courtesy limit, not a quota.

---

## 5. Reading students' questions — responsibly

Q&A is stored and **we told students we may read it** (the one-off in-app notice and the
launch email both say so). That disclosure is the whole basis for looking, so treat it as
a boundary, not a formality.

- **Read for quality, not curiosity.** Legitimate: a 👎 came in; answers look wrong; you
  are tuning the prompt. Not legitimate: browsing what a named student has been asking.
- **Start from the feedback signal**, not from a person. `feedback = "DOWN"` is the
  highest-value thing in the table and points you at real problems.
- **Never paste a student's question or note text into a bug report, commit message, or
  anywhere shared.** Quote the shape of the problem, not the content.
- Questions can be about reflections, which can be about hard shifts. Some of this is
  genuinely personal even with no patient data in it.
- If a student asks to see or delete their data, `ai/deleteThread` removes a single
  conversation, and **"Clear all data" purges the whole AI partition** along with their
  notes (see `erasure.md`).

```bash
# Answers a student marked unhelpful, across the table (small beta; a Scan is fine)
aws dynamodb scan --table-name nurse-planner-dev --region eu-west-2 --profile personal \
  --filter-expression "feedback = :d" --expression-attribute-values '{":d":{"S":"DOWN"}}' \
  --query 'Items[].{when:createdAt.S,comment:feedbackComment.S}' --output table
```

**Self-care check-ins are excluded from the corpus by design** (D4) and must stay that
way — wellbeing notes were promised as private and have no recall value. Verify any time:

```bash
AWS_PROFILE=personal npx tsx scripts/check-ai-corpus.ts someone@example.com
```

That script also prints corpus size and block counts — the fastest way to answer "what can
the AI actually see for this user?".

---

## 6. Changing the model

Two values in `infra/lib/config.ts` (`config.ai`), then `cdk deploy`. The provider adapter
already carries both routes, so no code change should be needed — if one *is*, that is a
signal the adapter seam has leaked.

```ts
ai: { provider: "openai-compat", modelId: "deepseek.v3.2" }          // now (interim)
ai: { provider: "anthropic",     modelId: "anthropic.claude-sonnet-5" } // after the support case
```

The Sonnet swap has its own checklist — **Phase S** in the implementation spec. The
non-obvious step is asserting that cache reads are actually non-zero afterwards; that is
the assumption the cost model rests on.

---

## 7. Failure modes already hit (and their fixes)

Every one of these cost real debugging time. If the feature breaks in a new environment,
start here.

| Symptom | Cause | Fix |
|---|---|---|
| Browser shows *"Couldn't reach PlaceMate"*, no request in the network tab | The SPA's **CSP** blocks the Function URL — it is a different origin. CORS being correct does not help; they are separate gates. | `Web` construct adds `ai.askOrigin` to `connect-src`. Verify: `curl -sI https://app.placemate.uk \| grep -i content-security-policy` |
| `Dynamic require of "buffer" is not supported` | ESM Lambda bundle with CJS deps inside | `banner: createRequire(...)` in the `Ai` construct's bundling options |
| `not authorized to perform: bedrock-mantle:CreateInference` | The mantle endpoint authorises under its **own** IAM namespace, not `bedrock:InvokeModel*` | Both statements are granted in `infra/lib/constructs/ai.ts` |
| Sync dies app-wide: *"Cannot read properties of undefined (reading 'put')"* | A row synced with an `entityType` the client has no Dexie store for. `LogItem` has its own `entityType` field which used to clobber the storage discriminator. | Discriminator lives in `sType`; `toSyncRow` falls back to `entityType` for legacy rows. **Never let AI data reach `syncPull`** — that is why chat lives in a separate `AI#` partition. |
| `ValidationException` on "Clear all data" | An empty `begins_with` in a DynamoDB query — dynalite accepts it, real DynamoDB rejects it | `AiStore.query("")` omits `begins_with` entirely |
| Answers stop citing notes / recall gets worse | Prompt edited without an eval to catch it (Phase 5 was skipped) | Compare against `scripts/check-ai-corpus.ts` output; consider building the ~8 safety cases |

---

## 8. Health check

```bash
# 1. Is it enabled?
aws ssm get-parameter --name /nurse-planner/ai/enabled --region eu-west-2 --profile personal \
  --query Parameter.Value --output text

# 2. Any alarms in ALARM?
aws cloudwatch describe-alarms --alarm-name-prefix nurse-planner-dev-Ai --state-value ALARM \
  --region eu-west-2 --profile personal --query 'MetricAlarms[].AlarmName' --output text

# 3. Usage + latency over the last day
aws cloudwatch get-metric-statistics --namespace PlaceMate/AI --metric-name Questions \
  --start-time $(date -u -v-1d +%FT%TZ) --end-time $(date -u +%FT%TZ) --period 86400 \
  --statistics Sum --region eu-west-2 --profile personal --query 'Datapoints[].Sum' --output text

# 4. Endpoint alive? (401 is the CORRECT answer without a token)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$(aws cloudformation describe-stacks \
  --stack-name NursePlanner-dev --region eu-west-2 --profile personal \
  --query "Stacks[0].Outputs[?OutputKey=='AiAskUrl'].OutputValue" --output text)" \
  -H 'content-type: application/json' -d '{"question":"x"}'
```

> **Metrics only exist after an authenticated ask.** The 401/405 fast paths return before
> the metric emit, deliberately — unauthenticated noise should not create data points. An
> empty `PlaceMate/AI` namespace after a deploy means "nobody has asked yet", not "broken".
