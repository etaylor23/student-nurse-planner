import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Served at "/" locally; the GitHub Pages deploy sets VITE_BASE to the repo
  // sub-path (e.g. "/student-nurse-planner/") so asset URLs resolve there.
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
