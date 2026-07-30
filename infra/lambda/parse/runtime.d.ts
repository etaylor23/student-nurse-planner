/**
 * Minimal ambient types for the Lambda response-streaming runtime (the `awslambda`
 * global) and the slice of the Function URL event we read. Kept local so this package
 * typechecks without @types/aws-lambda (the Function URL payload is v2-shaped).
 */
import type { Writable } from "node:stream";

declare global {
  namespace awslambda {
    function streamifyResponse(
      handler: (
        event: FunctionUrlEvent,
        responseStream: ResponseStream,
        context: unknown,
      ) => Promise<void>,
    ): unknown;
    namespace HttpResponseStream {
      function from(
        stream: ResponseStream,
        metadata: { statusCode: number; headers?: Record<string, string> },
      ): ResponseStream;
    }
  }

  interface ResponseStream extends Writable {
    setContentType(type: string): void;
  }

  interface FunctionUrlEvent {
    rawPath?: string;
    body?: string;
    isBase64Encoded?: boolean;
    headers?: Record<string, string | undefined>;
    requestContext?: { http?: { method?: string } };
  }
}

export {};
