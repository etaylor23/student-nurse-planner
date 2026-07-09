import type { APIGatewayProxyResultV2 } from "aws-lambda";

/**
 * Public calendar-feed Lambda (spec-calendar-feed.md) — the second, non-JWT surface.
 *
 * PHASE 0: reserved skeleton. This route is served by a SEPARATE public CloudFront
 * behaviour and API Gateway route with NO Cognito authorizer — calendar clients can't
 * send a JWT, so an unguessable capability token in the URL is the credential. It is
 * read-only, rate-limited, and carries no patient-identifiable data.
 *
 * Wired now (returns 501) so the public routing seam exists and no JWT-only corner is
 * baked in. The `.ics` implementation + token model land in a later phase.
 */
export const handler = async (): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 501,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    error: "not_implemented",
    detail: "calendar feed reserved — see spec/spec-calendar-feed.md",
  }),
});
