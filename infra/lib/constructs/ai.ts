import * as path from "path";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  FunctionUrl,
  FunctionUrlAuthType,
  HttpMethod,
  InvokeMode,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import type { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import type { CfnPolicyStore } from "aws-cdk-lib/aws-verifiedpermissions";
import type { EnvConfig } from "../config";

export interface AiProps {
  config: EnvConfig;
  table: Table;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  policyStore: CfnPolicyStore;
}

const LAMBDA_DIR = path.join(__dirname, "..", "..", "lambda");

/** SSM kill switch (D11) — created in Phase 0; flip to "false" to disable without redeploy. */
const KILL_SWITCH_PARAM = "/nurse-planner/ai/enabled";

/**
 * AI recall streaming endpoint (spec-ai-recall.md D6a/D7): a response-streaming Lambda
 * behind a Function URL — the HTTP API can't stream, so this is a second, parallel
 * enforcement point of the SAME auth (Cognito ID token verified in-Lambda + the AVP
 * gate), not a second auth system. CORS is locked to the app origins.
 *
 * Model calls go to the Bedrock mantle endpoint with the function role's SigV4 creds:
 * `AI_PROVIDER=openai-compat` + an open-weight interim model until the account's
 * Anthropic agreement unblocks, then `anthropic` + Sonnet 5 (config-only swap).
 */
export class Ai extends Construct {
  readonly askFn: NodejsFunction;
  readonly askUrl: FunctionUrl;

  constructor(scope: Construct, id: string, props: AiProps) {
    super(scope, id);
    const { config, table, userPool, userPoolClient, policyStore } = props;
    const stack = Stack.of(this);

    this.askFn = new NodejsFunction(this, "AskFn", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      functionName: `nurse-planner-ai-ask-${config.name}`,
      entry: path.join(LAMBDA_DIR, "ai", "index.ts"),
      timeout: Duration.seconds(60),
      memorySize: 512,
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        // Runtime-provided AWS SDK stays external; aws-jwt-verify + @smithy signer +
        // sha256 bundle from infra/node_modules. zod matches the router's approach.
        externalModules: ["@aws-sdk/*"],
        nodeModules: ["zod"],
        // The inlined CJS deps call require("buffer") etc.; ESM output has no require —
        // shim it (standard esbuild ESM-on-Lambda fix).
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        TABLE_NAME: table.tableName,
        POLICY_STORE_ID: policyStore.attrPolicyStoreId,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        AI_KILL_SWITCH_PARAM: KILL_SWITCH_PARAM,
        AI_PROVIDER: config.ai.provider,
        AI_MODEL_ID: config.ai.modelId,
      },
    });

    // Least privilege: corpus reads + audit-log writes on the table, the AVP gate,
    // the kill switch, and Bedrock invocation (foundation models + this account's
    // inference profiles — the mantle endpoint authorizes InvokeModel* via SigV4).
    table.grantReadWriteData(this.askFn);
    this.askFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["verifiedpermissions:IsAuthorized", "verifiedpermissions:IsAuthorizedWithToken"],
        resources: [policyStore.attrArn],
      }),
    );
    this.askFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${stack.region}:${stack.account}:parameter${KILL_SWITCH_PARAM}`,
        ],
      }),
    );
    this.askFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/*",
          `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/*`,
        ],
      }),
    );

    this.askUrl = this.askFn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // auth = in-Lambda JWT verify + AVP (D7)
      invokeMode: InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: [HttpMethod.POST],
        allowedHeaders: ["authorization", "content-type"],
        maxAge: Duration.hours(1),
      },
    });

    new CfnOutput(stack, "AiAskUrl", { value: this.askUrl.url });
  }
}
