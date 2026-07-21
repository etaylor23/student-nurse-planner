import type { App } from "aws-cdk-lib";

export type EnvName = "dev" | "prod";

/**
 * Optional custom domain served from Route 53 (`hostedZoneName` = the root domain / zone
 * apex, e.g. `placemate.uk`). When set, the stack:
 *   - attaches `domainName` (e.g. `app.placemate.uk`) + an ACM cert to the CloudFront
 *     distribution and creates the A/AAAA alias records, and
 *   - verifies the `hostedZoneName` domain as an SES sending identity with Easy DKIM,
 *     a custom MAIL FROM (`mail.<hostedZoneName>`), SPF and DMARC — all as records in
 *     the zone.
 * The zone is created out-of-band (its NS delegated at the registrar) and referenced by
 * id here; every record within it is managed as IaC. Omit to use the default
 * `*.cloudfront.net` domain and the address-based SES sender.
 *
 * NOTE: the CloudFront ACM certificate MUST live in `us-east-1`, so it is owned by a
 * dedicated us-east-1 `CertificateStack` and consumed here via CDK cross-region
 * references — there is no cert ARN to configure by hand. See HANDOVER-placemate-domain.md.
 */
export interface CustomDomainConfig {
  /** CloudFront alias for the SPA, e.g. `app.placemate.uk`. */
  domainName: string;
  /** Route 53 public hosted zone id for the root domain. */
  hostedZoneId: string;
  /** Root domain / zone apex, e.g. `placemate.uk`. Also the SES sending domain. */
  hostedZoneName: string;
}

export interface EnvConfig {
  name: EnvName;
  account: string;
  region: string;
  /**
   * SES-verified sender identity for magic-link emails. MUST be a verified SES
   * identity (address in sandbox, or a verified domain once production access is
   * granted) before any email sends — see spec-auth.md §1.1. Override per deploy with
   * `-c sesFromAddress=you@verified.example`.
   */
  sesFromAddress: string;
  /**
   * App origins the passwordless construct accepts for magic-link redirects (and that
   * the CSP `connect-src` must include). The deployed CloudFront domain is only known
   * after the first deploy — add it here (or via `-c allowedOrigins=`) once known, or
   * set a custom domain. localhost is included for the Vite dev server.
   */
  allowedOrigins: string[];
  /** Retain the DynamoDB table + Cognito pool on stack delete (true in prod). */
  retainData: boolean;
  customDomain?: CustomDomainConfig;
  /**
   * Where operational alarms + the cost budget email. Defaults to `hello@<domain>`, but
   * that address is an iCloud-forwarded alias; a direct mailbox is more reliable for ops
   * alerts (and AWS confirmation mail arrives without depending on a forward).
   */
  alarmEmail?: string;
}

const ACCOUNT = "641364901830";
const REGION = "eu-west-2";

const BASE: Record<EnvName, EnvConfig> = {
  // NOTE: the "dev" env has been PROMOTED IN PLACE to production (the live env behind
  // https://app.placemate.uk). The physical stack name stays `NursePlanner-dev` on
  // purpose — renaming would replace every resource (pool/users/data/CloudFront/SPA).
  // It carries prod posture: retainData + custom domain + verified SES sending domain.
  dev: {
    name: "dev",
    account: ACCOUNT,
    region: REGION,
    // The magic-link sender. The placemate.uk SES DOMAIN identity is verified
    // (Easy DKIM + custom MAIL FROM live), so we send from the branded address on the
    // verified domain (SPF+DKIM+DMARC aligned for inbox deliverability).
    sesFromAddress: "hello@placemate.uk",
    // Magic-link redirect origins: Vite dev server + the CloudFront default domain +
    // the custom domain. The CSP `connect-src` is same-origin ('self') under any of them.
    allowedOrigins: [
      "http://localhost:5173",
      "https://dufbsm93sx7h9.cloudfront.net",
      "https://app.placemate.uk",
    ],
    retainData: true,
    customDomain: {
      domainName: "app.placemate.uk",
      hostedZoneId: "Z01422912TXS1SRHFVF2E",
      hostedZoneName: "placemate.uk",
    },
    // A direct iCloud mailbox — ops alerts don't then depend on the hello@ forward.
    alarmEmail: "ellis@placemate.uk",
  },
  prod: {
    name: "prod",
    account: ACCOUNT,
    region: REGION,
    sesFromAddress: "no-reply@studentnurseplanner.invalid",
    allowedOrigins: [],
    retainData: true,
  },
};

/**
 * Resolve an env config, applying CDK-context overrides:
 *   cdk deploy NursePlanner-dev -c sesFromAddress=you@verified.example \
 *     -c allowedOrigins=https://d123.cloudfront.net,http://localhost:5173
 */
export function getEnvConfig(app: App, name: EnvName): EnvConfig {
  const base = BASE[name];
  const sesFromAddress = (app.node.tryGetContext("sesFromAddress") as string) ?? base.sesFromAddress;
  const originsCtx = app.node.tryGetContext("allowedOrigins") as string | undefined;
  const allowedOrigins = originsCtx
    ? originsCtx.split(",").map((s) => s.trim()).filter(Boolean)
    : base.allowedOrigins;
  return { ...base, sesFromAddress, allowedOrigins };
}
