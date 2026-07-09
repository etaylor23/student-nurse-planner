import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import {
  CfnIdentitySource,
  CfnPolicy,
  CfnPolicyStore,
} from "aws-cdk-lib/aws-verifiedpermissions";
import type { UserPool } from "aws-cdk-lib/aws-cognito";
import type { EnvConfig } from "../config";

export interface AuthzProps {
  config: EnvConfig;
  userPool: UserPool;
  userPoolClientId: string;
}

const CEDAR_DIR = path.join(__dirname, "..", "..", "cedar");

function readCedar(...parts: string[]): string {
  return fs.readFileSync(path.join(CEDAR_DIR, ...parts), "utf8");
}

/**
 * Amazon Verified Permissions policy store — the single authorization gate
 * (spec-backend-dynamodb.md §4).
 *
 * - Cedar schema: 3 resource tiers (SensitiveRecord / EvidenceRecord / Reference),
 *   principal NursePlanner::User, 5 coarse verbs (Read/List/Create/Update/Delete).
 * - v1 policies: owner-all + reserved reference-read (inert in v1).
 * - STRICT validation (schema + policies pre-validated locally with @cedar-policy/cedar-wasm).
 * - Cognito identity source so the router Lambda can call IsAuthorizedWithToken (Phase 1).
 */
export class Authz extends Construct {
  readonly policyStore: CfnPolicyStore;
  readonly identitySource: CfnIdentitySource;

  constructor(scope: Construct, id: string, props: AuthzProps) {
    super(scope, id);
    const { config, userPool, userPoolClientId } = props;

    this.policyStore = new CfnPolicyStore(this, "PolicyStore", {
      validationSettings: { mode: "STRICT" },
      schema: { cedarJson: readCedar("nurse-planner.cedarschema.json") },
      description: `Student Nurse Planner authorization (${config.name})`,
    });

    new CfnPolicy(this, "OwnerAllPolicy", {
      policyStoreId: this.policyStore.attrPolicyStoreId,
      definition: {
        static: {
          statement: readCedar("policies", "owner-all.cedar"),
          description: "Owner can act on their own records (v1)",
        },
      },
    });

    new CfnPolicy(this, "ReferenceReadPolicy", {
      policyStoreId: this.policyStore.attrPolicyStoreId,
      definition: {
        static: {
          statement: readCedar("policies", "reference-read.cedar"),
          description: "Any authenticated user may read reference data (reserved, inert in v1)",
        },
      },
    });

    this.identitySource = new CfnIdentitySource(this, "CognitoIdentitySource", {
      policyStoreId: this.policyStore.attrPolicyStoreId,
      principalEntityType: "NursePlanner::User",
      configuration: {
        cognitoUserPoolConfiguration: {
          userPoolArn: userPool.userPoolArn,
          clientIds: [userPoolClientId],
        },
      },
    });
  }
}
