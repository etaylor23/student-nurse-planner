/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** AWS region of the Cognito pool, e.g. "eu-west-2". */
  readonly VITE_COGNITO_REGION: string;
  /** Cognito user pool id, e.g. "eu-west-2_XXXX". */
  readonly VITE_COGNITO_USER_POOL_ID: string;
  /** Cognito app client id (public; no secret). */
  readonly VITE_COGNITO_CLIENT_ID: string;
  /** RPC API base; defaults to "/api" (same-origin). */
  readonly VITE_API_BASE?: string;
  /**
   * Absolute URL of the AI recall ask endpoint (a Lambda Function URL — API Gateway
   * can't stream). Supplied by CI from the stack's `AiAskUrl` output. Absent/empty =>
   * the AI feature stays in its coming-soon state for this build.
   */
  readonly VITE_AI_ASK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build-time release marker (deploying commit SHA in CI, "dev" locally). See vite.config.ts. */
declare const __APP_RELEASE__: string;
