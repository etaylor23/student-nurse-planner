import { Passwordless } from "amazon-cognito-passwordless-auth";

/**
 * Configure the passwordless client once, at import time (spec-auth §1.3). Values are
 * public client identifiers (safe in the bundle), supplied as build-time Vite env vars.
 * Import this module for its side effect before any usePasswordless()/provider renders.
 */
Passwordless.configure({
  cognitoIdpEndpoint: import.meta.env.VITE_COGNITO_REGION,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  debug: import.meta.env.DEV ? console.debug : undefined,
});

/** RPC API base — same-origin `/api` via CloudFront (or the Vite dev proxy). */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || "/api";
