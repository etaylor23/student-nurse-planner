import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { EnvConfig } from "./config";
import { DataStore } from "./constructs/data";
import { Auth } from "./constructs/auth";
import { Authz } from "./constructs/authz";
import { Api } from "./constructs/api";
import { Web } from "./constructs/web";

export interface NursePlannerStackProps extends StackProps {
  config: EnvConfig;
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
    const auth = new Auth(this, "Auth", { config });
    const authz = new Authz(this, "Authz", {
      config,
      userPool: auth.userPool,
      userPoolClientId: auth.userPoolClientId,
    });
    const api = new Api(this, "Api", {
      config,
      table: data.table,
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
      policyStore: authz.policyStore,
    });
    const web = new Web(this, "Web", { config, httpApi: api.httpApi });

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
    new CfnOutput(this, "Region", { value: config.region });
  }
}
