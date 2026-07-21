# Beta hardening — sequenced implementation plan (2026-07-21)

Executor: Claude Opus 4.8 (extended thinking). This document is self-contained: it encodes
the findings of the 2026-07-21 five-agent beta-readiness audit plus every product decision
the owner made in the follow-up interview. Where a step says "decision: locked", do not
re-litigate it — implement it. Where a step leaves latitude ("your call"), use judgment and
record the choice in the commit message.

**Mission:** close every ship-stopper and high-severity gap found by the audit (except NHS
wifi reachability, explicitly excluded by the owner) so real student nurses can be invited
to the beta. The app's happy path is already solid; this work is almost entirely about
failure paths, trust, and first contact.

---

## 0. Ground rules (read before touching anything)

1. **Every push to `master` deploys to the live app** (app.placemate.uk) used by real beta
   users. Work step-by-step: one step = one focused commit = one push, verified before the
   next step starts. Never leave `master` in a state you wouldn't ship.
2. **The working tree may contain foreign changes.** Other sessions edit this repo
   concurrently. At the time of writing, `src/logic/text.ts` (untracked),
   `src/data/seed/proficiencies.ts` (modified) and `HANDOVER-corporate-website.md`
   (untracked) belong to another thread. **Stage only the specific paths your step
   touched** (`git add <path> …`, never `git add -A` / `git commit -a`), and never stash,
   revert, or format files you didn't change.
3. **Never modify `emails/templates/welcome-beta/body.html`** or anything under `emails/`.
   The owner drives invite/welcome sends manually via CLI. (Locked decision.)
4. **Never run `npm run format`** repo-wide — prettier churns unrelated files. Format only
   the files you touched (`npx prettier --write <paths>`).
5. **AWS:** local CLI/CDK calls always use `--profile personal` (account 641364901830).
   CI deploys via OIDC need no profile. Never act in any other AWS account.
6. **Local gate before every push:** `npm run typecheck && npm run lint && npm test`, plus
   `npm run build` when `src/` changed and `npx cdk synth` (in `infra/`) when `infra/`
   changed. After pushing, watch the run (`gh run list` / `gh run watch`) and do the
   step's live verification.
7. **Invariants to preserve at all costs:**
   - Non-enumerating login: nothing on the login screen may reveal whether an email has
     an account (`src/auth/LoginScreen.tsx` — see its doc comment).
   - Sentry Session Replay stays pinned `maskAllText/maskAllInputs/blockAllMedia` — this
     app holds patient-adjacent clinical text.
   - Dexie schema versions are **additive only** — new stores/indexes via the
     `STORE_INDEXES` registry in `src/data/schema.ts`; no destructive `.upgrade()`.
   - `src/domain/schemas.generated.ts` is generated — change `src/domain/types.ts` then
     `npm run gen:zod`; never hand-edit it. CI fails on drift.
   - All UK English in user-facing copy.
8. **Commit trailer:** end every commit message with
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 1. Locked decisions (from the owner interview, 2026-07-21)

| # | Topic | Decision |
|---|-------|----------|
| D1 | Sentry scope | Errors + feedback + **on-error-only replay** (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`, masking pinned). **Remove tracing** (`browserTracingIntegration`). **Init only in production builds** — never local dev. |
| D2 | Sentry PII | Keep `Sentry.setUser({ id, email, username })`; disclose it in the privacy policy. |
| D3 | Guest data | **No import into accounts.** Guest mode is reframed as a device-local **demo**. Login/guest surfaces say so plainly and point interested users at a register-interest CTA. |
| D4 | Register interest | `mailto:hello@placemate.uk` with a pre-filled subject. No form, no backend. |
| D5 | Clear all data | **Guest-only.** Signed-in users lose the button entirely; their erasure path is the GDPR runbook/script (D10). |
| D6 | Sign-out | **Ask each time**: "Remove" = full local self-destruct (per-user Dexie DB + reflection-PIN key + related local state); "Keep" = leave data for faster next sign-in. Removing with a non-empty outbox first warns "N changes haven't synced — they'll be lost". |
| D7 | Sync UI | Header dot (synced ✓ / n pending / failed) + Profile detail panel with last-synced time and "Sync now"; persistent failure (>1 h with pending changes) escalates to a dismissible banner. Hidden entirely for guests. |
| D8 | Data controller | Privacy policy names **Nicola Nightingale and Ellis Taylor** (beta users know Nicola), contact `hello@placemate.uk`. |
| D9 | Erasure depth | Runbook **and** an admin script `scripts/erase-user.ts` with `--dry-run`. |
| D10 | Alerting | SNS → `hello@placemate.uk`; alarms on router Lambda errors, API 5xx, DynamoDB throttles, SES bounce/complaint reputation; AWS Budget alarm at **$20/month**. |
| D11 | CI gate | Deploys gate on CI; **ESLint becomes a blocking CI check**. |
| D12 | Brand casing | Written prose is **"PlaceMate"** everywhere (app, marketing, tab title, emails). The lowercase "placemate" **logo/wordmark stays as-is** — the discrepancy is deliberate. |
| D13 | Email identity | Sender `PlaceMate <hello@placemate.uk>`; magic-link subject "Your PlaceMate sign-in link". |
| D14 | Invite flow | Owner creates the Cognito user, then sends the welcome email via CLI. The welcome email links to **app.placemate.uk** (no literal magic link — they expire in 15 min). Template is owner-managed; hands off. |
| D15 | Drafts | Reflection editor gets **autosave drafts**; shift modal gets a **dirty-check confirm** on Esc/backdrop/tab-switch. |
| D16 | Sequence & delivery | Pipeline safety first; commit + push per step. |

## 2. Owner-manual checklist (NOT for the executor — surface these, don't do them)

- [ ] iCloud Custom Email Domain: create `ellis@placemate.uk`, then repoint the
      `hello@placemate.uk` forward from `ellis.taylor499@gmail.com` to `ellis@placemate.uk`.
      (Lives in iCloud settings; the repo/AWS can't change it.)
- [ ] Confirm the SNS email subscription when Step 4 deploys (a confirmation email will
      arrive at hello@).
- [ ] Create a Sentry auth token and add it as the `SENTRY_AUTH_TOKEN` repo secret before
      Step 5's source-map upload can work (the step must degrade gracefully without it).
- [ ] Check the ICO data-protection fee (~£52/yr for a UK controller holding user emails).
- [ ] Verify the Cognito `admins` group is empty before sending invites
      (`aws cognito-idp list-users-in-group --profile personal …`).
- [ ] Run one end-to-end erasure rehearsal with `scripts/erase-user.ts` on a throwaway user
      after Step 15.

---

## 3. The sequence

### Phase A — pipeline safety (protects every later step)

#### Step 1 — Commit the DMARC drift (no code)

**Why:** Live DNS is `p=quarantine` (hand-edited ~2026-07-18); the deployed CloudFormation
template and repo HEAD still say `p=none`. Any future stack update touching that resource
silently reverts live DNS to `p=none`. The uncommitted diff in
`infra/lib/constructs/email.ts` already reconciles code → reality.

**What:** Commit **only** `infra/lib/constructs/email.ts` (verify with `git diff` that the
change is exactly the DMARC `p=none` → `p=quarantine; pct=100` edit + comments). Push. The
backend deploy fires and is idempotent against the live record.

**Verify:** deploy run green; then
`dig +short TXT _dmarc.placemate.uk` still returns `p=quarantine … pct=100`, and
`aws cloudformation get-template --stack-name NursePlanner-dev --profile personal | grep -o 'p=quarantine'`
confirms the template now matches.

#### Step 2 — One CI-gated, path-filtered deploy pipeline

**Why:** Today `ci.yml` and the three deploy workflows race on every push — a red commit
deploys anyway. Also, the router Lambda (`infra/lambda/router/index.ts`) imports
`../../../src/data/dynamo/*` and `../../../src/domain/schemas.generated`, but only
`infra/**` triggers a backend deploy — so changes to the Lambda's own code ship a new SPA
against a stale Lambda.

**What:** Replace `ci.yml`, `deploy-backend.yml`, `deploy-frontend.yml`,
`deploy-marketing.yml` with a single `pipeline.yml`. `workflow_run` can't carry path
filters, so use one workflow with a change-detection job (`dorny/paths-filter@v3`) and
`needs:`. Requirements:

- CI jobs (always run on push/PR): the existing app job (typecheck, `gen:zod:check`,
  tests) **plus `npm run lint`** (D11), and the infra `cdk synth` job. Reuse the current
  job bodies from the old workflows — they're correct.
- Deploy jobs run only when **all** CI jobs pass AND their path filter matched:
  - frontend: current paths (`src/**`, `index.html`, `package*.json`, `vite.config.ts`,
    `tsconfig*.json`)
  - backend: `infra/**` **plus `src/data/**` and `src/domain/**`** (the Lambda-imported
    code)
  - marketing: `site/**`
- Preserve: OIDC role assumption, the exact build/deploy step bodies (Step 3 amends the
  frontend sync), concurrency groups (`cancel-in-progress: false` for backend — never
  cancel an in-flight CloudFormation update; `true` for frontend/marketing), and
  `workflow_dispatch` with the environment choice (keep `[dev, prod]` but note in a
  comment that `prod` is a placeholder config — see `infra/lib/config.ts`).
- A push that only touches `.github/workflows/**` must run CI but no deploys (the filter
  gives you this for free — keep it that way).
- Delete the superseded workflow files in the same commit. Leave
  `aws-oidc-check.yml` alone.

**Landmine:** a change to `src/data/**` now triggers BOTH frontend and backend deploys —
that's the point (no more client/server skew), but confirm both jobs can run concurrently
without fighting (they touch different resources; they can).

**Verify:** push the commit; on GitHub confirm CI jobs ran, deploys waited for them, and
only the path-matched deploys fired. Then push a trivially broken branch? No — instead
verify gating logic by reading the run graph (deploy jobs show `needs` edges). Update the
"Build & deployment" section of `README.md` (§9) to describe the new pipeline.

#### Step 3 — Frontend cache headers + chunk-load safety

**Why:** The frontend deploy is a bare `aws s3 sync dist/ --delete`: `index.html` gets
heuristic browser caching (users can keep a stale shell after deploys, despite the
CloudFront invalidation), and `--delete` removes old hashed chunks the moment a new build
lands — open tabs that lazy-load a route after a deploy hit chunk-load failures.

**What (two parts):**

1. In `pipeline.yml`'s frontend deploy, copy the pattern already proven in the marketing
   deploy: sync `assets/*` (Vite's hashed output) with
   `--cache-control "public,max-age=31536000,immutable"` and **without `--delete`** (old
   chunks stay; they're pennies), then upload `index.html` (and any other non-hashed root
   files in `dist/`) last with `--cache-control "no-cache"`. Keep the CloudFront
   invalidation.
2. Add a small runtime handler: on a dynamic-import/chunk-load error, force one
   `window.location.reload()` (guard against reload loops with a sessionStorage flag).
   Today the bundle is a single chunk, so this is cheap insurance that matters the moment
   code-splitting lands — implement it in the error boundary added in Step 6 if you'd
   rather; either home is fine, but don't skip it.

**Verify:** after deploy, `curl -sI https://app.placemate.uk/ | grep -i cache-control` →
`no-cache`; `curl -sI https://app.placemate.uk/assets/<current-js> | grep -i cache-control`
→ `immutable`.

### Phase B — visibility (know when it breaks)

#### Step 4 — Backend alerting + budget (CDK)

**Why:** Verified live: **zero** CloudWatch alarms in the account, no SES configuration
set, no budget. If the API broke for every beta user, nobody would know.

**What:** New construct `infra/lib/constructs/alarms.ts`, wired into
`infra/lib/nurse-planner-stack.ts`, gated so it only instantiates for the live env
(`retainData: true` in `infra/lib/config.ts` is the existing "this is the real env"
signal). Contents:

- SNS topic + email subscription `hello@placemate.uk` (owner confirms the subscription —
  it's on their checklist).
- Alarms (all → the topic, `treatMissingData: NOT_BREACHING`):
  - router Lambda `Errors` sum ≥ 1 over 5 min (get the function reference from the `Api`
    construct — export it if needed),
  - HTTP API 5xx ≥ 1 over 5 min (ApiGatewayV2 metrics on the HttpApi),
  - DynamoDB `ThrottledRequests` and `SystemErrors` ≥ 1 over 5 min on the table,
  - SES `Reputation.BounceRate` > 0.05 and `Reputation.ComplaintRate` > 0.001. **Check
    first** whether these account-level metrics exist
    (`aws cloudwatch list-metrics --namespace AWS/SES --profile personal`); if they don't
    auto-publish, add an SES configuration set with a CloudWatch event destination and
    set it as the identity's default config set in `email.ts` — keep that change minimal.
- AWS Budget (`aws-budgets` `CfnBudget`): $20/month, notify at 80% actual and 100%
  forecast → hello@ (budgets are us-east-1-global but declarable from this stack; if the
  CFN budget resource fights the region, a tiny `AwsCustomResource` or a documented
  one-off CLI command is acceptable — prefer the simplest thing that's in code).

**Verify:** deploy; `aws cloudwatch describe-alarms --profile personal` lists the new
alarms in `OK`/`INSUFFICIENT_DATA`; `aws sns publish` a test message to the topic and
confirm with the owner that it arrived at hello@.

#### Step 5 — Sentry: prod-only, right-sized, traceable (D1, D2)

**Why:** `src/observability/sentry.ts` currently ships 100% tracing + 10% session replay
(contradicting the owner's own plan, now re-decided as D1), initializes in local dev
(polluting the project), has no `environment`/`release`, and uploads no source maps — so
week-one beta bug reports would be minified noise.

**What, in `sentry.ts` (+ `vite.config.ts`, `pipeline.yml`):**

- Gate the whole `Sentry.init` on production builds (`import.meta.env.PROD`); dev gets a
  no-op. Keep the "first side effect in `main.tsx`" property.
- Remove `browserTracingIntegration` and `tracesSampleRate` entirely.
- Replay: `replaysSessionSampleRate: 0`, keep `replaysOnErrorSampleRate: 1.0`, keep the
  pinned masking block and its clinical-safety comment.
- Keep the feedback integration exactly as configured (unmasked screenshots are an
  accepted, documented decision).
- Add `environment: import.meta.env.MODE` and `release` (inject the git SHA at build time
  via `define` in `vite.config.ts`, sourced from `GITHUB_SHA` in CI with a local
  fallback).
- Source maps: add `@sentry/vite-plugin` to the build, active **only when
  `SENTRY_AUTH_TOKEN` is present** (owner-checklist secret) so local/forked builds don't
  fail; upload maps, don't serve them (use the plugin's delete-after-upload option).
  Update the frontend deploy job to pass the secret + `GITHUB_SHA`.
- Update the file's doc comment — it currently narrates the old posture.
- Keep `Sentry.setUser` in `src/react/RepositoryContext.tsx` as-is (D2 — disclosure
  happens in Step 14).

**Verify:** local `npm run dev` sends nothing (network tab); after deploy, trigger a test
error in prod (e.g. temporary `?sentry-test` hook or just the Step 6 boundary's test) and
confirm the event lands with environment `production`, a release tag, and a readable stack.

### Phase C — app resilience (the ship-stoppers users would hit)

#### Step 6 — Error boundary + storage-failure states

**Why:** No `ErrorBoundary` exists anywhere; any render error is a permanent white screen.
And `RepositoryContext.tsx`'s mount-time `getCurrentUser()` has no catch — Safari private
mode / blocked IndexedDB = infinite "Loading…".

**What:**

- Wrap the app (inside the Sentry init, outside the router) in `Sentry.ErrorBoundary`
  with a branded fallback card: plain-English "Something went wrong", a Reload button, a
  `hello@placemate.uk` mailto, and the Sentry event id in small print. Offer "Send
  feedback" via the existing feedback integration if it's usable from the fallback;
  otherwise the mailto suffices. Chunk-load errors reload once (see Step 3.2).
- In `RepositoryContext`, catch the initial load failure and render a distinct state:
  "This browser can't store PlaceMate's data (private browsing or storage blocked). Data
  can't be saved here — try a normal window." Don't leave a spinner as the terminal state
  on ANY promise this provider awaits.
- While you're in the boot path: call `navigator.storage.persist()` once on startup
  (fire-and-forget) — guests' IndexedDB is their only copy and it's evictable without it.

**Verify:** unit-level where feasible; manually throw inside a component in dev to see the
fallback; simulate storage failure (deny IndexedDB via devtools or a throwing mock) to see
the storage state. Confirm the thrown test error arrived in Sentry (env `development` won't
exist post-Step-5 — do this check against the deployed app or temporarily allow it).

#### Step 7 — Sync engine: no more silent failure + the seed race

**Why (three defects, all in `src/data/sync/`):**
1. `sync()` swallows every error (`syncRepository.ts` catch → nothing); `RpcSyncTransport`
   has no timeout or retry. Sync can die permanently and invisibly.
2. **Seed race:** on a fresh device, `RepositoryProvider`'s mount call to
   `getCurrentUser()` triggers `ensureSeed` (`src/data/dexie/dexieRepository.ts`), which
   writes a **default** profile ("Me", part 1) stamped `updatedAt = now` and captures it
   into the outbox — always winning the race against the initial network pull. The pull
   then skips the real remote profile as "older", and the push **overwrites the real
   profile server-side via last-write-wins**. Every user who signs in on a second device
   gets their profile reset everywhere.
3. The whole outbox goes up as one unchunked POST — a long-offline device or demo-data
   load can exceed API GW/Lambda payload limits and then fail on every retry, forever.

**What:**

- **Surface errors:** `sync()` records the failure (state + `Sentry.captureException`)
  instead of dropping it. Introduce a small observable sync-status store (the hook layer
  in `src/react/hooks.ts` / a new context) exposing: `lastSyncAt` (persist it in a Dexie
  meta table — additive version bump via `STORE_INDEXES`), `pendingCount` (Dexie
  `liveQuery` on the outbox), and `lastError`. This store feeds Step 8's UI.
- **Transport hardening:** request timeout (AbortController, ~15 s) and bounded
  exponential backoff on retryable failures (network/5xx — don't retry 4xx auth failures
  in a tight loop; those surface as status).
- **Chunked push:** batch the outbox into fixed-size slices (e.g. 50 rows) pushed
  sequentially; a mid-batch failure keeps unpushed entries in the outbox (the existing
  cleared-only-if-not-superseded logic already tolerates this — read it before touching:
  `syncRepository.ts` flush section).
- **Seed-race fix:** the invariant is: *a seeded default row must never be able to beat a
  real remote row.* Recommended shape: seeded defaults are written with an epoch
  `updatedAt` (so any real profile wins LWW) **and** are not captured into the outbox;
  additionally hold the first push until the initial pull has completed once
  (`syncRepository.ts` constructor already triggers an initial sync — sequence pull
  before push inside `sync()` if it doesn't already). A truly new account still ends up
  with a profile row: its first real user edit (or first push after pull confirms the
  server is empty) uploads it.
- **Tests (extend `tests/syncLogic.test.ts`, which has good two-device scaffolding):**
  (a) fresh device signs in while the server holds a customised profile → after sync,
  the profile is the server's, locally and remotely; (b) push of N>chunk-size outbox
  entries lands them all exactly once; (c) a transport that always fails leaves the
  outbox intact and sets the error state.

**Landmine:** the LWW clock is raw client wall-time (`updatedAt` strings). Don't try to
fix clock skew here — out of scope — but don't introduce any new comparison that assumes
monotonic time either.

#### Step 8 — Sync status UI (D7)

**What:** consume Step 7's status store:

- **Header** (in `src/react/components/AppLayout.tsx`): a small dot/pill — green ✓ when
  `pendingCount === 0` and last sync succeeded (visually quiet), amber "n waiting" when
  pending, red "not syncing" on persistent error. Links/navigates to the Profile panel.
  Rendered only for signed-in users.
- **Profile** (`src/react/components/ProfilePage.tsx`): a "Sync" panel — last synced
  time, pending count, last error in plain English, and a "Sync now" button (calls
  `sync()` directly, shows result).
- **Escalation:** a dismissible app-level banner when `pendingCount > 0` and no
  successful sync for over an hour: "Your changes aren't reaching the cloud — they're
  safe on this device. Try Sync now, or contact hello@placemate.uk."
- Copy must never imply data is lost — local data is intact by design; the risk is the
  *server* copy going stale.

**Verify:** in the live app with devtools offline, make an edit → amber; go online →
green. Force a 401 (expired token via devtools) → red state, no crash.

#### Step 9 — Sign-out dialog: keep or remove local data (D6)

**Why:** Sign-out (`src/auth/AuthGate.tsx`) revokes tokens but leaves the per-user Dexie
DB fully readable on shared NHS/university machines — including reflections. The
reflection PIN is plaintext localStorage and explicitly "NOT real security"
(`src/react/reflectionLock.ts`).

**What:** replace the bare sign-out with a dialog offering exactly two choices:

- **"Remove my data from this device"** — deletes the `nurse-planner-<sub>` Dexie
  database (`Dexie.delete`), the reflection-PIN localStorage key(s) (read
  `reflectionLock.ts` for the exact key shape), and any other per-user localStorage
  (grep for localStorage usage to enumerate; Step 11's draft store must be included).
  If `pendingCount > 0`, interpose the warning first: "N changes haven't synced — signing
  out now will lose them. Sync first?" (offer Sync now / lose them / cancel).
  Do the deletion **before** clearing tokens (you need the sub, and a half-signed-out
  state must not strand the DB).
- **"Keep my data on this device"** — current behaviour (faster next sign-in on a
  personal device). Sub-text: "Only choose this on your own device."

Guests don't sign out; nothing changes for them here.

**Verify:** sign out choosing Remove → IndexedDB for that user is gone (devtools →
Application), PIN key gone; sign back in → data re-syncs from server. Sign out choosing
Keep → DB intact.

#### Step 10 — "Clear all data" becomes guest-only (D5)

**Why:** The Profile action says "local to this browser only" but for signed-in users
`SyncRepository.resetDatabase()` tombstones the entire account and **syncs the wipe to
every device**. One misread confirm = account destroyed.

**What:** in `ProfilePage.tsx`, render the clear-data panel **only in guest mode** (the
existing copy is then true — guest data really is local). For signed-in users, remove the
control; in its place a sentence: "Need your account data corrected or deleted? Email
hello@placemate.uk." Don't delete `SyncRepository.resetDatabase()` itself — the erasure
script (Step 15) documents the server-side path; just remove the UI trigger.
Sanity-check nothing else calls `resetDatabase` for signed-in users (grep).

**Verify:** signed-in Profile shows no clear button; guest Profile still clears local data
(test with demo data loaded).

#### Step 11 — Drafts: reflection autosave + shift-modal dirty confirm (D15)

**Why:** The six-section Gibbs reflection editor
(`src/react/components/reflection/ReflectionEditor.tsx`) has no draft/autosave/beforeunload
— the app's highest-effort input dies to one swipe-back. The shift modal
(`src/react/components/ShiftModal.tsx`) closes on Esc/backdrop with no dirty check, and
switching capture tabs unmounts the form.

**What:**

- **Reflection autosave:** debounce-persist the in-progress editor state, keyed per user +
  editing-context (new vs editing-id). Storage: your call between a localStorage entry or
  a local-only Dexie table — requirements either way: survives tab kill and navigation;
  silently restores on return (with a subtle "draft restored" note); cleared on
  successful save and on explicit discard; **never enters the sync outbox / domain
  types** (drafts are device-local by design); wiped by Step 9's "Remove". Don't touch
  `src/domain/types.ts` for this — keep it out of the generated-schema surface.
- **Shift modal dirty confirm:** track dirtiness in the shift form state; on Esc,
  backdrop click, explicit close, or capture-tab switch with a dirty form, `window.confirm`
  ("Discard unsaved changes to this shift?") — matching the app's existing confirm
  conventions. Mind the modal's nested-route tab host (recent R1–R8 rework) — tab
  switches are route navigations, so intercept there, not just on unmount.

**Verify:** type half a reflection, kill the tab, reopen → text restored; save → draft
gone. Dirty shift form + Esc → confirm appears; clean form → closes silently. Tests for
the draft store's save/restore/clear lifecycle if it lands in a pure module.

### Phase D — first touch, legal, brand

#### Step 12 — Login screen: invite-only truth + demo framing + register interest (D3, D4)

**Why:** Self-signup is off (correct), but the login screen never says so — an invitee
using the wrong email waits forever for a link that never comes (the non-enumerating copy
makes this worse). And guest mode reads like a lightweight account when it's now
positioned as a demo.

**What, in `src/auth/LoginScreen.tsx` (guest copy also appears in `ProfilePage.tsx` —
keep them consistent):**

- Under the "Sign in" heading: "PlaceMate is in a private beta — sign-in works for
  invited accounts." followed by a register-interest link: "Want an invite? Email us" →
  `mailto:hello@placemate.uk?subject=PlaceMate%20beta%20interest`.
- The post-request confirmation adds: "…use the same address your invite was sent to."
  (**Preserve non-enumeration** — this hint is unconditional copy, not a response to the
  address's existence.)
- Guest section reframed as demo: button label "Try the demo on this device"; sub-text
  along the lines of "The demo keeps everything on this device — load demo data to
  explore. Demo data doesn't transfer into a beta account." Adjust `AuthGate`/guest-mode
  labels if they say "guest" anywhere user-facing.
- Footer line (also part of Step 14): "Privacy · Terms · hello@placemate.uk".

**Verify:** live screenshot desktop + mobile; click-through the mailto; guest entry still
works; requested-state copy reads correctly.

#### Step 13 — Branded magic-link email (D13)

**Why:** The sign-in email is the library default — subject "Your secret sign-in link",
bare From address, one line of unstyled HTML. It's the first product touchpoint and it
looks like phishing, right after a full DKIM/DMARC stack was built for it.

**What:** The `Passwordless` construct (`infra/lib/constructs/auth.ts`) exposes override
hooks. **Read the installed package before designing**:
`infra/node_modules/amazon-cognito-passwordless-auth/dist/cdk/index.d.ts` (construct
props, `functionProps`/`createAuthChallenge` overrides) and
`dist/custom-auth/magic-link.js` (how `contentCreator` and `FromEmailAddress` are used —
the audit noted content customisation goes through a custom create-auth-challenge entry
that calls the library's `configure({ contentCreator })`; sender display name may be as
simple as setting the from address to `"PlaceMate" <hello@placemate.uk>` — verify how the
lib builds `FromEmailAddress` before assuming).

Requirements for the email itself: From `PlaceMate <hello@placemate.uk>`; subject
"Your PlaceMate sign-in link"; short branded HTML (visually consistent with
`emails/templates/welcome-beta/body.html` — **read it for palette/tone, do not modify
it**) + plain-text part; body states the link works once, expires in 15 minutes, and must
be opened on the device that requested it; sign-off mentions hello@ for help. Keep the
sender address sourced from `config.ts` (single source of truth — see the note in
`deploy-backend`'s old SES_FROM_ADDRESS comment; that repo variable was deleted).

**Verify:** after deploy, request a real magic link to an owner-controlled address;
confirm rendering (subject/from/body), that the link signs in, and that Gmail shows
DKIM/SPF pass (`show original`).

#### Step 14 — Legal surface: in-app links + privacy policy update (D2, D8)

**Why:** The app contains zero legal links and no support contact; the login screen
collects emails with no notice. The privacy policy (marketing site) never names Sentry,
which receives emails, error events, on-error masked replays, and unmasked feedback
screenshots. UK GDPR transparency gap; also the policy's "we" has no identity.

**What:**

1. **App:** footer links on `LoginScreen` (done in Step 12 — confirm) and a Profile
   "About PlaceMate" panel: Privacy → `https://placemate.uk/privacy`, Terms →
   `https://placemate.uk/terms`, contact `hello@placemate.uk`, and the running app
   version (the release SHA from Step 5 is available — nice-to-have).
2. **Privacy policy** (`site/src/pages/privacy.astro`): add a processor paragraph naming
   Sentry (EU data residency — the DSN pins the `de` ingest region) and exactly what it
   receives: account email + display name on error reports and feedback, error/crash
   events, replays **only when an error occurs** with all text/inputs masked, and
   screenshots **only when the user attaches one to feedback** (unmasked — tell users not
   to include patient-identifiable info, consistent with the in-app warning). Name the
   controllers: "PlaceMate is operated by Nicola Nightingale and Ellis Taylor" + contact.
   Keep the erasure promise and make it honest: erasure within 30 days of a request to
   hello@, noting rolling backups expire within ~35 days (DynamoDB PITR window). Bump the
   "last updated" date.
3. **Terms** (`site/src/pages/terms.astro`): only if needed for consistency (beta
   framing already exists); don't rewrite.

**Verify:** links resolve from the deployed app; policy renders; copy reviewed against
what Step 5 actually ships (no disclosure drift in either direction).

#### Step 15 — Erasure runbook + `scripts/erase-user.ts` (D9)

**Why:** The policy promises erasure; nothing implements it. Tombstones retain full
pre-image record content for ~90 days, and relationship mirror rows live in *other*
users' partitions — a naive partition delete misses both.

**What:**

- `scripts/erase-user.ts` (runnable via `npx tsx`, AWS SDK v3, `--profile personal`
  semantics via `AWS_PROFILE` or explicit credentials-from-ini): input `--email` or
  `--sub`; `--dry-run` default ON (prints what would be deleted; `--execute` to act).
  Steps: resolve the Cognito user (list-users by email) → delete every item in the
  `USER#<sub>` partition **including tombstones** (query all SKs, batch-delete) → find
  and delete relationship mirror rows referencing this user in counterpart partitions
  (**read `src/data/dynamo/relationships.ts` first** for the exact `SHARE#`/`MENTOR#`
  mirror key shapes; a scan with a filter is acceptable at beta scale) → delete the
  Cognito user. Print a checklist of the manual tail: delete the user's data in Sentry
  (User Feedback + events by user id), and any emails from them in the hello@ inbox if
  requested.
- Runbook `docs/runbooks/erasure.md` (create the directory): when a request arrives,
  verify identity (reply from the account email), run the script dry then live, do the
  manual tail, reply confirming, note the 35-day PITR backup expiry line. Keep it short
  enough to actually be followed.
- Add a note to `README.md`'s doc index pointing at the runbook.

**Verify:** integration-test the deletion logic against dynalite (the repo already has
`tests/helpers/dynamoLocal.ts` scaffolding) — seed a user + a share grant to another
user, erase, assert both partitions clean. The live rehearsal is on the owner's checklist.

#### Step 16 — "PlaceMate" written everywhere (D12)

**Why:** Prose casing is currently a mix ("PlaceMate" in app copy, "Placemate" tab title,
"placemate" in some marketing prose). Owner locked: written form is **PlaceMate**; the
lowercase logo/wordmark is untouched.

**What:** case-sensitive sweep of user-facing strings in `src/` (including `index.html`'s
`<title>`), `site/src` (prose + `SITE` consts + page titles/meta), and any email content
introduced in Step 13. Do **not** touch: the `Logo` component / wordmark rendering,
domains/URLs/emails (lowercase by nature), code identifiers, package names, or
`emails/templates/**`. Grep patterns: `\bplacemate\b` and `\bPlacemate\b` in
strings/JSX/astro text nodes — review each hit rather than blind-replacing.

**Verify:** build both app and site; spot-check tab title, login screen, home copy,
marketing hero, and page `<title>`s live after deploy.

---

## 4. Explicit non-goals (do not drift into these)

- NHS wifi reachability (owner-excluded; hedges partially exist in `web.ts`).
- Guest→account data import (D3: reframed as demo instead).
- Clock-skew handling, field-level merge, or any sync-protocol redesign.
- API throttling/WAF, `syncPush` server-side validation, tombstone-aware relationship
  reads, 500-body sanitisation (real findings, deliberately post-beta).
- Full-fidelity data export; app-side analytics; welcome-email template changes;
  code-splitting the bundle; planner mobile calendar work.
- The medium/low audit backlog generally — it's recorded in the session memory
  (`beta-readiness-audit`) and the audit report; don't cherry-pick from it mid-run.

## 5. Suggested kickoff prompt for the executor session

> Read `plans/2026-07-21-beta-hardening.md` end to end, then implement it step by step.
> Follow its ground rules exactly (especially: stage only your own paths; every push
> deploys to production; verify each step live before the next). Start at Step 1. If a
> step's assumptions no longer match the code (another session may have moved things),
> stop and reconcile against the step's "Why" before proceeding — the intent wins over
> the letter.
