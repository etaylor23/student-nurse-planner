#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { getEnvConfig, type EnvName } from "../lib/config";
import { NursePlannerStack } from "../lib/nurse-planner-stack";
import { CertificateStack } from "../lib/certificate-stack";
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

app.synth();
