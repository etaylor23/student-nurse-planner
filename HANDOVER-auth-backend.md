# HANDOVER — Student Nurse Planner: scope auth + a DynamoDB backend (per-user, JWT-locked)

_You are picking up a working, fully-local PoC and scoping its move to a real multi-user
backend. **This is an EXPLORATION + SCOPING thread — do NOT write feature/infra code yet.**
Your job is to explore the codebase, then use the `grill-me` skill to interrogate the design
decisions with the user until the decision tree is resolved, and emit scoping specs + a phased
plan for approval._

## 0. How to run this thread (read first)

1. **Enter plan mode / stay read-only.** Explore, don't build. No AWS resources, no code, no
   `npm install` of backend deps until the plan is approved.
2. **Read the codebase files in §4** so you understand the storage seam concretely (it's the
   whole point — see §3).
3. **Invoke the `grill-me` skill** and walk the user through the decision tree in §5. Grill hard:
   surface trade-offs, cost, security, and the "straight list of users initially" constraint the
   user stated. Resolve each branch to a decision.
4. **Emit the deliverables in §7** (scoping specs + phased plan) and present the plan via
   `ExitPlanMode` for approval. Implementation happens in a *later* thread/phase.

There is persistent project memory (`MEMORY.md`) with the git workflow (work on `master`, commit
+ push straight to it) and a note that `spec/notifications.md` is specced-not-built.

## 1. The goal (user's words, paraphrased)

- Add **authorisation**: log in, get a **JWT**.
- Move the local IndexedDB store to **DynamoDB**.
- The JWT **locks the DynamoDB data to a particular user** (no cross-user access).
- **Start with a straight list of users** (admin-provisioned / seeded — not open self-signup, at
  least initially).

## 2. Where the app is now (v1 of screens — done)

A Vite + React 18 + TypeScript + Tailwind v4 SPA, deployed to **GitHub Pages** (static, auto-
deploys on push to `master`). All **eight features are built, integrated, tested (181 tests / 27
files), and audited**: placement hours log, weekly planner, NMC competency tracker, clinical
skills, medication notes, reflection, revision timetable, self-care — plus Home hub, Profile, and
a rich activity feed. Everything is cross-linked through a `Shift → capture → EvidenceLink →
proficiency` spine.

**Persistence today:** IndexedDB via Dexie (`nurse-planner-v2`, at schema `version(5)`), all under
a **single hard-coded local user** (`LOCAL_USER_ID = "local-user"`, seeded in
`src/data/dexie/dexieRepository.ts`). There is **no login, no network, no server.** "Load demo
data" / "Clear all data" (Profile) are local-only conveniences.

## 3. The one thing that makes this tractable — the storage seam ⭐

The app was **built multi-user-ready with the backend swap designed in from day one.** Do not
re-architect the frontend; exploit this:

- **Everything goes through one interface:** `src/data/repository.ts` (`interface Repository`).
  Every method is already **async**. `DexieRepository` (`src/data/dexie/dexieRepository.ts`) is the
  **only** storage-specific code in the app. The architecture spec states the plan verbatim:
  _"To move to a backend: implement `Repository` against the API and pass
  `<RepositoryProvider repo={new RestRepository(...)}>`."_
- **Every user-owned row already carries `userId`.** The PoC just pins it to `LOCAL_USER_ID`.
  Reference/seed data (proficiencies, baseline skills, baseline subjects, default break-rules) is
  **global** (`userId: null` or no `userId`) — shared by all users, not per-user.
- **Every entity is a flat record of primitives** — string `id`/FK, ISO-8601 date strings,
  string-union enums, **no nesting** — explicitly so the same shape maps onto _either_ a SQL row
  _or_ a NoSQL document. DynamoDB is a natural fit; no reshaping needed.
- **`src/data/schema.ts` (`STORE_INDEXES`) enumerates every query/access pattern the app uses**
  (primary key + secondary/compound indexes per store). This is your **direct input to DynamoDB
  key + GSI design** — read it as "the access-pattern catalogue".
- **`RepositoryContext.tsx`** injects the repo and resolves the current `User` via
  `getCurrentUser()`. This is where auth/token + real-user resolution slot in.

**Consequence:** the frontend change is roughly (a) a login screen + token storage, (b) an
`ApiRepository` implementing `Repository` over HTTP with the JWT, (c) `RepositoryContext` resolving
the real signed-in user instead of `LOCAL_USER_ID`, (d) handling logged-out state. The heavy design
is all backend: DynamoDB access patterns, the API surface, and JWT-scoped authorisation.

## 4. Files to read before grilling (in order)

- `spec/spec-architecture.md` — the storage-agnostic principle, the `Repository` swap point, the
  full canonical data model (Prisma), "multi-user ready, auth deferred", global-vs-user data.
- `src/data/repository.ts` — **the contract the backend must satisfy** (~25 entities' worth of
  methods). The API surface mirrors this.
- `src/data/schema.ts` — `EntityMap` (25 stores) + `STORE_INDEXES` (**every access pattern** →
  DynamoDB PK/SK/GSI design).
- `src/data/dexie/dexieRepository.ts` — the reference implementation: shows exactly which queries
  each method runs (e.g. `where("[userId+proficiencyId]")`, `[evidenceType+evidenceId]`,
  `[userId+date]`, `[userId+label]`) — the concrete list the backend must serve.
- `src/domain/types.ts` — every entity shape + which carry `userId` vs are global.
- `src/react/RepositoryContext.tsx` — where the repo + current user are provided; the auth insertion
  point. Note `DexieRepository`'s `LOCAL_USER_ID` / `defaultUser()`.
- `src/data/seed/*.ts` — global reference data (proficiencies, skills, subjects) + the opt-in demo
  seed; both need a story under a shared backend (seed-once vs per-user).
- `package.json` / deploy setup — currently static GH Pages; a backend changes hosting/CI.

## 5. The decision tree to grill (resolve each branch with the user)

For each fork, a **starting hypothesis** is offered — treat it as a position to stress-test, not a
decision.

### A. Auth
- **Provider:** AWS **Cognito** user pool _vs_ **custom JWT** (Lambda + password hash + `jose`)?
  _Hypothesis: Cognito_ (managed JWT, JWKS verification, refresh tokens, free tier) unless the
  "straight list of users" makes a tiny custom table + login Lambda simpler. Grill: is Cognito
  overhead worth it for a fixed user list? Who administers users?
- **Provisioning:** admin-seeded fixed list _vs_ self-signup? User said **fixed list initially** —
  confirm: seeded how (IaC? a script? Cognito console)? Any invite flow later?
- **Token handling (frontend):** where does the JWT live — in-memory vs `localStorage` (XSS vs
  refresh UX)? Refresh tokens / silent renew? Session length? Logout behaviour?
- **Login UX:** a `/login` route + auth guard; what replaces today's no-login single-user flow?
  What happens to "Load demo data" / "Clear all data" and the reflection **device PIN** (does real
  auth + per-user privacy make the PIN redundant, or keep it as a second gate)?

### B. Data model in DynamoDB
- **Single-table design vs table-per-entity?** 25 entity types with varied access patterns.
  _Hypothesis: single-table_ (idiomatic, one bill, transactions) with `PK = USER#<userId>`,
  `SK = <ENTITY>#<id>` and GSIs for the compound queries — **but** it's more complex to author than
  ~25 simple tables that mirror the current stores 1:1. Grill the team's DynamoDB comfort vs
  simplicity. (A pragmatic middle: single table keyed by user, GSIs derived from `STORE_INDEXES`.)
- **Key + GSI design:** derive directly from `STORE_INDEXES`. Notable patterns to cover: list-by-
  user (most stores), `[userId+date]` (shifts), `[userId+proficiencyId]` / `[userId+skillId]` /
  `[userId+label]` (unique-ish upserts), `[evidenceType+evidenceId]` (polymorphic evidence lookups
  + reflection-delete cascade), `[reflectionId+stage]`, sort orders (newest-first, orderIndex).
- **Global/reference data:** proficiencies (219 rows), baseline skills, baseline subjects, default
  break-rules. _Hypothesis:_ a shared `GLOBAL` partition readable by any authenticated user, seeded
  once by IaC/a seed job — NOT duplicated per user. Confirm.
- **Volume/pagination:** the `Repository` returns full lists today (fine for one student's data).
  Confirm no pagination needed initially; flag DynamoDB 1MB query limits for the biggest lists
  (log items, proficiencies-global).

### C. API / backend
- **Shape:** API Gateway (REST) + Lambda mapping ~1:1 to `Repository` methods _vs_ AppSync
  (GraphQL)? _Hypothesis: REST + Lambda_ — the `Repository` interface already IS the API contract,
  so a thin `ApiRepository` client + a Lambda per resource (or one router Lambda) is the least-
  friction path. Grill.
- **Authorisation (the core requirement):** a JWT authorizer (Cognito authorizer or a custom Lambda
  authorizer) validates the token and the backend **derives `userId` from the verified JWT claims
  and scopes every read/write to that user's partition** — the client-supplied `userId` is never
  trusted. This is the "locks the data to the user's JWT" requirement; make it explicit and central.
- **Where does `userId` come from now?** Today the client passes `user.id`. Decide: keep the method
  signatures, but the server overrides `userId` from the token (client value ignored/validated).

### D. Migration & coexistence
- **Cutover model:** remote-only _vs_ keep Dexie as an offline cache / "try without an account"
  demo mode _vs_ local-first-with-sync? _Hypothesis: remote-only for signed-in users_, optionally
  keep a Dexie-backed "demo/guest" mode using the existing repo. Grill — offline is a real nurse-
  on-a-ward consideration.
- **Existing local data:** it's a PoC; each tester's local data can likely be discarded (or a one-
  off "import my local data" is a nice-to-have, not v1). Confirm.
- **Demo seed / reset under a shared backend:** `resetDatabase()` must become per-user only; the
  global seed is immutable to users.

### E. Infra & ops
- **IaC:** AWS CDK _vs_ SAM _vs_ Serverless Framework _vs_ Terraform? _Hypothesis: CDK_ (TS, matches
  the stack) — confirm team preference/existing AWS footprint.
- **Hosting:** move the static frontend from GitHub Pages to **S3 + CloudFront** (same origin as the
  API, custom domain, easier CORS) or keep GH Pages + a separate API origin (needs CORS)? Regions,
  dev/prod envs, CI/CD (GitHub Actions?), secrets, cost (DynamoDB on-demand + Lambda + Cognito are
  ~free at this scale).

### F. Security & safety (non-negotiable to nail down)
- No cross-user data access — enforced server-side from the JWT (the whole point).
- Reflections are **personal and sensitive** (the app forbids patient-identifiable data, but the
  content is still private). Encryption at rest (DynamoDB default KMS) + in transit (HTTPS); with
  real auth the reflection lock becomes genuine per-user privacy.
- Least-privilege IAM per Lambda; server-side input validation; rate limiting; JWKS/JWT signature +
  expiry verification; CORS locked to the app origin.

## 6. Architecture rules to preserve (from the built app)

- **Keep the `Repository` interface as the seam.** The new backend is a new *implementation*
  (`ApiRepository`), swapped at `RepositoryProvider`. Don't leak HTTP/auth into feature code.
- **One model in `src/domain/types.ts`;** flat primitives, FK-by-id, no nesting (so it stays
  portable). If auth adds fields (e.g. `User.email`), add them there.
- **Server owns `userId`** (from the JWT) — treat any client-sent `userId` as untrusted.
- **Global reference data stays global** — don't fork it per user.
- Match existing conventions (path-based routing, the `ui.tsx` design system, activity-log
  `LogItem`s at the action layer, emerald accent).

## 7. Deliverables of THIS thread (scoping only)

1. **`spec/spec-auth.md`** — provider choice, the fixed-user provisioning model, token lifecycle,
   login/guard UX, what happens to demo/reset/device-PIN, and how the frontend changes
   (`ApiRepository`, `RepositoryContext`, logged-out state).
2. **`spec/spec-backend-dynamodb.md`** — table design (single vs multi), the PK/SK/GSI map derived
   from `STORE_INDEXES`, global-data strategy, the API surface (mirroring `Repository`), the JWT-
   scoping authorisation model, IaC + hosting choice, and env/CI.
3. **A phased implementation plan** (e.g. Phase 1: infra + auth + `ApiRepository` behind a flag on a
   couple of entities to prove the seam end-to-end; Phase 2: all entities + global seed; Phase 3:
   cutover, offline decision, polish) — present via `ExitPlanMode` for approval.

Update the `README.md` feature table / roadmap and `spec-architecture.md` only once decisions are
locked (in the same commit as any code, per the house workflow).

## 8. Definition of done (for scoping)

Every branch in §5 resolved with the user via `grill-me`; the two specs written; a phased,
estimate-carrying plan approved via `ExitPlanMode`. **No production code or AWS resources created in
this thread** — that's the next phase.
