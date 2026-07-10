import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export interface DynamoClientOptions {
  region?: string;
  /** Override for DynamoDB Local / dynalite in tests. */
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/**
 * A DynamoDB DocumentClient. In the Lambda this uses the default provider chain +
 * region; tests point `endpoint` at an in-process DynamoDB (dynalite) with dummy creds.
 * `removeUndefinedValues` lets us store domain objects with optional fields directly.
 */
export function makeDocClient(opts: DynamoClientOptions = {}): DynamoDBDocumentClient {
  const base = new DynamoDBClient({
    region: opts.region ?? process.env.AWS_REGION ?? "eu-west-2",
    ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
    ...(opts.credentials ? { credentials: opts.credentials } : {}),
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  });
}
