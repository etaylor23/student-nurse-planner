import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";

/**
 * Interactive RPC router Lambda (spec-backend-dynamodb.md §3).
 *
 * PHASE 0: skeleton. Only the health route is wired. The API Gateway Cognito JWT
 * authorizer guards every /api/* route, so an unauthenticated request never reaches
 * this handler (→ 401). A request that arrives here has a verified token.
 *
 * PHASE 1 will dispatch `{ method, args }` from POST /api/rpc to DynamoRepository,
 * deriving userId from the verified `sub` (never trusting the client) and routing every
 * op through the AVP authorize() gate. The table name, policy-store id and pool ids are
 * already provided as env vars, and the execution role already has table + AVP access.
 */
function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const routePath = event.requestContext.http.path;

  if (method === "GET" && routePath.endsWith("/health")) {
    return json(200, {
      status: "ok",
      service: "nurse-planner-api",
      // Presence of a verified principal proves the JWT authorizer ran.
      sub: event.requestContext.authorizer?.jwt?.claims?.sub ?? null,
      time: new Date().toISOString(),
    });
  }

  return json(404, { error: "not_found", method, path: routePath });
};
