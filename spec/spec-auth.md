# Spec — Authentication & Authorisation (DRAFT, pending approval)

_Scoping output of the auth+backend exploration thread. Companion to
[`spec-backend-dynamodb.md`](./spec-backend-dynamodb.md). Nothing here is built yet;
this records the decisions resolved with the user so implementation can begin in a
later phase. Update [`spec-architecture.md`](./spec-architecture.md) and `README.md`
only when code lands (house workflow: docs in the same commit as the code)._

## 0. Goal

Add real multi-user auth to the currently single-user PoC:

- Users log in and get a **JWT**.
- The JWT **locks each user's data to them** — no cross-user access — enforced
  server-side, never trusted from the client.
- Start from a **fixed, admin-provisioned list of users** (invite-gated), not open
  self-signup.

The frontend is already built multi-user-ready: every user-owned row carries
`userId`, all access goes through the async `Repository` interface
([`src/data/repository.ts`](../src/data/repository.ts)), and `RepositoryContext`
([`src/react/RepositoryContext.tsx`](../src/react/RepositoryContext.tsx)) is the single
place the repo + current user are provided. Auth slots in here.

## 1. Provider — AWS Cognito

**Decision: a Cognito user pool** (region **eu-west-2 / London**, for UK
health-adjacent data residency).

Rationale: a brand-new AWS account is being stood up for this, so an AWS-native
identity provider means one bill and a **native API Gateway JWT authorizer** — the
"lock data to the JWT" requirement becomes near-zero custom verification code. JWKS
rotation, token issuance and refresh are all managed.

### 1.1 Login method — magic link (passwordless), from day one

**Decision: passwordless email magic-link** via the official
[`amazon-cognito-passwordless`](https://github.com/aws-samples/amazon-cognito-passwordless-auth)
solution (a CDK construct providing custom auth-challenge Lambdas + SES email + a small
secrets table). No passwords are ever stored, set, or reset.

- The construct provisions its own SES sending, the custom-auth Lambda trio
  (`DefineAuthChallenge` / `CreateAuthChallenge` / `VerifyAuthChallenge`) and a
  short-TTL, single-use secret store for links.
- **Ops gotcha:** SES starts in *sandbox* mode on a new account (can only send to
  verified addresses). For the initial invited cohort, either verify each address or
  request SES production access before go-live.
- A user must already exist in the pool to be issued a link (custom-auth signs in
  existing users) — see provisioning below.

Native email OTP was considered as a lower-infra Phase-1 start; rejected in favour of
the magic-link UX up front.

### 1.2 Provisioning — AdminCreateUser via the Cognito console

**Decision: admin (you) creates each user manually in the Cognito console;
self-signup is disabled.**

- Create the user with the default temp-password invitation email **suppressed**
  (passwordless users have no password to set).
- No welcome-email pipeline needed: share the app URL, the invitee enters their email
  on `/login`, and self-initiates their first magic link.
- No allowlist table, no pre-sign-up Lambda, no invite script — the whole invite
  machinery drops out of v1.
- **Opening up later** (invite-gated self-signup, an admin UI, or open signup) is
  purely additive; the model doesn't preclude it.

### 1.3 Token handling

**Decision: the passwordless client library's default localStorage persistence,
behind a strict CSP.**

- **Storage:** ID / access / refresh tokens in `localStorage`. The app ships **no
  third-party JavaScript** and will run a **locked-down CSP**, so the usual
  XSS-reads-localStorage surface is small; the genuinely sensitive data (reflections)
  is isolated server-side per user regardless.
- **Session:** ~**1h access token / 30-day rotating refresh**; **silent renew** on
  load so a nurse isn't bounced to re-auth mid-shift.
- **Logout:** clears tokens + calls Cognito **global sign-out**.
- **Offline (local-first):** the cached session enables offline reads; writes queue in
  the sync outbox and flush on reconnect after a silent token refresh. If a device is
  offline longer than the 30-day refresh window, the outbox **survives the forced
  re-login and flushes afterward — no writes are lost**. See
  [`spec-backend-dynamodb.md`](./spec-backend-dynamodb.md) §5.

### 1.4 User provisioning on first login

A brand-new Cognito user has **no `User` row** in DynamoDB yet. **Decision: lazy-create on
the first authenticated `getCurrentUser()`** — the router Lambda, finding no `PROFILE`
item for the JWT `sub`, writes a default (`displayName` from the token email local-part
or "Me", `email` from the token, `currentPart: 1`, `totalParts: 3`, field `ADULT`,
programme `BSC_3YR`). This mirrors today's `DexieRepository.ensureSeed()` and is
idempotent. No Cognito post-authentication trigger reaches into the table — auth infra
stays decoupled from the data schema.

An **in-app first-run onboarding** (a short guided step on the first authenticated load)
then lets the student set programme / parts / display name — the same `updateUser` path
the Profile screen already uses. Until they do, the safe defaults above apply, so nothing
breaks if they skip it.

### 1.5 Magic-link abuse hardening

On top of the `amazon-cognito-passwordless` construct's **single-use, short-TTL,
high-entropy** links (which kill replay and brute-force), the standard package:

- **Non-enumerating responses.** Because provisioning is admin-only (self-signup off), an
  unknown email gets **no** link, but the UI always says "if that address has an account,
  a link is on its way" — the flow never reveals who is a user.
- **Rate-limiting** per email and per IP (API Gateway throttling + the construct's
  controls) to blunt inbox-bombing.

## 2. Frontend changes

The seam means the frontend change is contained:

1. **`/login` route + auth guard.** Unauthenticated users see the login screen; the
   app tree only mounts with a valid session.
2. **`RepositoryProvider` selects the repo by session state:**
   - **Signed in →** `SyncRepository` (local-first; Dexie local half + remote
     `ApiRepository`) — see the backend spec. During the build's online-remote phases
     this is a bare `ApiRepository`; the sync wrapper lands in Phase 3.
   - **Guest / "continue without an account (this device only)" →** the existing
     `DexieRepository` unchanged. This is the only way an *uninvited* person can try
     the app, and it hosts **"Load demo data."**
3. **`RepositoryContext` resolves the real user.** `getCurrentUser()` returns the
   Cognito-backed user (identity from the verified JWT `sub`); `LOCAL_USER_ID` is used
   only in guest mode. Auth adds `User.email` (add it in `src/domain/types.ts`, keeping
   the model flat/portable).
4. **Logged-out state** is a first-class screen, not an error.

## 3. Fate of the current local-only affordances

- **Reflection device PIN** ([`src/react/reflectionLock.ts`](../src/react/reflectionLock.ts)):
  **dropped.** Real per-user auth + server-isolated data makes the localStorage
  shoulder-surf gate redundant. Remove the mechanism and its UI; **leave
  `Reflection.isLocked` in the model as a dormant field** so a later reintroduction
  needs no data migration.
- **"Clear all data"** (`resetDatabase()`): becomes a **per-user scoped delete**
  (wipes only the signed-in user's partition, never the global seed). This is the **v1
  interim** for GDPR erasure; combined with you deleting the Cognito user in the console
  on request, it covers erasure until the post-v1 self-serve flow. **Full self-serve
  account deletion (partition wipe + Cognito user deletion + audit) and a client-side JSON
  data export (portability) are post-v1** — the export is nearly free once local-first
  lands (serialise the local Dexie store), but neither ships in v1.
- **"Load demo data"**: a **guest-mode** feature only (Dexie). Real accounts start
  empty apart from global reference data.

## 4. Authorisation (summary — full model in the backend spec)

- The API Gateway **Cognito authorizer** validates the JWT (signature, expiry, JWKS).
- The server **derives the principal from the verified `sub`**; any client-sent
  `userId` is ignored/validated, never trusted.
- Every interactive read/write passes a **single authorisation gate** backed by **Amazon
  Verified Permissions (Cedar)** — v1 policy = "owner can act on their own records"
  (reference data is bundled client-side, so the reference-read policy is reserved but
  inert in v1).
- Cross-user access (**mentor read, per-item peer sharing, admin/support break-glass**)
  is *designed-for* via relationship records + additive Cedar policies, **not built in
  v1**, and every non-owner allow is **audited**. Sensitivity tiers apply: **reflections
  and self-care check-ins are never covered by blanket grants** — shareable only by
  explicit, revocable, per-item action.
- **Not every access is a JWT request.** Two planned surfaces sit outside the
  Cognito+AVP path: the **`.ics` calendar feed** (an unguessable capability token in the
  URL — calendar clients can't send a JWT; read-only, rotatable, rate-limited) and
  **push notifications** (server-initiated via a stored subscription; notify-only). Both
  are read-or-notify-only and carry no patient-identifiable data. See
  [`spec-calendar-feed.md`](./spec-calendar-feed.md) and
  [`spec-notifications-backend.md`](./spec-notifications-backend.md).

See [`spec-backend-dynamodb.md`](./spec-backend-dynamodb.md) §4 for the Cedar schema,
principal/resource/action taxonomy, the relationship model, and the three authorization
surfaces.

## 5. Definition of done (auth slice)

- Cognito pool + magic-link passwordless provisioned via CDK.
- `/login`, guard, silent-renew, logout wired; `RepositoryContext` resolves the
  Cognito user; guest mode falls back to Dexie.
- Server derives `userId` from the JWT and scopes every op through the AVP gate.
- Reflection PIN removed; "Clear all data" scoped per-user.

## 6. Open / deferred

- SES production-access request (out of sandbox) before external users.
- Mentor / peer-sharing / admin-break-glass flows + their Cedar policies (target-state
  phase).
- Optional later hardening: customer-managed KMS key, AWS WAF (see backend spec §7).
