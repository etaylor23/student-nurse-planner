import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AccountRecovery,
  type UserPool,
  type UserPoolClient,
} from "aws-cdk-lib/aws-cognito";
import { Passwordless } from "amazon-cognito-passwordless-auth/cdk";
import type { EnvConfig } from "../config";

export interface AuthProps {
  config: EnvConfig;
}

/**
 * Cognito user pool + passwordless magic-link sign-in (spec-auth.md §1).
 *
 * Uses the official aws-samples `amazon-cognito-passwordless-auth` construct, which
 * provisions the custom-auth Lambda trio (Define/Create/Verify challenge), a short-TTL
 * single-use secrets table, a KMS signing key, and SES email. We supply pool prop
 * overrides to lock down the pool:
 *   - self-signup OFF (admin-provisioned users only — spec-auth.md §1.2)
 *   - email sign-in alias
 *
 * NOTE: in this construct version the auto-created user-pool client lives inside the
 * FIDO2 setup block, so a magic-link-only config never gets one. We therefore create
 * the SPA client ourselves. It uses the custom-auth flow (ALLOW_CUSTOM_AUTH) that the
 * passwordless triggers implement, and the 1h access/id + 30d rotating refresh tokens
 * from spec-auth.md §1.3.
 */
export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly userPoolClientId: string;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);
    const { config } = props;

    const passwordless = new Passwordless(this, "Passwordless", {
      userPoolProps: {
        userPoolName: `nurse-planner-${config.name}`,
        selfSignUpEnabled: false,
        signInAliases: { email: true },
        standardAttributes: { email: { required: true, mutable: true } },
        // Passwordless: there is no password, so no password-recovery path.
        accountRecovery: AccountRecovery.NONE,
        removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      },
      allowedOrigins: config.allowedOrigins,
      magicLink: {
        sesFromAddress: config.sesFromAddress,
        sesRegion: config.region,
      },
      logLevel: "INFO",
    });

    this.userPool = passwordless.userPool;

    this.userPoolClient = this.userPool.addClient("AppClient", {
      userPoolClientName: `nurse-planner-web-${config.name}`,
      generateSecret: false,
      authFlows: { custom: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });
    this.userPoolClientId = this.userPoolClient.userPoolClientId;
  }
}
