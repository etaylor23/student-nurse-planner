import * as path from "path";
import { Duration, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import type { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import type { CfnPolicyStore } from "aws-cdk-lib/aws-verifiedpermissions";
import type { EnvConfig } from "../config";

export interface ApiProps {
  config: EnvConfig;
  table: Table;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  policyStore: CfnPolicyStore;
}

const LAMBDA_DIR = path.join(__dirname, "..", "..", "lambda");

/**
 * RPC-over-HTTP API (spec-backend-dynamodb.md §3) + the reserved public feed route.
 *
 * - HTTP API. `/api/*` routes are guarded by a Cognito JWT authorizer → 401 without a
 *   valid token. A single router Lambda dispatches them (Phase 0: health only).
 * - A SEPARATE public `/feeds/*` route (no authorizer) is reserved for the `.ics`
 *   calendar feed (spec §4.1 surface 2).
 * - Least-privilege exec role: DynamoDB table RW + AVP IsAuthorized* only.
 */
export class Api extends Construct {
  readonly httpApi: HttpApi;
  readonly apiDomain: string;
  /** The RPC router Lambda — exposed so the Alarms construct can watch its Errors metric. */
  readonly routerFn: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);
    const { config, table, userPool, userPoolClient, policyStore } = props;

    const commonFnProps = {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      bundling: { format: OutputFormat.ESM, minify: true, sourceMap: true },
    };

    const routerFn = new NodejsFunction(this, "RouterFn", {
      ...commonFnProps,
      functionName: `nurse-planner-router-${config.name}`,
      entry: path.join(LAMBDA_DIR, "router", "index.ts"),
      // `zod` is imported transitively by the bundled app code (src/domain/schemas.generated).
      // Keep it a runtime dependency rather than bundling it, so esbuild doesn't have to
      // resolve it from the repo-root node_modules (absent when CI installs only infra/).
      // CDK installs it into the function from infra/package-lock.json.
      bundling: { ...commonFnProps.bundling, nodeModules: ["zod"] },
      environment: {
        TABLE_NAME: table.tableName,
        POLICY_STORE_ID: policyStore.attrPolicyStoreId,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // Least-privilege: the router owns user data (RW) and calls the AVP gate.
    table.grantReadWriteData(routerFn);
    routerFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "verifiedpermissions:IsAuthorized",
          "verifiedpermissions:IsAuthorizedWithToken",
          "verifiedpermissions:BatchIsAuthorized",
        ],
        resources: [policyStore.attrArn],
      }),
    );

    this.routerFn = routerFn;

    const feedsFn = new NodejsFunction(this, "FeedsFn", {
      ...commonFnProps,
      functionName: `nurse-planner-feeds-${config.name}`,
      entry: path.join(LAMBDA_DIR, "feeds", "index.ts"),
    });

    this.httpApi = new HttpApi(this, "HttpApi", {
      apiName: `nurse-planner-${config.name}`,
      description: `Student Nurse Planner RPC API (${config.name})`,
    });

    const authorizer = new HttpUserPoolAuthorizer("CognitoAuthorizer", userPool, {
      userPoolClients: [userPoolClient],
    });

    // Guarded interactive surface (Cognito JWT authorizer → 401 without a valid token).
    this.httpApi.addRoutes({
      path: "/api/health",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("RouterHealthInteg", routerFn),
      authorizer,
    });
    // The RPC surface: POST { method, args } dispatched to DynamoRepository (Phase 1).
    this.httpApi.addRoutes({
      path: "/api/rpc",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("RouterRpcInteg", routerFn),
      authorizer,
    });

    // Public, unauthenticated feed surface (reserved). No JWT authorizer.
    this.httpApi.addRoutes({
      path: "/feeds/{proxy+}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("FeedsInteg", feedsFn),
    });

    this.apiDomain = `${this.httpApi.apiId}.execute-api.${Stack.of(this).region}.amazonaws.com`;
  }
}
