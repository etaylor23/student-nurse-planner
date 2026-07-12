#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { getEnvConfig, type EnvName } from "../lib/config";
import { NursePlannerStack } from "../lib/nurse-planner-stack";
import { CertificateStack } from "../lib/certificate-stack";
import { MarketingStack } from "../lib/marketing-stack";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";

const app = new App();

const envs: EnvName[] = ["dev", "prod"];
for (const name of envs) {
  const config = getEnvConfig(app, name);

  // A custom domain needs a CloudFront ACM cert in us-east-1 (the app stack is eu-west-2).
  // A dedicated us-east-1 stack owns it; the app stack consumes it via cross-region refs.
  let certificate: ICertificate | undefined;
  if (config.customDomain) {
    const certStack = new CertificateStack(app, `NursePlanner-${name}-UsEast1`, {
      config,
      env: { account: config.account, region: "us-east-1" },
      crossRegionReferences: true,
      description: `CloudFront ACM certificate for ${config.customDomain.domainName} (us-east-1). See HANDOVER-placemate-domain.md`,
    });
    certificate = certStack.certificate;
  }

  new NursePlannerStack(app, `NursePlanner-${name}`, {
    config,
    certificate,
    env: { account: config.account, region: config.region },
    crossRegionReferences: config.customDomain ? true : undefined,
    description: `Student Nurse Planner backend (${name}) — auth + DynamoDB. See spec/spec-implementation-roadmap.md`,
  });
}

// PlaceMate marketing site (placemate.uk apex) — an isolated S3 + CloudFront stack, kept
// out of NursePlanner-dev so marketing deploys never risk the live app/data stack. Reuses
// the app's us-east-1 ACM cert by ARN (covers the apex + *.placemate.uk), so no new cert
// or cross-region machinery. See spec/spec-corporate-website.md + HANDOVER-corporate-website.md.
new MarketingStack(app, "NursePlanner-Marketing", {
  env: { account: "641364901830", region: "eu-west-2" },
  apexDomain: "placemate.uk",
  wwwDomain: "www.placemate.uk",
  hostedZoneId: "Z01422912TXS1SRHFVF2E",
  hostedZoneName: "placemate.uk",
  certificateArn:
    "arn:aws:acm:us-east-1:641364901830:certificate/433e1f50-cfd9-45e0-960b-a9e0ca3b66b6",
  description:
    "PlaceMate marketing site (placemate.uk) — S3 + CloudFront. See spec/spec-corporate-website.md",
});

app.synth();
