# Spec — DNS & Email (placemate.uk) — LIVE

_Records the DNS and email architecture built for the domain cutover
(`HANDOVER-placemate-domain.md`). Unlike the older `spec-auth.md` /
`spec-backend-dynamodb.md` drafts, **this is built and deployed** (master `dc14912`+).
Companion to [`spec-architecture.md`](./spec-architecture.md). All records are managed as
IaC in the CDK app (`infra/`); the only out-of-band resource is the empty hosted-zone
container. AWS account **641364901830**, region **eu-west-2**, CLI profile **`personal`**._

## 0. Domain & registrar

- **Domain:** `placemate.uk`. **Registrar: GoDaddy** (registration only — unchanged).
- **DNS: Amazon Route 53.** Public hosted zone **`Z01422912TXS1SRHFVF2E`**. GoDaddy's
  nameservers were repointed (delegated) to the zone's four Route 53 NS:
  `ns-1956.awsdns-52.co.uk`, `ns-1093.awsdns-08.org`, `ns-499.awsdns-62.com`,
  `ns-917.awsdns-50.net`. Delegation confirmed via public resolvers.
- **Why Route 53:** every record is code (CDK), and ACM/SES DNS validation is automatic
  against the zone. Registration staying at GoDaddy avoids a transfer.

## 1. Subdomain plan

| Name | Purpose | State |
|---|---|---|
| `app.placemate.uk` | The SPA — CloudFront distribution `E3ROJUBT1ZLKZV` (`dufbsm93sx7h9.cloudfront.net`), same-origin `/api` + `/feeds` | **LIVE** |
| `mail.placemate.uk` | SES **custom MAIL FROM** (SPF alignment) | **LIVE** |
| `_dmarc.placemate.uk` | DMARC policy record | **LIVE** |
| `placemate.uk` (apex) | Future corporate/marketing site | **Reserved** (unconfigured) |
| `www.placemate.uk` | 301 → apex, when the corporate site exists | **Reserved** (cert already covers it) |

## 2. TLS certificate (CloudFront)

- **ACM cert in `us-east-1`** (CloudFront requirement) covering `placemate.uk` +
  `*.placemate.uk`, DNS-validated against the Route 53 zone.
- The app stack is `eu-west-2`, so the cert is owned by a dedicated us-east-1 stack
  **`NursePlanner-dev-UsEast1`** ([`infra/lib/certificate-stack.ts`](../infra/lib/certificate-stack.ts))
  and consumed by the app stack via **CDK cross-region references**
  (`crossRegionReferences: true`). Replaces the deprecated `DnsValidatedCertificate`.
- **Prereq learned:** `us-east-1` had to be `cdk bootstrap`ed (only `eu-west-2` was).
- The wildcard covers apex + `www` too, so the future corporate site needs no cert change.

## 3. CloudFront custom domain

- `app.placemate.uk` attached to the **existing** distribution `E3ROJUBT1ZLKZV` as an
  alias + the ACM cert — an **in-place** update (`cdk diff` confirmed no replacement; the
  `*.cloudfront.net` domain keeps working). `A` + `AAAA` alias records → CloudFront.
- Same-origin model unchanged: `/api/*` and `/feeds/*` proxy to API Gateway on the same
  distribution, so `VITE_API_BASE=/api` needs no change and there is no CORS. The strict
  CSP (`connect-src 'self' https://cognito-idp.eu-west-2.amazonaws.com`) still holds under
  the new host. Wired in [`infra/lib/constructs/web.ts`](../infra/lib/constructs/web.ts).

## 4. Email — SES sending (magic links)

Sending identity is the **`placemate.uk` domain identity** (SES v2, eu-west-2), fully
verified, with the complete deliverability record set so magic-link mail reaches the
inbox. IaC: [`infra/lib/constructs/email.ts`](../infra/lib/constructs/email.ts).

- **Sender:** `hello@placemate.uk` (the Cognito passwordless `CreateAuthChallenge` Lambda's
  `SES_FROM_ADDRESS`). Any address on the verified domain is allowed.
- **Easy DKIM:** 3 × CNAME (`<token>._domainkey.placemate.uk` → `<token>.dkim.amazonses.com`),
  status `SUCCESS`.
- **Custom MAIL FROM `mail.placemate.uk`** (SPF alignment to the From domain):
  - `MX` → `feedback-smtp.eu-west-2.amazonses.com` (priority 10)
  - `TXT` SPF → `v=spf1 include:amazonses.com -all`
  - `mailFromBehaviorOnMxFailure: USE_DEFAULT_VALUE` (falls back to the SES MAIL FROM on
    MX failure rather than dropping mail; DMARC still passes via DKIM alignment).
- **DMARC** (`_dmarc.placemate.uk` TXT): `v=DMARC1; p=none; rua=mailto:hello@placemate.uk; fo=1`.
  Start at `p=none`; **tighten to `p=quarantine` then `p=reject`** after ~1–2 weeks of
  clean aggregate reports (requires `hello@` to actually receive — see §6).
- **Verified deliverability:** a live magic-link sign-in was confirmed to land in the
  **inbox (not junk)** with **SPF, DKIM and DMARC all passing**.

### 4.1 Gotcha — DKIM records must be L1 `CfnRecordSet`
The `dkimDnsTokenName{1,2,3}` attributes are deploy-time **tokens** already fully
qualified (`<token>._domainkey.placemate.uk`). The L2 `CnameRecord` can't inspect a token
at synth time to see it already ends in the zone name, so it **doubled** the suffix
(`..._domainkey.placemate.uk.placemate.uk`) and SES never found the records. Fix: create
the 3 DKIM records with the **L1 `CfnRecordSet`** (writes `name` verbatim — exactly how
CDK's own `EasyDkim.bind()` does it). MAIL FROM / DMARC use literal names, so they were fine.

## 5. SES production access

- **Status: sandbox** (`ProductionAccessEnabled: false`, 200 sends/day, verified
  recipients only). Prior request **DENIED** — case **`178367384100078`**.
- The API re-request (`sesv2 put-account-details`) returns **`ConflictException`** while a
  review case exists, and the Support **API** needs a paid support plan this account lacks.
  So re-requesting is a **console step**: reply to case `178367384100078` in the Support
  Center of account `641364901830` (draft prepared). ~24h turnaround.
- Until granted, each new cohort member must be **SES-recipient-verified** (a one-time AWS
  "verify your email" click) before they can receive a link. Production access removes this.

## 6. `hello@` receiving (open)

- **GoDaddy email forwarding is not viable:** GoDaddy pushes a paid mailbox, and DNS now
  lives at Route 53 (GoDaddy no longer controls the MX).
- **Plan: ImprovMX (free)** — forward `hello@placemate.uk → a real inbox` via apex `MX`
  (`mx1/mx2.improvmx.com`) + apex SPF (`include:spf.improvmx.com`). **No conflict with
  SES**, which sends via the `mail.` subdomain, not the apex.
- **Not on the critical path:** only needed so DMARC aggregate reports and any replies to
  `hello@` land somewhere. Deliverability of outbound magic links does not depend on it.
  Note the DMARC `rua` currently points at `hello@` which does not yet receive (benign).

## 7. Record inventory (Route 53 zone `Z01422912TXS1SRHFVF2E`)

| Name | Type | Value | Purpose |
|---|---|---|---|
| `placemate.uk` | NS / SOA | Route 53 defaults | Zone apex |
| `app.placemate.uk` | A / AAAA (alias) | → CloudFront `E3ROJUBT1ZLKZV` | SPA |
| `_<hash>.placemate.uk` | CNAME | ACM validation target | Cert DNS validation |
| `<token>._domainkey.placemate.uk` ×3 | CNAME | `<token>.dkim.amazonses.com` | Easy DKIM |
| `mail.placemate.uk` | MX | `10 feedback-smtp.eu-west-2.amazonses.com` | SES MAIL FROM |
| `mail.placemate.uk` | TXT | `v=spf1 include:amazonses.com -all` | SPF |
| `_dmarc.placemate.uk` | TXT | `v=DMARC1; p=none; rua=mailto:hello@placemate.uk; fo=1` | DMARC |

## 8. Key files

- [`infra/lib/config.ts`](../infra/lib/config.ts) — `customDomain` (domain + zone id/name),
  `allowedOrigins`, `sesFromAddress`, `retainData`.
- [`infra/lib/certificate-stack.ts`](../infra/lib/certificate-stack.ts) — us-east-1 ACM cert.
- [`infra/lib/constructs/email.ts`](../infra/lib/constructs/email.ts) — SES identity + DKIM/MAILFROM/DMARC records.
- [`infra/lib/constructs/web.ts`](../infra/lib/constructs/web.ts) — CloudFront alias/cert + A/AAAA records.
- [`infra/bin/app.ts`](../infra/bin/app.ts) — cert stack wiring + cross-region references.

## 9. Operational runbook

- **DMARC tightening:** once `hello@` receives, review `rua` reports ~1–2 weeks, then move
  `p=none` → `p=quarantine` → `p=reject` (edit `email.ts`, redeploy).
- **Adding a cohort user (sandbox):** `admin-create-user` (invite suppressed) +
  `admin-set-user-password --permanent` (→ CONFIRMED); then `sesv2 create-email-identity`
  for their address and have them click the AWS verification email. Drops away post prod-access.
- **Deploy order after any zone/cert change:** `cdk deploy NursePlanner-dev-UsEast1` (cert)
  → `cdk deploy NursePlanner-dev` (everything else). `cdk diff` first — confirm no
  replacement of the table/pool/distribution.
