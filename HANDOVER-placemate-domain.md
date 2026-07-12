# HANDOVER — placemate.uk custom domain + SES deliverability + prod access

You are picking up a **fully-grilled, decisions-locked** task: put the Student Nurse Planner
app on **https://app.placemate.uk**, send SES magic-link emails from **hello@placemate.uk**
with full deliverability records, and get **SES out of the sandbox**. The plan below was
resolved with the user over a grilling pass — **do not re-litigate the locked decisions**;
execute them. Only ask if you hit something genuinely undetermined here.

---

## 0. What already exists (the backend is DONE and LIVE)

The auth + DynamoDB backend migration (Phases 0–4) is complete, deployed to one env, and
validated end-to-end on real AWS. The SPA is already published.

- **Repo:** `/Users/ellistaylor/Work/student-nurse-planner`, work on **`master`**, commit + push straight to it (house rule; run `git checkout master` first — repo prone to detached HEAD).
- **AWS:** account **641364901830**, region **eu-west-2**, **always `--profile personal`**. `cdk bootstrap` done. Autonomy rails active (auto mode + $5 budget + deny-list); you may run `cdk`/`aws` incl. `cdk deploy`.
- **CDK app:** `/infra` (TypeScript). One stack per env in `bin/app.ts` (`NursePlanner-dev`, `NursePlanner-prod`); **only `NursePlanner-dev` is deployed**. Constructs in `infra/lib/constructs/`: `data` (DynamoDB), `auth` (Cognito passwordless), `authz` (AVP/Cedar), `api` (HTTP API + router Lambda), `web` (S3 + CloudFront).
- **Live now (the "dev" stack):**
  - App URL: **https://dufbsm93sx7h9.cloudfront.net** (SPA published + working under strict CSP)
  - CloudFront distribution: **E3ROJUBT1ZLKZV** (domain `dufbsm93sx7h9.cloudfront.net`)
  - SPA bucket: `nurse-planner-web-dev-641364901830`
  - API: `https://q3eb0mvdhi.execute-api.eu-west-2.amazonaws.com` (same-origin `/api/*` via CloudFront)
  - Cognito pool: **eu-west-2_1MgF4HGk5**, app client **5p65m7tteq6lfa3qoqu59d84oj**, `admins` group exists
  - AVP policy store: **XweiMGqr4xheMWuMLbsoDR** (owner-all + reference + mentor/share/admin, STRICT)
  - DynamoDB table: `nurse-planner-dev`
- **Config seam:** `infra/lib/config.ts` already has an (unused) `customDomain?: { domainName; hostedZoneId; hostedZoneName; certificateArn }` field on `EnvConfig`, and `allowedOrigins` (currently `http://localhost:5173` + the dev CloudFront domain). The `web` construct does **not** yet wire a custom domain — that's your job.
- **Frontend build/config:** Vite. Client Cognito config comes from `VITE_*` env (baked at build). GitHub repo vars set: `VITE_COGNITO_REGION/USER_POOL_ID/CLIENT_ID`, `SES_FROM_ADDRESS`. Publish workflow: `.github/workflows/deploy-frontend.yml` (OIDC). SES sender is passed via CDK context `-c sesFromAddress=` or repo var `SES_FROM_ADDRESS`.

---

## 1. The goal + LOCKED decisions (grilled with the user)

| Decision | Resolution |
|---|---|
| **DNS hosting** | **Move DNS to Route 53** (create a hosted zone for `placemate.uk`; repoint GoDaddy nameservers). Registration stays at GoDaddy. Manage all records as IaC in the CDK app. |
| **Environment** | **Promote the existing "dev" stack in place to production** — do NOT stand up a second stack, do NOT re-provision users/data. Harden it: `retainData: true` for that env (removalPolicy → RETAIN + `deletionProtection: true` on the table; RETAIN the pool/bucket). These are in-place, non-replacing updates. Keep the physical stack name `NursePlanner-dev` (renaming would replace all resources — pool/users/data/CloudFront/SPA — do NOT). Document that "dev" is now the production env. |
| **App URL** | **https://app.placemate.uk** → the existing (promoted) CloudFront distribution E3ROJUBT1ZLKZV. |
| **Apex `placemate.uk`** | Reserved for a **future corporate/marketing site** (not built now — leave apex web unconfigured or a placeholder). |
| **www** | `www.placemate.uk` → **301 redirect to apex** `placemate.uk` (wire when the corporate site exists; fine to defer). The corporate site's "Log in" button will link to `app.placemate.uk`. |
| **SES sender** | Verify the **`placemate.uk` domain identity** (not just an email); send from **hello@placemate.uk**. |
| **Deliverability** | Full set: **Easy DKIM** (3× CNAME), **custom MAIL FROM** `mail.placemate.uk` (MX + SPF TXT), **DMARC** (`_dmarc.placemate.uk` TXT, start `p=none`, tighten later). All in Route 53. |
| **hello@ inbox** | User sets up **GoDaddy email forwarding** `hello@placemate.uk → their Gmail` (so From is real + DMARC `rua` has a destination). This is a **[HUMAN]** step in GoDaddy. |
| **SES production access** | Currently **DENIED** (case `178367384100078`). Re-request AFTER the domain is verified + DKIM/DMARC live, with a concrete use-case (see §4). |
| **ACM cert** | One cert in **us-east-1** (CloudFront requirement) covering `placemate.uk` + `*.placemate.uk` (so app + apex + www are all ready). DNS-validated via Route 53. |

**Same-origin note:** the app is served by CloudFront which also proxies `/api/*` and `/feeds/*` to API Gateway on the **same distribution**, so under `app.placemate.uk` the API stays same-origin — `VITE_API_BASE=/api` is unchanged. No CORS. The CSP already allows `connect-src 'self' https://cognito-idp.eu-west-2.amazonaws.com`, which still holds.

---

## 2. Execution plan (ordered)

### A. Route 53 + nameservers  — [AGENT authors, HUMAN acts once]
1. Create a Route 53 **public hosted zone** for `placemate.uk` (CDK `HostedZone`, or `aws route53 create-hosted-zone`). Capture the 4 NS records.
2. **[HUMAN]** In GoDaddy: set the domain's nameservers to the Route 53 NS set. (Propagates minutes–hours.) Registration stays at GoDaddy.
3. Verify delegation: `dig NS placemate.uk` returns the Route 53 nameservers.

### B. ACM certificate (us-east-1)  — [AGENT]
- CloudFront requires the cert in **us-east-1**, but the app stack is **eu-west-2**. Use a **cross-region** cert: either a small dedicated us-east-1 stack with `crossRegionReferences: true` and a `Certificate` (DNS validation against the Route 53 zone), or `aws-cdk-lib` `Certificate` in a us-east-1 `Stack` referenced by the eu-west-2 web stack. (`DnsValidatedCertificate` is deprecated — don't use it.)
- SANs: `placemate.uk` + `*.placemate.uk`. Validation: DNS (Route 53 auto-record).

### C. CloudFront custom domain  — [AGENT]
- Wire `config.customDomain` for the promoted env: `{ domainName: "app.placemate.uk", hostedZoneName: "placemate.uk", hostedZoneId: <zone id>, certificateArn: <us-east-1 cert arn> }`.
- In `infra/lib/constructs/web.ts`: add `domainNames: ["app.placemate.uk"]` + `certificate` to the `Distribution` (only when `config.customDomain` is set). Keep the default `*.cloudfront.net` working.
- **Do NOT recreate the distribution** — adding aliases + cert to E3ROJUBT1ZLKZV is an in-place update.

### D. Route 53 app record  — [AGENT]
- `A` (and `AAAA`) **alias** `app.placemate.uk` → the CloudFront distribution (Route 53 `ARecord` with `CloudFrontTarget`).

### E. SES domain identity + deliverability  — [AGENT authors records in Route 53]
1. Create an SES v2 **EmailIdentity** for the domain `placemate.uk` with **Easy DKIM** → publishes 3 DKIM `CNAME`s (put them in Route 53).
2. **Custom MAIL FROM** `mail.placemate.uk`: `MX` → `feedback-smtp.eu-west-2.amazonses.com` (priority 10) + `TXT` SPF `"v=spf1 include:amazonses.com -all"` on `mail.placemate.uk`.
3. **DMARC**: `TXT` at `_dmarc.placemate.uk` = `"v=DMARC1; p=none; rua=mailto:hello@placemate.uk; fo=1"` (start `p=none`; after ~1–2 weeks of clean reports tighten to `p=quarantine` then `p=reject`).
4. (Optional apex SPF for the From domain if you ever send from apex — not needed since MAIL FROM is `mail.` and SPF alignment is via MAIL FROM.)
5. Set the app's sender: `sesFromAddress = hello@placemate.uk` (update the promoted env's config default and/or the `SES_FROM_ADDRESS` repo var) and **redeploy** so the magic-link Lambda sends from it.
- CDK: `aws-cdk-lib/aws-ses` `EmailIdentity` + `MailFromDomain`; or SES v2 L1. DKIM/MAILFROM/DMARC records go in the Route 53 zone as code.

### F. hello@ forwarding  — [HUMAN in GoDaddy]
- Set up email forwarding `hello@placemate.uk → <user's Gmail>` in GoDaddy. Confirms the From address is real + gives DMARC `rua` somewhere to land.

### G. Cognito allowed origins  — [AGENT]
- Add `https://app.placemate.uk` to `allowedOrigins` in `infra/lib/config.ts` for the promoted env (magic-link redirect origin validation) + redeploy. (Keep localhost for dev.)

### H. Promote to prod posture  — [AGENT]
- Flip the promoted env to `retainData: true` (RETAIN + `deletionProtection` on the table; RETAIN pool + bucket). Deploy. Verify no resource replacement in the changeset (`cdk diff` first).

### I. SES production-access re-request  — see §4.

### J. Verify  — [AGENT + HUMAN]
- `https://app.placemate.uk` serves the app (200, strict CSP, SPA deep links, `/api/health` 401 w/o token). Redeploy the SPA if the CloudFront alias needs the fresh build (it doesn't — same distribution/bucket).
- Request a magic link on `app.placemate.uk`; the email arrives **from hello@placemate.uk** and lands in the **inbox, not junk**.
- Run **mail-tester.com** (send a magic link to their address) and/or MXToolbox — confirm **SPF pass, DKIM pass, DMARC pass**, and a high score. Fix anything flagged.

---

## 3. Corporate site + www (FUTURE — reserve now, build later)
- Apex `placemate.uk` will become a corporate/marketing site (separate build, not in scope now).
- `www.placemate.uk` → 301 → apex. Wire the apex + www serving (S3 redirect or a landing page) when the corporate site is built. The ACM cert already covers `placemate.uk` + `*.placemate.uk`, so no cert change is needed later.
- The corporate site's "Log in" CTA → `https://app.placemate.uk`.

## 4. SES production access (answering "can you complete it?")
- **You can't force it** — it was **DENIED** (case `178367384100078`). AWS denies thin new-account requests; you must strengthen and re-request.
- **[HUMAN] first:** open **AWS Support Center → case 178367384100078**, read the denial reason (CLI can't read case bodies without a support plan), and reply there — replying to the existing case is usually the fastest path.
- **Re-request (after §A–§F so the domain + DKIM + DMARC + MAIL FROM are live):** either reply to the case or `aws sesv2 put-account-details --production-access-enabled --mail-type TRANSACTIONAL --website-url https://app.placemate.uk --contact-language EN --use-case-description "<detailed>" --additional-contact-email-addresses hello@placemate.uk --profile personal --region eu-west-2`.
- **Use-case that gets approved (be concrete):** invited-cohort UK student-nurse study app; **transactional only** — one short-lived, single-use magic-link per user-initiated login; **admin-provisioned users, self-signup OFF**, no marketing; low volume (state a number, e.g. < 100/day); bounces/complaints handled via SES + Cognito, monitored via DMARC `rua`; sending domain `placemate.uk` with **SPF + DKIM + DMARC + custom MAIL FROM**; live product at `https://app.placemate.uk`.
- Turnaround typically ~24h. Until approved, sending only works to **verified** addresses (sandbox, 200/day).

---

## 5. Key files to touch
- `infra/lib/config.ts` — set `customDomain` + `allowedOrigins += https://app.placemate.uk` + `retainData: true` for the promoted env; `sesFromAddress` = hello@placemate.uk.
- `infra/lib/constructs/web.ts` — add `domainNames` + `certificate` to the Distribution (conditional on `customDomain`); Route 53 alias record.
- New: a us-east-1 ACM cert (cross-region) — likely a new small stack or `crossRegionReferences`.
- New/updated: Route 53 `HostedZone` + SES `EmailIdentity`/`MailFromDomain` + DKIM/DMARC records (a new `dns`/`email` construct, or fold into `authz`/a new construct).
- `infra/bin/app.ts` — if a us-east-1 cert stack is added, instantiate it + pass the ARN.

## 6. Gotchas already learned (save yourself the debugging)
- **CloudFront certs MUST be us-east-1** (app stack is eu-west-2 → cross-region).
- **AVP Cognito identity source prefixes ids**: principal = `<userPoolId>|<sub>`, group = `<userPoolId>|<groupName>` (not bare). The admin policy templates `__USER_POOL_ID__`. Irrelevant to domain work but don't be surprised.
- **AVP forbids changing a static policy's scope principal in place** — replace (new logical id) instead.
- `String.replace` is first-match — beware placeholders appearing twice.
- **Lint:** `npm run lint` = `eslint . --quiet` (stylish formatter crashes on this Node's `util.styleText` when printing warnings; 0 lint errors, 3 pre-existing advisory warnings).
- Gates to keep green: `npm run typecheck`, `npm test` (279), `npm run lint`, `npm run format:check`, `cd infra && npx cdk synth`.
- `cdk diff` before deploying the promotion — confirm **no replacement** of the table/pool/distribution.

## 7. Definition of done
`https://app.placemate.uk` serves the app over HTTPS (real cert, strict CSP, same-origin API); magic-link emails send **from hello@placemate.uk** and land in the **inbox not junk** with SPF+DKIM+DMARC all passing; SES production-access re-requested with the hardened setup; the env is on prod removal-policies; www→apex reserved for the future corporate site. Docs (`README.md`/`spec-architecture.md`) updated in the same commit as the code.
