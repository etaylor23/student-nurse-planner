# Spec — DynamoDB Backend, Authorisation & Sync (DRAFT, pending approval)

_Scoping + modelling output of the auth+backend exploration thread. Companion to
[`spec-auth.md`](./spec-auth.md), [`spec-calendar-feed.md`](./spec-calendar-feed.md),
[`spec-notifications-backend.md`](./spec-notifications-backend.md). Nothing here is built
yet. Update [`spec-architecture.md`](./spec-architecture.md) / `README.md` only when code
lands._

## 1. Principles (locked)

- **F1 — Ownership is data, not just a key.** Every user-owned item carries an explicit
  `owner` attribute (the Cognito `sub`). `owner` also seeds the partition key for the
  fast "my data" path, but **authorisation reads the attribute** — so a row can become
  visible to a non-owner (mentor / grantee / admin) *without moving it*.
- **F2 — One authorisation decision point.** Every read/write on the server passes
  through a single `authorize(principal, action, resource)` gate backed by AVP. Mentors,
  sharing and admin arrive as **new policies at that one gate**, never as edits scattered
  across the ~70 `Repository` methods. This also closes the current cross-tenant leak
  risks (§7).
- **Authorisation is decoupled from physical keying** — the gate reads the `owner`
  *attribute* (via AVP), so keying is a pure storage-efficiency choice.
- **The `Repository` interface stays the seam.** The backend is new *implementations* —
  `ApiRepository` (client), `DynamoRepository` (server), and later `SyncRepository`
  (client, wrapping local Dexie) — swapped at `RepositoryProvider`. No HTTP/auth leaks
  into feature code. The `src/domain/types.ts` model stays flat primitives + FK-by-id.

## 2. Table topology & keying — single table, owner-partitioned (Candidate A)

**Decision: one table, `PK = USER#<sub>`, `SK = <TYPE>#<id>`.** The server stores **only
user-owned data** — global reference data is **bundled in the client** (§2.4), so there
is **no `GLOBAL` partition or seed job in v1**. This serves the dominant "list type X for
one user" as a single base-table `Query`, makes a per-user wipe one partition, and needs
**zero GSIs on the online path**.

### 2.1 Item shape

Every item has three attribute groups — **keys**, **domain fields** (verbatim from
`src/domain/types.ts`), and **infra/sync fields** (added by the backend):

```jsonc
// TOP-LEVEL USER-OWNED ENTITY — a Shift
{
  "PK": "USER#a1b2-sub",              // partition = owner (Cognito sub)
  "SK": "SHIFT#01HZX...",             // <TYPE>#<id> → begins_with("SHIFT#") lists my shifts
  "owner": "a1b2-sub",               // F1: ownership as an ATTRIBUTE (AVP reads this)
  "entityType": "shifts",            // = EntityMap key; drives dispatch + zod validation
  "id": "01HZX...",
  /* …domain fields exactly as the Shift type… */
  "updatedAt": "2026-06-18T09:12:00Z", // LWW clock (§3.1)
  "version": 7,                       // informational monotonic counter (NOT an OCC gate — §3.1)
  "deleted": false                    // tombstone flag; "ttl" set on tombstones (~90d reap)
}
```

Conventions:
- **Child entities** (no `userId` in the domain: `ReflectionSection`,
  `MedicationCondition`, `ProficiencyStatusEvent`, `ReflectionTag`) live in the owner's
  partition, `owner` stamped from the parent, parent id encoded in the SK —
  `SK = "REFSECTION#<reflectionId>#DESCRIPTION"`. The `#stage` suffix also gives the
  `[reflectionId+stage]` uniqueness for free.
- **Deterministic-upsert entities** map their unique index into the SK —
  `SK = "PROFPROG#<proficiencyId>"`, `"SKILLPROG#<skillId>"`, `"TAG#<labelLower>"`,
  `"CALCSTAT#<calcType>"` — idempotent upserts, no conditional-check GSI.
- **Global reference data is NOT stored server-side in v1** — see §2.4.
- **IDs**: keep the app's existing client-side id generator (offline creates need no
  server round-trip). Where an SK needs chronological order (`LOG#…`), prefix a timestamp.

### 2.2 Access-pattern catalogue → keys

Derived from `STORE_INDEXES` ([`src/data/schema.ts`](../src/data/schema.ts)) and the
concrete queries in `DexieRepository`:

| Store | Dexie access pattern | DynamoDB |
|---|---|---|
| users | get by id | `PK=USER#sub, SK=PROFILE` (lazy-created — §2.5) |
| breakRules | user rules; **global defaults bundled** | user `SK begins_with BREAKRULE#`; defaults from client bundle (§2.4) |
| placements | list by user | `SK begins_with PLACEMENT#` |
| shifts | by user; `[userId+date]`; status | `SK begins_with SHIFT#`; date/status in-memory |
| logItems | by user (newest); `[entityType+entityId]` | `SK=LOG#<ts>#<id>`; entity filter in-memory |
| medications | by user | `SK begins_with MED#` |
| medicationConditions | by medicationId; `[medicationId+condition]` | child `SK=MEDCOND#<medId>#<condition>` |
| medicationLogs | by user; medicationId; shiftId; date | `SK begins_with MEDLOG#`; secondary filters in-memory |
| calcDrills | by user; filter medicationId | `SK begins_with CALCDRILL#` |
| calcStats | by user; id=`${userId}:${type}` | `SK=CALCSTAT#<calcType>` (deterministic) |
| proficiencies | **global** | **bundled (client)** — not stored server-side (§2.4) |
| proficiencyProgress | by user; `[userId+proficiencyId]` | `SK=PROFPROG#<proficiencyId>` (deterministic) |
| proficiencyStatusEvents | by progressId | child `SK=PROFEVENT#<progressId>#<ts>` |
| evidenceLinks | by proficiencyId; by user; `[evidenceType+evidenceId]` | `SK=EVLINK#<proficiencyId>#<id>`; cascade filter in-memory |
| skills | **global** baseline + user custom | baseline **bundled**; custom `SK begins_with SKILL#` |
| skillProgress | by user; `[userId+skillId]` | `SK=SKILLPROG#<skillId>` (deterministic) |
| reflections | by user (newest) | `SK begins_with REFLECTION#` |
| reflectionSections | by reflectionId; `[reflectionId+stage]` | child `SK=REFSECTION#<reflectionId>#<stage>` |
| tags | by user; `[userId+label]` | `SK=TAG#<labelLower>` (deterministic) |
| reflectionTags | by reflectionId | child `SK=REFTAG#<reflectionId>#<tagId>` |
| subjects | **global** baseline + user custom | baseline **bundled**; custom `SK begins_with SUBJECT#` |
| revisionTargets | by user | `SK begins_with REVTARGET#` |
| revisionTopics | by user; `[userId+subjectId]`; nextDue | `SK begins_with REVTOPIC#`; filters in-memory |
| revisionSessions | by user; topicId (cascade) | `SK begins_with REVSESSION#` |
| selfCareCheckins | by user (newest) | `SK begins_with SELFCARE#` |

`deleteReflection`'s cascade is one `TransactWrite` in the owner's partition.

### 2.3 Volume / pagination

**No pagination in v1.** Per-user lists are one student's data; the sync pull loops
`LastEvaluatedKey`, so it is correct past 1 MB. Watch `logItems` / `medicationLogs`
(unbounded append) — add user-facing pagination only if a list UI gets unwieldy.

### 2.4 Global reference data — bundled in the client (no `GLOBAL` partition in v1)

**Decision: reference data stays bundled in the app** (`src/data/seed/*.ts`: 219
proficiencies, the derived Annexe-B skills, baseline subjects, default break-rules) —
static, versioned with the build. Consequences:

- **No `GLOBAL` partition, no seed job.** The server stores only user-owned data +
  `proficiencyId`/`skillId` *references*; it never needs the reference *content*.
- **`ApiRepository` serves reference reads locally** — `listProficiencies` /
  `getProficiency` / baseline `listSkills` / `listSubjects` / default `getBreakRules`
  return the bundle with **no network call**; only the user's custom skills/subjects and
  overridden break-rules are fetched remotely and merged (mirroring today's
  `DexieRepository` merge). Fewer network calls, not more.
- **Trade:** updating reference data (e.g. an NMC revision) needs an app redeploy —
  acceptable, and arguably preferable (a student's progress references a stable snapshot
  rather than statements shifting under them silently).
- **Reserved upgrade path:** if reference data ever needs central, no-redeploy updates,
  the `GLOBAL` partition + the Cedar `Reference` type (§4.2) are the drop-in — nothing
  above precludes it.

### 2.5 User provisioning on first login

The `User` row is **lazy-created on the first authenticated `getCurrentUser()`**: the
router Lambda, seeing no `PROFILE` item for the JWT `sub`, writes a default
(`displayName` from the token email local-part or "Me", `email` from the token,
`currentPart: 1`, `totalParts: 3`, field `ADULT`, programme `BSC_3YR`) — mirroring
today's `DexieRepository.ensureSeed()`, and idempotent. An **in-app first-run onboarding**
then lets the student set programme / parts / display name. No Cognito post-auth trigger
reaches into the table (keeps auth infra decoupled from the data schema). See
[`spec-auth.md`](./spec-auth.md) §1.4.

## 3. API surface — RPC over HTTP

**Decision: RPC-over-HTTP behind a single router Lambda.** The `Repository` contract is
already RPC-shaped.

- **Client `ApiRepository implements Repository`** POSTs `{ method, args }` + JWT to one
  endpoint (and short-circuits reference reads to the local bundle — §2.4).
- **API Gateway (HTTP API) + Cognito JWT authorizer** validates the token, invokes **one
  router Lambda** dispatching to **`DynamoRepository implements Repository`**: every
  method calls `authorize()` (§4) then DynamoDB.
- **Server owns `userId`:** signatures keep their `userId` params, but the server
  overrides them from the verified `sub`; client values are never trusted.
- One least-privilege IAM role: the table + AVP + Cognito only.
- **Sync transport (Phase 3):** two batch endpoints — `syncPull(since?)` (the caller's
  changed rows incl. tombstones) and `syncPush(rows)` (state-based batch upsert, each row
  AVP-checked + LWW-merged).

### 3.1 Write semantics — LWW everywhere, no OCC rejection in v1

Online interactive writes use the **same record-level LWW** as sync: the server applies
the write and resolves by `updatedAt`, **ties broken by server receipt order**
(server-authoritative). v1 does **not** reject stale online writes (no version-conditional
409s). Rationale: the data is single-writer, so concurrent cross-device online edits are
rare and LWW resolution is acceptable, and keeping **one** write model (not two) is
simpler and consistent with the sync layer. `version` is retained as an informational
monotonic counter (debugging, a future OCC upgrade), **not** a rejection gate.

## 4. Authorisation

### 4.1 Three authorization surfaces (not everything is a JWT request)

Only the first uses the JWT + AVP gate; the design has three distinct models:

1. **Interactive (JWT + AVP)** — the RPC API. Principal from the verified Cognito token;
   every op through AVP. All normal reads/writes.
2. **Capability URL (no JWT)** — the live `.ics` calendar feed (`/feeds/{token}.ics`).
   Calendar clients can't send a JWT, so an unguessable per-user token in the URL *is*
   the credential: **read-only**, single-user-scoped, rotatable (= revocation),
   rate-limited, served by a **separate public route** (no Cognito authorizer). See
   [`spec-calendar-feed.md`](./spec-calendar-feed.md).
3. **Server-initiated (no client request)** — scheduled push notifications. A backend
   scheduler acts on a user's behalf via a stored push subscription (the subscription
   endpoint is the capability); no JWT, no session. **Notify-only.** See
   [`spec-notifications-backend.md`](./spec-notifications-backend.md).

Both non-JWT surfaces are **read-only or notify-only**, carry **no patient-identifiable
data**, and **never mutate** user data. Any future *mutating* non-interactive surface must
still route through `authorize()`.

### 4.2 Cedar schema (resolved)

- **Principal:** `NursePlanner::User` (id = Cognito `sub`); role via a Cognito group →
  Cedar parent when admin lands.
- **Resource types (three, mirroring the sensitivity tiers):**
  - `SensitiveRecord` — `reflections`, `selfCareCheckins`; attribute `owner: User`.
  - `EvidenceRecord` — all other user-owned data; attribute `owner: User`.
  - `Reference` — **reserved** for future server-side global data; **inert in v1**
    because reference data is bundled (§2.4).
  Adding a new entity later is just tagging it with a tier — no schema change.
- **Actions (coarse verbs):** `Read`, `List`, `Create`, `Update`, `Delete`. Every method
  maps to one verb; authz varies by **verb × resource tier**. A `Share` action is added
  *when* per-item sharing is built.

### 4.3 v1 policy set (all that ships)

```cedar
// Owner can do anything to their own records.
permit(principal, action, resource)
when { resource.owner == principal };

// Reserved: any authenticated user may read global reference data.
// Inert in v1 (no API-served Reference resources — reference data is bundled, §2.4).
permit(principal, action == Action::"Read", resource)
when { resource is NursePlanner::Reference };
```

Everything else — mentor read (`EvidenceRecord` only), per-item peer sharing
(incl. `SensitiveRecord`), admin break-glass — is an **additive `permit` later**.

### 4.4 Enforcement pattern (resolved)

- **AVP runs on every op (single gate).** Owner-partitioning is only defense-in-depth.
- **Load-then-authorize:** Read/Update/Delete `GetItem` first, extract `owner` + `tier`,
  call AVP with `resource={id,owner,tier}`, then act. `Create` sets `owner = principal`.
  `List` authorises the **scope** ("list my own `<tier>`"), then queries — never per-row.
- **Resilience — fail-closed + short-TTL decision cache.** The gate **never fails open**;
  an AVP error denies. A small in-Lambda cache of recent allow decisions (keyed by
  principal + action + resource + tier, a few seconds' TTL) absorbs transient AVP
  latency/blips and cuts cost. In Phases 1–2 (online-only) a *sustained* AVP outage
  degrades the app to errors — acceptable, since AVP is managed regional HA. **Once
  local-first (Phase 3) lands the concern retires:** backend/AVP unavailability just looks
  like being offline — reads serve from Dexie, writes queue, sync on recovery. No parallel
  authz path; the single gate stays intact.
- Optimise further later with `BatchIsAuthorized`.

### 4.5 Relationship / grant model (designed-for, Phase 4)

- **Mentorship** — a mentor `sub` may `Read`/`List` a student's `EvidenceRecord` (never
  `SensitiveRecord`).
- **Share** — a per-item, revocable grant; the *only* path exposing a `SensitiveRecord`.
- **Admin** — a role claim (Cognito group + pre-token-generation claim); break-glass,
  **audited (§4.6)**.
- **Storage — mirror-item pattern:** each grant writes two items in one transaction
  (canonical in the owner's partition; mirror in the grantee's/mentor's partition), so
  "shared with me" / "my mentees" stay plain base-table queries — zero-GSI online path
  preserved. Relationship records carry the owner's `sub`.
- **AVP relationship facts — explicit relationship entity per request.** The Lambda loads
  the specific `Mentorship`/`Share` record for this `(principal, resource)` and passes it
  as an `entities` fact in the `IsAuthorized` call; the policy references it directly. No
  Cedar group/membership graph to maintain — relationships here are sparse and specific,
  and this mirrors the mirror-item lookup. (Direction locked; built at Phase 4.)

### 4.6 Audit trail (cross-user access)

The `authorize()` gate emits a **structured audit record whenever it permits a non-owner
access** (principal ≠ `resource.owner` — i.e. mentor, share, or admin break-glass).
Owner-accessing-own-data is **not** audited (normal path, too noisy).

- **v1 sink: structured JSON to CloudWatch Logs** (append-only, immutable, queryable via
  Logs Insights). Fields: actor `sub`, action, resource type + id, resource `owner`,
  timestamp, grant basis (mentor/share/admin), and a **reason** string for admin
  break-glass.
- A dedicated DynamoDB `AUDIT#` store is **reserved** for later if programmatic / admin-UI
  review of the trail is needed.
- Distinct from the user-facing `LogItem` activity feed (that's product activity, not a
  security audit).

## 5. Migration & coexistence — local-first with sync

**Decision: local-first with sync is the destination.** Built **last** (Phase 3), behind
the seam.

- **`SyncRepository implements Repository`** wraps local Dexie + a background reconciler.
  The existing `DexieRepository` becomes the *local* half; features/UI unchanged.
- **Conflict resolution: record-level, server-authoritative LWW by `updatedAt`;
  tombstone deletes** (same model as online writes, §3.1). Safe: single-writer data.
  Append-only histories never conflict.
- **Write path — state-based outbox.** A durable Dexie outbox stores the resulting row
  (`updatedAt`/`version`) + tombstones; local writes apply instantly; the reconciler
  batch-pushes via `syncPush`; the server upserts with LWW + per-row AVP. Idempotent
  (upsert by client-generated id). *Edge case:* increment ops (`recordCalcAttempt`) don't
  state-merge — accept minor `calcStats` inaccuracy or special-case later.
- **Read/pull path — full-partition pull for v1.** `syncPull` = `Query(PK=USER#<sub>)`,
  LWW-merged into Dexie; loops `LastEvaluatedKey`.
- **Future liveness:** realtime push (Streams → WebSocket / AppSync, **transport
  undecided**), *skipping* delta-polling.
- **Tombstone lifecycle:** soft delete synced like any row; DynamoDB **TTL reaps after
  ~90 days**; clients hide immediately, purge locally once synced.
- **Offline-token handling:** cached session ⇒ offline reads; writes queue; reconnect ⇒
  silent-refresh + flush. Offline longer than the 30-day refresh ⇒ **outbox survives
  forced re-login and flushes after — no writes lost.**
- **Sync triggers:** app load, browser `online` event, post-mutation (debounced), light
  periodic poll while online.
- **Guest/demo mode** stays plain Dexie (this-device-only); hosts "Load demo data."
  Existing PoC local data is **discarded** (no import in v1).

## 6. Infra & ops

- **IaC: AWS CDK (TypeScript).**
- **Hosting: S3 + CloudFront, same-origin API** — SPA on S3; `/api/*` → API Gateway (no
  CORS); a **separate public `/feeds/*`** behaviour for the calendar feed (no authorizer —
  §4.1 / `spec-calendar-feed.md`); CloudFront sets strict CSP/security headers. Custom
  domain + ACM + Route 53.
- **Region:** eu-west-2. **Envs:** dev + prod. **CI/CD:** GitHub Actions.
- **Secrets/config:** Cognito pool/client ids and AVP ids via per-env config; **VAPID
  keys** (notifications) and any signing secrets in **SSM Parameter Store / Secrets
  Manager**, never in the repo or client bundle.
- **Cost:** ~free at this scale.

## 7. Security

Non-negotiable core (locked):

- **Server derives the principal from the verified JWT `sub`;** client-sent `userId`
  ignored. Every interactive op passes the AVP gate.
- **Re-scope the current scatter-scan queries** — `listConditionsForUser`,
  `listReflectionSectionsForUser`, `listReflectionTags`, `listEvidenceLinks(proficiencyId)`,
  `listMedicationLogsForShift` — which today `.toArray()` a whole store and rely on
  single-user isolation. In the shared backend these **must** be owner-scoped / AVP-gated.
- **Cross-user access is audited (§4.6).**
- Least-privilege IAM; server-side input validation via **`zod` schemas codegen'd from
  the TS types (ts-to-zod) in a build step** (TS stays authoritative, no hand-maintained
  drift — keep a small smoke test since ts-to-zod can stumble on complex unions); HTTPS
  end-to-end; JWKS/expiry via the Cognito authorizer; same-origin for the API; capability
  tokens (feeds) are high-entropy, rotatable, rate-limited, read-only.

**Hardening level: Standard for v1** — AWS-managed KMS encryption at rest, API Gateway
throttling + Cognito rate limits, no WAF. **Additive later:** customer-managed KMS key
and AWS WAF.

## 8. Testing

- **Shared `Repository` contract suite across implementations.** The existing 181 tests
  target the `Repository` *interface* via `DexieRepository` + `fake-indexeddb`. Run the
  same suite against **`DynamoRepository` on DynamoDB Local** (in-memory/Docker) — parity
  coverage for free, and it proves the seam holds across storage backends. Later,
  `SyncRepository` runs the same suite too.
- **Cedar policy unit tests.** Evaluate policies locally (Cedar CLI / `@cedar-policy`
  packages) with sample `(principal, action, resource, entities)` → expect allow/deny; no
  AVP deployment needed. Cover owner-all + reference, and the Phase-4 mentor/share/admin
  policies as they land.
- **Sync-logic unit tests.** LWW resolution, outbox flush/idempotency, tombstone
  lifecycle, offline→reconnect.
- Full-stack cloud emulation (LocalStack) is deliberately **not** adopted — the contract
  suite + policy tests cover the risk without the weight.

## 9. Status

Modelling pass + foundational-gap fixes + the six open items are all resolved. Genuinely
implementation-time only: tuning the decision-cache TTL, sync cadence and tombstone TTL
under real usage. **Post-v1 (not v1):** self-serve account deletion + client-side JSON
export (interim = per-user "Clear all data" wipe + manual Cognito user deletion — see
[`spec-auth.md`](./spec-auth.md) §3). The calendar feed and notifications backend have
their own stub specs.
