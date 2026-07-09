# Spec — Implementation Roadmap (agent execution order + human-in-the-loop)

_The build playbook for the auth + DynamoDB backend. Turns the four design specs into an
ordered sequence an implementing agent follows, with the actions **you** (the human) must
take called out inline. Read this first, then the design specs it references:
[`spec-auth.md`](./spec-auth.md), [`spec-backend-dynamodb.md`](./spec-backend-dynamodb.md),
[`spec-calendar-feed.md`](./spec-calendar-feed.md),
[`spec-notifications-backend.md`](./spec-notifications-backend.md)._

## How to use this

- Work **phase by phase, in order**. Each phase is independently deployable and
  verifiable; don't start a phase until the previous **GATE** is signed off.
- **The golden rule: prove the whole seam end-to-end on ONE entity (Phase 1) before
  building breadth (Phase 2).** Depth before width.
- Legend for every step:
  - **[AGENT]** — the implementing agent does this (code, tests, IaC authoring).
  - **[YOU]** — a human-only action (AWS console, credentials, DNS, approvals). The agent
    should **stop and ask** when it reaches one.
  - **[GATE]** — a checkpoint: a human prerequisite or a sign-off before proceeding.
- **Safety default:** the agent **authors** infra and app code but does **not** run
  resource-creating or mutating cloud commands (`cdk bootstrap`, `cdk deploy`, `aws …`
  writes) on its own. Those are **[YOU]** (run after review) or go through CI. Loosen this
  only if you explicitly hand the agent a scoped profile and say so.

---

## 1. What I need from you — front-loaded checklist

Some of these have **external lead time** (support tickets, DNS propagation) — start the
⏳ ones *immediately*, even though they're not consumed until later.

> **AWS profile convention:** the account credentials are configured under the named
> profile **`personal`**. **Every AWS CLI and CDK command in this repo uses
> `--profile personal`** (or `AWS_PROFILE=personal` / `cdk --profile personal`). This is
> the standing rule for all AWS operations here.

| When | Action | Why |
|---|---|---|
| ✅ Done | `aws configure --profile personal` for the new account | Configured. All AWS ops in this repo use `--profile personal`. |
| First | Secure the new account: MFA on root, a **billing alarm**, confirm region **eu-west-2** | Basic account hygiene before resources exist. |
| ⏳ Phase 0 (start early) | **SES: verify a sender identity + request production access** (sandbox exit) | Magic-link emails only reach arbitrary inboxes once SES is out of sandbox — this has a support-ticket lead time. Until then, only *verified* addresses receive links. |
| ⏳ Phase 0 (optional, start early if wanted) | Register/confirm a **custom domain** (Route 53 or external) | For a branded URL + ACM TLS. **Optional** — the app runs fine on the CloudFront default `*.cloudfront.net` domain until you cut over. |
| Phase 0 | Set up **GitHub → AWS deploy access** (an OIDC role is cleaner than long-lived secrets); agent supplies the trust policy, you create/approve it in AWS + add the GitHub side | So CI can deploy without static credentials in the repo. |
| Phase 0 | Run (after reviewing) `cdk bootstrap` + the first `cdk deploy` to **dev** | Resource-creating commands are yours to run per the safety default. |
| Phase 1 | Create a **test user** in the Cognito console; verify your email in SES if still sandboxed | You provisioned users manually (AdminCreateUser via console) — needed to log in and test. |
| Phase 1 & 2 | **Sign off** the GATE demos (auth end-to-end; full online parity) | Human verification the seam holds before widening. |
| Phase 2 | Provision the **real cohort** users in the Cognito console | Going beyond test users. |
| Phase 2 (or when ready) | **DNS cutover** to CloudFront; retire the GitHub Pages workflow | Makes the AWS-hosted, same-origin app the live one. |
| Phase 4 (post-v1) | Define **admin group** membership; review the mentor/share/admin **Cedar policies** | Cross-user access is security-sensitive — human review. |
| Notifications phase | Generate + store **VAPID keys** (Secrets Manager/SSM) | Web Push signing; a human-held secret. |

---

## 2. Cross-cutting rules for the agent (every phase)

- **House workflow:** work on `master`, commit + push straight to it (see project memory).
  Update `README.md` / `spec-architecture.md` **in the same commit as the code** that
  makes a decision real — not before.
- **Keep the `Repository` seam pristine.** New backends are new *implementations*
  (`ApiRepository`, `DynamoRepository`, `SyncRepository`) swapped at `RepositoryProvider`.
  **No HTTP/auth/DynamoDB leaks into feature or UI code.**
- **Feature-flag the swap.** Until a phase's backend is proven, signed-in users keep
  working; flip the flag to move them onto the new implementation. Guest mode always stays
  on `DexieRepository`.
- **Server owns `userId`** from the verified JWT; never trust a client-sent one. Every
  interactive op routes through the single `authorize()` gate.
- **Tests:** extend the existing `Repository` contract suite to each new implementation
  (run against **DynamoDB Local**); add **Cedar policy unit tests** and **sync-logic
  tests**. Keep `npm run typecheck` + `npm test` green before every push.
- **Secrets never in the repo or client bundle** (SSM/Secrets Manager). CDK in TypeScript,
  under `/infra` (or similar), per-env (dev/prod).
- **All AWS CLI / CDK commands use `--profile personal`** (see §1). Never assume a default
  profile.
- Match existing conventions (path-based routing, `ui.tsx` design system, emerald accent,
  `LogItem` audit entries at the action layer).

---

## 3. Pre-flight (one-time)

1. **[YOU]** `aws configure` the account profile; secure root + billing alarm; confirm
   eu-west-2. *(Checklist row 1–2.)*
2. **[AGENT]** Scaffold the CDK app (`/infra`, TypeScript) — app + stack skeletons, npm
   scripts (`cdk:synth`, `cdk:deploy:dev`), no resources defined yet. Add `ts-to-zod`
   wiring for the `*Draft` schemas.
3. **[GATE]** You review the CDK scaffold + confirm the profile/region before any deploy.

---

## 4. Phases

### Phase 0 — Foundations & infra bootstrap
**Goal:** a deployed, empty backend skeleton in **dev** — no app behaviour yet.

- **[YOU]** ⏳ Start the SES production-access request + verify a sender identity (lead
  time). ⏳ Register the custom domain if you want one (else default CloudFront domain).
- **[AGENT]** CDK stacks:
  - DynamoDB single table (on-demand, **PITR on**, **TTL on `ttl`**).
  - Cognito user pool + `amazon-cognito-passwordless` (magic link); self-signup **off**.
  - **AVP** policy store + Cedar schema (3 tiers, 5 verbs) + the two v1 policies.
  - API Gateway **HTTP API** + Cognito JWT authorizer + skeleton **router Lambda** (health
    route); a **separate public `/feeds/*`** route reserved (calendar feed, later).
  - S3 + CloudFront (SPA origin + `/api/*` behaviour + strict CSP headers) + ACM + Route 53
    (only if a domain was provided).
- **[AGENT]** GitHub Actions: a CDK-deploy workflow + a frontend build→S3→CloudFront-invalidate
  workflow. **Keep** the existing GH Pages workflow until cutover.
- **[YOU]** Set up GitHub↔AWS OIDC deploy role (agent provides the trust policy). Run
  (after review) `cdk bootstrap` + first `cdk deploy` to dev.
- **Acceptance:** stacks deploy clean to dev; `/api` health route returns **200 with a
  valid token, 401 without**; `cdk synth` is reproducible in CI.
- **[GATE]** Dev environment up; SES either production-approved or "verified test
  addresses only" noted.

### Phase 1 — Auth + prove the seam on ONE entity
**Goal:** log in for real and round-trip **Placements + Shifts** through the full stack,
JWT-scoped, behind a flag. This proves auth + AVP + RPC + the seam end-to-end.

- **[AGENT]** Frontend: `/login` (magic-link request + redemption callback), auth guard,
  token handling (localStorage + strict CSP + silent renew, logout→global sign-out),
  `RepositoryContext` resolving the Cognito `sub`; guest-mode fallback to Dexie.
- **[AGENT]** Backend: `ApiRepository` (client) + `DynamoRepository` (server) for
  **Placements + Shifts only**, behind a feature flag. `authorize()` via AVP owner-all;
  server overrides `userId` from the token; **lazy-create the `User`** on first
  `getCurrentUser()` + a minimal first-run onboarding.
- **[AGENT]** Tests: contract suite (Placements/Shifts) against DynamoRepository on
  DynamoDB Local; Cedar owner-all policy unit tests.
- **[YOU]** Create a test Cognito user; verify your email in SES if sandboxed.
- **Acceptance / [GATE] demo:** log in via magic link → create/edit a Shift → confirm the
  item in DynamoDB is scoped to your `sub` → confirm a **second** user cannot see it →
  offline/guest still works on Dexie. You sign off.

### Phase 2 — All entities online-remote + hardening
**Goal:** full parity with the Dexie PoC, remote, for signed-in users.

- **[AGENT]** Implement all ~25 entity methods in `DynamoRepository` (full RPC surface).
  **Re-scope the leak-prone queries** (`listConditionsForUser`,
  `listReflectionSectionsForUser`, `listReflectionTags`,
  `listEvidenceLinks(proficiencyId)`, `listMedicationLogsForShift`) through owner/AVP.
- **[AGENT]** `zod` validation (codegen'd via ts-to-zod); `ApiRepository` serves reference
  reads from the client **bundle** (no `GLOBAL` partition); per-user "Clear all data"
  scoped delete; **drop the reflection PIN**; **audit logging** of non-owner allows at the
  gate (none expected yet, but wired); least-priv IAM; API Gateway throttling; the
  fail-closed + short-TTL decision cache.
- **[AGENT]** Flip the flag: signed-in users use `ApiRepository` for **all** entities;
  guest stays Dexie. Full contract suite green.
- **[YOU]** Provision the real cohort in the Cognito console. **DNS cutover** to CloudFront
  when ready; retire the GH Pages workflow.
- **Acceptance / [GATE]:** every feature works signed-in against the remote with no UI
  changes; contract suite green; you sign off parity.

### Phase 3 — Local-first sync
**Goal:** offline-capable; the destination architecture.

- **[AGENT]** `SyncRepository` behind the seam wrapping Dexie + a background reconciler;
  **state-based outbox**; `syncPull`/`syncPush` batch endpoints; record-level
  server-authoritative **LWW**; **tombstones** (soft delete + ~90-day TTL); offline-token
  handling; sync triggers (load / `online` / debounced post-mutation / light poll).
- **[AGENT]** Tests: contract suite via `SyncRepository`; sync-logic tests (LWW, outbox
  idempotency, tombstone lifecycle, offline→reconnect convergence).
- **Acceptance / [GATE]:** on a real device — edit offline → reconnect → changes flush;
  two devices converge; a delete propagates; a >30-day-offline outbox survives re-login.
  You sign off.

### Phase 4 — Target-state authz features (post-v1)
**Goal:** mentor read, per-item peer sharing, admin break-glass — all as *additive* Cedar
policies + relationship records.

- **[AGENT]** Mirror-item relationship records (Mentorship / Share); the `Share` action;
  Cedar policies (mentor→`EvidenceRecord` only; per-item share incl. `SensitiveRecord`;
  admin break-glass); **explicit relationship-entity-per-request** in AVP calls; audit
  every non-owner allow. Sharing/mentor UI.
- **[YOU]** Define the admin Cognito group; review the Cedar policies before they ship.
- **Acceptance / [GATE]:** policy unit tests for each rule; a mentor sees a mentee's
  hours but **not** reflections; a shared reflection is visible only to its grantee; admin
  access appears in the audit log. You sign off.

---

## 5. Independent later phases (not blocking v1)

- **Calendar feed** — implement [`spec-calendar-feed.md`](./spec-calendar-feed.md): the
  `CalendarFeed` entity, the public `/feeds/{token}.ics` route, token rotation. **[YOU]**
  nothing beyond reviewing the capability-token model.
- **Notifications backend** — implement
  [`spec-notifications-backend.md`](./spec-notifications-backend.md): service worker, push
  subscriptions, `NotificationPref`, the scheduler. **[YOU]** generate + store VAPID keys.
- **Post-v1 GDPR** — self-serve account deletion + client-side JSON export (interim: the
  per-user wipe + you deleting the Cognito user in-console).

---

## 6. Ordering rationale (why this sequence)

- **Infra before app** (P0): you can't wire `ApiRepository` to nothing.
- **One entity before all** (P1): the riskiest integration is *the seam itself* — auth +
  JWT-scoping + AVP + RPC. Prove it on Placements/Shifts (small, already well-understood)
  so any breadth work in P2 is mechanical repetition, not discovery.
- **Online-remote before sync** (P2 before P3): sync wraps a *working* remote; building it
  first would be building on air.
- **Sharing last** (P4): it's the only part needing cross-user relationships + additive
  policies; the whole design deliberately makes it additive, so it can't block v1.
- **Feeds/notifications independent**: they use different auth models (capability URL /
  server-initiated) and don't touch the interactive seam, so they slot in whenever.

## 7. Status

Planning artefact for a not-yet-started implementation. No code or AWS resources exist.
First real action is **`aws configure`** (§1, row 1).
