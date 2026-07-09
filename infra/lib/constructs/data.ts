import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import type { EnvConfig } from "../config";

export interface DataStoreProps {
  config: EnvConfig;
}

/**
 * The single owner-partitioned table (spec-backend-dynamodb.md §2):
 *   PK = USER#<sub>, SK = <TYPE>#<id>
 * On-demand billing, PITR on, TTL on `ttl` (tombstone reap), AWS-managed KMS at rest.
 * Zero GSIs on the online path.
 */
export class DataStore extends Construct {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: DataStoreProps) {
    super(scope, id);
    const { config } = props;

    this.table = new Table(this, "Table", {
      tableName: `nurse-planner-${config.name}`,
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: "ttl",
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      deletionProtection: config.retainData,
    });
  }
}
