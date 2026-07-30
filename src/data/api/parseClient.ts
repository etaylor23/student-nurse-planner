/**
 * Client for the note-capture parse endpoint (spec-note-capture.md P12).
 *
 * Goes to a Lambda Function URL rather than `/api/rpc`: four model calls take ~70s measured,
 * far past API Gateway's 29s ceiling. Same Cognito ID token, verified in-Lambda.
 *
 * One request, one response. P40 specifies a staged response (text first, classification
 * after) and that remains the right shape for the ~70s wait — it is deliberately not built
 * yet, so the review screen can exist and be judged before the response shape is optimised.
 */

export interface ParsedBlockView {
  fromRegions: number[];
  text: string;
  kind: string;
  groupKey?: string;
  targetType?: string;
  candidateCodes: string[];
  tags: string[];
  medicationCandidate?: string;
  gibbs?: Record<string, string>;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  rotationDeg: number;
  /** Self-reported. Stored for observability, gates nothing (P22). */
  confidence: number;
  /** `structureReading|checkReading` pairs the two vision models disagreed on (P22). */
  disputedWords: string[];
}

export interface ParseResponse {
  captureId: string;
  imageIndex: number;
  /** Exactly as written on the page — the app resolves the year (P8). */
  pageDateRaw: string | null;
  wardHint: string | null;
  blocks: ParsedBlockView[];
  /** `from|to` pairs the sanitiser applied (P24). */
  corrections: string[];
  diagnostics?: Record<string, unknown>;
}

export class ParseError extends Error {
  constructor(
    readonly code: "unauthorised" | "not_found" | "throttled" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export interface ParseClientOptions {
  parseUrl: string;
  getIdToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

/** What the client tells the server about the student, so parseFn needs no table access (P32). */
export interface ParseContext {
  medicationNames?: string[];
  tagLabels?: string[];
  placementName?: string;
  placementSetting?: string;
}

export class ParseClient {
  private readonly parseUrl: string;
  private readonly getIdToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ParseClientOptions) {
    this.parseUrl = opts.parseUrl.replace(/\/$/, "");
    this.getIdToken = opts.getIdToken;
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
  }

  async parse(input: {
    captureId: string;
    imageKey: string;
    imageIndex: number;
    context?: ParseContext;
    signal?: AbortSignal;
  }): Promise<ParseResponse> {
    const token = await this.getIdToken();
    const res = await this.fetchImpl(this.parseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        captureId: input.captureId,
        imageKey: input.imageKey,
        imageIndex: input.imageIndex,
        context: input.context ?? {},
      }),
      signal: input.signal,
    });
    const body = (await res.json().catch(() => ({}))) as ParseResponse & {
      error?: string;
      detail?: string;
    };
    if (!res.ok) {
      const code =
        res.status === 401
          ? "unauthorised"
          : res.status === 404
            ? "not_found"
            : res.status === 429
              ? "throttled"
              : "failed";
      throw new ParseError(code, body.detail || body.error || `parse failed (${res.status})`);
    }
    return body;
  }
}
