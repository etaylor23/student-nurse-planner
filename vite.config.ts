import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Build-time release marker: the deploying commit's SHA in CI (GITHUB_SHA), "dev"
// locally. Sentry.init tags every event with this so a beta bug report points at the
// exact deployed build. Injected as a global via `define` (see __APP_RELEASE__ in
// src/vite-env.d.ts).
const RELEASE = process.env.GITHUB_SHA || process.env.VITE_APP_RELEASE || "dev";

// Source-map upload runs ONLY when a Sentry auth token is present (CI secret). Without it
// (local builds, forks) the plugin is omitted and NO maps are generated — so maps are
// never served publicly. When present, maps are uploaded then deleted from dist before the
// S3 sync, and "hidden" keeps the sourceMappingURL comment out of the shipped JS.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  // Served at the domain root everywhere (local dev + CloudFront). VITE_BASE is
  // kept as an escape hatch for serving under a sub-path if ever needed.
  base: process.env.VITE_BASE || "/",
  define: {
    __APP_RELEASE__: JSON.stringify(RELEASE),
  },
  build: {
    sourcemap: sentryAuthToken ? "hidden" : false,
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            // org/project come from SENTRY_ORG / SENTRY_PROJECT env (set in CI).
            authToken: sentryAuthToken,
            release: { name: RELEASE },
            sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
            // Never fail a deploy over telemetry: log upload problems, don't throw.
            errorHandler: (err) => console.warn("[sentry-vite-plugin]", err.message),
          }),
        ]
      : []),
  ],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    // Same-origin `/api` in dev: proxy to the deployed API Gateway so the browser stays
    // on localhost:5173 (an allowed magic-link origin) with no CORS. Override the target
    // with VITE_DEV_API_TARGET. In prod, CloudFront serves `/api/*` same-origin.
    proxy: {
      "/api": {
        target:
          process.env.VITE_DEV_API_TARGET ||
          "https://q3eb0mvdhi.execute-api.eu-west-2.amazonaws.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
