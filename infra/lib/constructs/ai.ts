import * as path from "path";
import { CfnOutput, Duration, Fn, Stack } from "aws-cdk-lib";
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
import type { Bucket } from "aws-cdk-lib/aws-s3";
import type { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import type { CfnPolicyStore } from "aws-cdk-lib/aws-verifiedpermissions";
import type { EnvConfig } from "../config";

export interface AiProps {
  config: EnvConfig;
  table: Table;
  /** Note-capture photo bucket — parseFn reads the uploaded page from it (P1). */
  captureBucket: Bucket;
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
  /** Scheme+host of the Function URL — the SPA's CSP `connect-src` must include it. */
  readonly askOrigin: string;
  readonly parseFn: NodejsFunction;
  readonly parseUrl: FunctionUrl;
  /** Scheme+host of the parse Function URL — the SPA's CSP `connect-src` must include it. */
  readonly parseOrigin: string;

  constructor(scope: Construct, id: string, props: AiProps) {
    super(scope, id);
    const { config, table, userPool, userPoolClient, policyStore, captureBucket } = props;
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
    // The mantle endpoint authorizes under its own namespace (observed live:
    // "not authorized to perform: bedrock-mantle:CreateInference on
    // arn:aws:bedrock-mantle:<region>:<acct>:project/default").
    this.askFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock-mantle:CreateInference"],
        resources: [`arn:aws:bedrock-mantle:${stack.region}:${stack.account}:project/*`],
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

    // `url` is a token like https://<id>.lambda-url.<region>.on.aws/ — CSP wants the
    // origin without the trailing slash. Fn::Select on "/" would be unreadable, so slice
    // the resolved string at deploy time via a CFN-safe substring of the known shape.
    this.askOrigin = Fn.select(0, Fn.split("/", Fn.select(1, Fn.split("//", this.askUrl.url))));
    this.askOrigin = `https://${this.askOrigin}`;

    new CfnOutput(stack, "AiAskUrl", { value: this.askUrl.url });

    // ---- Note-capture parse endpoint (spec-note-capture.md P12) ----
    // A sibling Function URL rather than a router RPC: four model calls take ~30s, which sits
    // badly on an API Gateway path built for fast CRUD (and past its 29s ceiling). Same auth
    // as askFn — Cognito ID token verified in-Lambda + the AVP gate. NOT streaming: a parse
    // is a batch whose results are only useful assembled.
    this.parseFn = new NodejsFunction(this, "ParseFn", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      functionName: `nurse-planner-ai-parse-${config.name}`,
      entry: path.join(LAMBDA_DIR, "parse", "index.ts"),
      timeout: Duration.seconds(120),
      // Higher than askFn's 512: a 700KB photo becomes a ~950KB base64 string held while
      // both vision calls run, and the 219-statement taxonomy is another ~31KB per call.
      memorySize: 1024,
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*"],
        nodeModules: ["zod"],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        POLICY_STORE_ID: policyStore.attrPolicyStoreId,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        CAPTURE_BUCKET: captureBucket.bucketName,
        // Four stages, four independently tunable models (P21/P39). All UNMEASURED as
        // starting defaults — Gate 0 bakes them off over >=4 runs each before launch.
        AI_VISION_MODEL_ID: "qwen.qwen3-vl-235b-a22b-instruct",
        AI_VISION_CHECK_MODEL_ID: "google.gemma-3-27b-it",
        AI_SANITISE_MODEL_ID: "deepseek.v3.2",
        AI_CLASSIFY_MODEL_ID: "zai.glm-5",
      },
    });

    // Deliberately NO table grant (P32): the student's context arrives in the request body,
    // because the client already holds it locally. Read-only on their own photo prefix.
    captureBucket.grantRead(this.parseFn);
    this.parseFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["verifiedpermissions:IsAuthorized", "verifiedpermissions:IsAuthorizedWithToken"],
        resources: [policyStore.attrArn],
      }),
    );
    this.parseFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/*",
          `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/*`,
        ],
      }),
    );
    this.parseFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock-mantle:CreateInference"],
        resources: [`arn:aws:bedrock-mantle:${stack.region}:${stack.account}:project/*`],
      }),
    );

    this.parseUrl = this.parseFn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // auth = in-Lambda JWT verify + AVP, as askFn
      cors: {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: [HttpMethod.POST],
        allowedHeaders: ["authorization", "content-type"],
        maxAge: Duration.hours(1),
      },
    });
    this.parseOrigin = `https://${Fn.select(0, Fn.split("/", Fn.select(1, Fn.split("//", this.parseUrl.url))))}`;

    new CfnOutput(stack, "AiParseUrl", { value: this.parseUrl.url });
  }
}
