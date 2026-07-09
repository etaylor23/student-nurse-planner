# Spec — Live Calendar Feed (.ics subscription) — STUB (deferred)

_Status: **STUB / deferred to its own feature phase.** This reserves the auth model and
data shape so the core backend ([`spec-backend-dynamodb.md`](./spec-backend-dynamodb.md))
doesn't design itself into a JWT-only corner. Not built; not fully designed._

## Why this needs its own spec

Today the planner offers a **client-side `.ics` download snapshot** (`buildIcs` in
[`src/logic/ics.ts`](../src/logic/ics.ts)) — a one-off file. A **live subscription feed**
(`/feeds/{feedToken}.ics`, polled by Google / Apple / Outlook) is in the canonical Prisma
model ([`spec-architecture.md`](./spec-architecture.md), `CalendarFeed`) but **not in the
TS `Repository`/model** and is deferred as "needs a backend."

The catch that forces a dedicated auth model: **calendar clients cannot send a JWT.** They
fetch an unauthenticated URL on a schedule. So this surface bypasses Cognito *and* AVP.

## Auth model — capability URL (see backend spec §4.1, surface #2)

- A per-user **`CalendarFeed`** record: `{ userId, feedToken, createdAt }`, where
  `feedToken` is a **high-entropy, unguessable** string. The URL is
  `https://<domain>/feeds/{feedToken}.ics`.
- **The token in the URL is the credential** — treat it like a password. No JWT.
- Served by a **separate public route** (`/feeds/*` CloudFront behaviour → a dedicated
  public Lambda; **no Cognito authorizer**).
- **Read-only.** Never mutates data. Exposes **only** the token-owner's data.
- **Rotatable = revocable:** regenerating `feedToken` makes the old URL 404 (revokes a
  leaked link).
- **Rate-limited** (polite polling; reject abusive rates). HTTPS only.
- **Token → userId lookup** needs an index the main table doesn't have: either a small
  GSI (`feedToken → userId`) or a dedicated lookup item keyed by the token. (This is the
  one place a lookup outside the owner partition is unavoidable.)

## Data exposed

The token-owner's **shifts** (`startAt`/`endAt`/type/placement), optionally revision
sessions/targets. **Generic copy only — no patient-identifiable data, no clinical detail**
(same guardrail as the rest of the app). One-way; clients poll.

## Model / Repository additions

- Add `CalendarFeed` to `src/domain/types.ts` + `schema.ts` (closes the drift with the
  canonical Prisma model).
- `Repository`: `getCalendarFeed(userId)` (get-or-create), `rotateCalendarFeed(userId)`.
- Feed generation reuses `buildIcs` server-side.

## Open questions

- Include revision sessions/targets, or shifts only?
- Signed URL / expiry, or rely purely on token entropy + rotation?
- `Cache-Control` / suggested poll cadence.
- Does the `CalendarFeed` config record sync to devices like other user data, or is it
  server-only?

## Phase

Its own feature phase, after the core backend (Phases 0–2) is proven. Not v1.
