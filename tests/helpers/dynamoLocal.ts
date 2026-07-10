import type { AddressInfo } from "net";
import dynalite from "dynalite";
import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { type DynamoClientOptions, makeDocClient } from "../../src/data/dynamo/dynamoClient";

export interface DynamoLocal {
  doc: ReturnType<typeof makeDocClient>;
  tableName: string;
  stop: () => Promise<void>;
}

/**
 * Start an in-process DynamoDB (dynalite) and create the single owner-partitioned table
 * (PK/SK, on-demand) that DynamoRepository targets. No Java/Docker needed. Phase 1 uses
 * no transactions, so dynalite's coverage is sufficient (upgrade to amazon/dynamodb-local
 * via Docker when Phase 2 adds TransactWrite).
 */
export async function startDynamoLocal(): Promise<DynamoLocal> {
  const server = dynalite({ createTableMs: 0 });
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as AddressInfo).port;

  const opts: DynamoClientOptions = {
    region: "eu-west-2",
    endpoint: `http://127.0.0.1:${port}`,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  };
  const tableName = "nurse-planner-test";

  const admin = new DynamoDBClient(opts);
  await admin.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
    }),
  );

  return {
    doc: makeDocClient(opts),
    tableName,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
