import type { App } from "aws-cdk-lib";

export type EnvName = "dev" | "prod";

/**
 * Optional CloudFront custom domain. Omit to use the default `*.cloudfront.net`
 * domain (the roadmap treats a custom domain as deferrable — Phase 0 §Acceptance).
 * NOTE: an ACM certificate for CloudFront MUST live in `us-east-1`.
 */
export interface CustomDomainConfig {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
  /** ACM cert ARN in us-east-1. */
  certificateArn: string;
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
}

const ACCOUNT = "641364901830";
const REGION = "eu-west-2";

const BASE: Record<EnvName, EnvConfig> = {
  dev: {
    name: "dev",
    account: ACCOUNT,
    region: REGION,
    // Placeholder — the human verifies a real SES identity (roadmap §1). Synth/deploy
    // succeed with a placeholder; only sending requires a verified identity.
    sesFromAddress: "no-reply@studentnurseplanner.invalid",
    allowedOrigins: ["http://localhost:5173"],
    retainData: false,
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
