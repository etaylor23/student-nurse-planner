import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone, type IHostedZone } from "aws-cdk-lib/aws-route53";
import type { EnvConfig } from "./config";
import { DataStore } from "./constructs/data";
import { Captures } from "./constructs/captures";
import { Auth } from "./constructs/auth";
import { Authz } from "./constructs/authz";
import { Api } from "./constructs/api";
import { Ai } from "./constructs/ai";
import { Web } from "./constructs/web";
import { Email } from "./constructs/email";
import { Alarms } from "./constructs/alarms";

export interface NursePlannerStackProps extends StackProps {
  config: EnvConfig;
  /**
   * us-east-1 ACM cert for the CloudFront custom domain, from the sibling
   * `CertificateStack` via cross-region references. Required iff `config.customDomain`.
   */
  certificate?: ICertificate;
}

/**
 * One stack per environment. The five backend components are composed as constructs
 * (not separate CloudFormation stacks) so there are no cross-stack exports to break on
 * teardown — the whole environment deploys and tears down as one unit.
 *
 * Component boundaries follow spec-implementation-roadmap.md §4 Phase 0:
 *   DataStore (DynamoDB) · Auth (Cognito passwordless) · Authz (AVP) ·
 *   Api (HTTP API + router Lambda + reserved /feeds) · Web (S3 + CloudFront).
 */
export class NursePlannerStack extends Stack {
  constructor(scope: Construct, id: string, props: NursePlannerStackProps) {
    super(scope, id, props);
    const { config } = props;

    const data = new DataStore(this, "Data", { config });
    // Photographed note pages (spec-note-capture.md P1). No lifecycle expiry by decision
    // (P13) — the image is the end of the evidence chain, so it outlives the degree.
    const captures = new Captures(this, "Captures", { config });
    const auth = new Auth(this, "Auth", { config });
    const authz = new Authz(this, "Authz", {
      config,
      userPool: auth.userPool,
      userPoolClientId: auth.userPoolClientId,
    });
    const api = new Api(this, "Api", {
      config,
      table: data.table,
      captureBucket: captures.bucket,
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      policyStore: authz.policyStore,
    });

    // AI recall streaming endpoint (spec-ai-recall.md) — a Function URL beside the HTTP
    // API because API GW v2 can't stream; same Cognito+AVP auth, enforced in-Lambda.
    const ai = new Ai(this, "Ai", {
      config,
      table: data.table,
      captureBucket: captures.bucket,
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      policyStore: authz.policyStore,
    });

    // Custom domain: import the delegated Route 53 zone once, share it with Web (CloudFront
    // alias) and Email (SES records). The cert is a cross-region ref from CertificateStack.
    let hostedZone: IHostedZone | undefined;
    if (config.customDomain) {
      hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
        hostedZoneId: config.customDomain.hostedZoneId,
        zoneName: config.customDomain.hostedZoneName,
      });
    }

    const web = new Web(this, "Web", {
      config,
      httpApi: api.httpApi,
      certificate: props.certificate,
      hostedZone,
      // Both AI endpoints are separate origins; without these the CSP blocks them. CORS on
      // the Function URL is a DIFFERENT gate — passing one and failing the other has bitten
      // this project before.
      aiAskOrigin: ai.askOrigin,
      aiParseOrigin: ai.parseOrigin,
      // Presigned URLs use the bucket's virtual-hosted REGIONAL endpoint, so that exact
      // host is what the CSP must allow (connect-src for the PUT + cached-parse GET,
      // img-src for the review photo pane).
      captureBucketOrigin: `https://${captures.bucket.bucketRegionalDomainName}`,
    });

    if (config.customDomain && hostedZone) {
      new Email(this, "Email", { config, hostedZone });
    }

    // Operational alarms + cost budget — live env only (retainData + a custom domain, so
    // there is a real mailbox to notify). The placeholder `prod` env has neither.
    if (config.retainData && config.customDomain) {
      new Alarms(this, "Alarms", {
        config,
        routerFn: api.routerFn,
        httpApi: api.httpApi,
        table: data.table,
        aiAskFn: ai.askFn,
        notifyEmail: config.alarmEmail ?? `hello@${config.customDomain.hostedZoneName}`,
      });
    }

    // ---- Outputs the frontend build + human need (Cognito config, URLs, ids) ----
    new CfnOutput(this, "UserPoolId", { value: auth.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: auth.userPoolClientId });
    new CfnOutput(this, "PolicyStoreId", { value: authz.policyStore.attrPolicyStoreId });
    new CfnOutput(this, "TableName", { value: data.table.tableName });
    new CfnOutput(this, "ApiEndpoint", { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, "DistributionDomainName", {
      value: web.distribution.distributionDomainName,
    });
    new CfnOutput(this, "DistributionId", { value: web.distribution.distributionId });
    new CfnOutput(this, "SpaBucketName", { value: web.bucket.bucketName });
    // Consumed by scripts/delete-user.ts — GDPR erasure deletes the user's prefix here.
    new CfnOutput(this, "CaptureBucketName", { value: captures.bucket.bucketName });
    new CfnOutput(this, "Region", { value: config.region });
    if (config.customDomain) {
      new CfnOutput(this, "AppUrl", { value: `https://${config.customDomain.domainName}` });
    }
  }
}
