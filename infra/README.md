# infra — Student Nurse Planner backend (AWS CDK)

The CDK (TypeScript) app for the auth + DynamoDB backend. Implements **Phase 0** of
[`../spec/spec-implementation-roadmap.md`](../spec/spec-implementation-roadmap.md). One
CloudFormation stack per environment (`NursePlanner-dev`, `NursePlanner-prod`), composed
of five constructs:

| Construct (`lib/constructs/`) | Resources |
|---|---|
| `DataStore` | Single DynamoDB table `nurse-planner-<env>` — `PK`/`SK`, on-demand, PITR on, TTL on `ttl`, AWS-managed KMS, **zero GSIs**. |
| `Auth` | Cognito user pool + passwordless **magic link** (`amazon-cognito-passwordless-auth`), self-signup **off**, SPA client (1h access/id, 30d refresh). |
| `Authz` | Amazon Verified Permissions policy store (**STRICT**), Cedar schema (3 tiers × 5 verbs), owner-all + reserved reference-read policies, Cognito identity source. |
| `Api` | HTTP API — `GET /api/health` behind a **Cognito JWT authorizer**, reserved **public** `/feeds/{proxy+}` (no authorizer), least-priv router Lambda (table RW + AVP). |
| `Web` | Private S3 bucket (OAC) + CloudFront — SPA default behaviour with a **strict CSP**, same-origin `/api/*` and public `/feeds/*` behaviours. |

`cedar/` holds the Cedar schema + policy files (loaded into the AVP store at synth). They
are pre-validated with `@cedar-policy/cedar-wasm` under STRICT mode.

## Conventions

- **All AWS commands use `--profile personal`** (account `641364901830`, region
  `eu-west-2`). The npm scripts bake this in; CI uses the OIDC role instead.
- Custom domain is **omitted** by default — the app runs on the CloudFront default
  `*.cloudfront.net` domain until cutover. Set `config.customDomain` (needs an ACM cert
  in `us-east-1`) to enable one.

## Commands

```bash
cd infra
npm ci
npm run cdk:synth              # synth both stacks (no AWS creds needed)
npm run cdk:diff:dev
npm run cdk:deploy:dev         # cdk deploy NursePlanner-dev --profile personal
```

Override the (placeholder) SES sender identity at deploy time once one is verified:

```bash
npx cdk deploy NursePlanner-dev --profile personal \
  -c sesFromAddress=you@verified.example \
  -c allowedOrigins=https://<dist>.cloudfront.net,http://localhost:5173
```

## Human prerequisites (before the first deploy — Phase 0 GATE)

1. **`cdk bootstrap --profile personal`** — one-time, account-privileged. Creates the
   toolkit stack the GitHub OIDC role assumes. Run `npm run bootstrap`.
2. **SES**: verify a sender identity and (for external users) request production access —
   longest lead time; magic-link emails only reach verified addresses until then.
3. **Deploy-role IAM**: the GitHub OIDC role's inline policy is in
   [`../perms.json`](../perms.json). Phase 0 extends it (beyond assuming CDK roles) with
   `cloudformation:DescribeStacks` + S3 + `cloudfront:CreateInvalidation` so the frontend
   workflow can publish the SPA. Re-apply it with
   `aws iam put-role-policy --role-name github-actions-deploy --policy-name deploy --policy-document file://perms.json --profile personal`.

## CI/CD (`.github/workflows/`)

- `ci.yml` — typecheck, ts-to-zod drift check, tests, and `cdk synth` (no creds).
- `deploy-backend.yml` — `workflow_dispatch`; OIDC → `cdk deploy` per environment.
- `deploy-frontend.yml` — `workflow_dispatch`; build SPA → S3 sync → CloudFront invalidate.
- `aws-oidc-check.yml` — standalone OIDC connectivity smoke test.

## Acceptance (Phase 0)

Stacks deploy clean to dev; `/api/health` returns **200 with a valid token, 401 without**;
`cdk synth` is reproducible in CI.
