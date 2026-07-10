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
 *   principal NursePlanner::User, coarse verbs (Read/List/Create/Update/Delete/Share).
 * - v1 policies: owner-all + reserved reference-read (inert in v1).
 * - Phase 4 policies (additive, cross-user): mentor-read (EvidenceRecord only),
 *   share-read (per-item, the only SensitiveRecord path), admin-breakglass (Cognito group).
 * - STRICT validation (schema + policies pre-validated locally with @cedar-policy/cedar-wasm).
 * - Cognito identity source so the router Lambda can call IsAuthorizedWithToken (Phase 1),
 *   with groupConfiguration mapping the token's `cognito:groups` claim to
 *   NursePlanner::Group parents so `principal in Group::"admins"` resolves at runtime
 *   (Phase 4 admin break-glass — spec-backend-dynamodb.md §4.5).
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

    // ---- Phase 4: cross-user grants (additive) ----
    new CfnPolicy(this, "MentorReadPolicy", {
      policyStoreId: this.policyStore.attrPolicyStoreId,
      definition: {
        static: {
          statement: readCedar("policies", "mentor-read.cedar"),
          description: "A mentor may Read/List a student's EvidenceRecord (never Sensitive)",
        },
      },
    });

    new CfnPolicy(this, "ShareReadPolicy", {
      policyStoreId: this.policyStore.attrPolicyStoreId,
      definition: {
        static: {
          statement: readCedar("policies", "share-read.cedar"),
          description: "A per-item share lets a grantee Read one record (only SensitiveRecord path)",
        },
      },
    });

    // Logical id is "…Group" (not the original "AdminBreakglassPolicy"): AVP forbids
    // changing the principal in an existing static policy's scope in place, so correcting
    // the group id requires REPLACING the policy — a new logical id makes CloudFormation
    // delete the old one and create this corrected one.
    new CfnPolicy(this, "AdminBreakglassPolicyGroup", {
      policyStoreId: this.policyStore.attrPolicyStoreId,
      definition: {
        static: {
          // AVP names the Cognito group entity `<userPoolId>|<groupName>`, so substitute the
          // pool id into the policy's placeholder (verified live).
          statement: readCedar("policies", "admin-breakglass.cedar").replace(
            "__USER_POOL_ID__",
            userPool.userPoolId,
          ),
          description: "Members of the `admins` Cognito group may act on any record (audited)",
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
          // Map the token's `cognito:groups` claim to Cedar NursePlanner::Group parents so
          // `principal in NursePlanner::Group::"admins"` resolves for admin break-glass
          // (spec §4.5). For a Cognito identity source the source claim is always
          // `cognito:groups`; only the target entity type is configurable.
          groupConfiguration: {
            groupEntityType: "NursePlanner::Group",
          },
        },
      },
    });
  }
}
