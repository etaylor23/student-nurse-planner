import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Served at the domain root everywhere (local dev + CloudFront). VITE_BASE is
  // kept as an escape hatch for serving under a sub-path if ever needed.
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
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
