import { Stack, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Certificate,
  CertificateValidation,
  type ICertificate,
} from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import type { EnvConfig } from "./config";

export interface CertificateStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * CloudFront requires its viewer ACM certificate in `us-east-1`, but the app stack lives
 * in `eu-west-2`. This dedicated us-east-1 stack owns the certificate; the eu-west-2
 * `NursePlannerStack` consumes it via CDK cross-region references (both stacks set
 * `crossRegionReferences: true`). This replaces the deprecated `DnsValidatedCertificate`.
 *
 * The cert covers the apex + a wildcard (`placemate.uk` + `*.placemate.uk`) so the app,
 * the (future) apex marketing site and `www` are all covered without a cert change later.
 * Validation is DNS, auto-recorded into the Route 53 zone (which must be delegated at the
 * registrar first, or issuance blocks in PENDING_VALIDATION).
 */
export class CertificateStack extends Stack {
  readonly certificate: ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);
    const cd = props.config.customDomain;
    if (!cd) {
      throw new Error("CertificateStack requires config.customDomain to be set");
    }

    const zone = HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: cd.hostedZoneId,
      zoneName: cd.hostedZoneName,
    });

    this.certificate = new Certificate(this, "Certificate", {
      certificateName: `nurse-planner-${props.config.name}`,
      domainName: cd.hostedZoneName,
      subjectAlternativeNames: [`*.${cd.hostedZoneName}`],
      validation: CertificateValidation.fromDns(zone),
    });
  }
}
