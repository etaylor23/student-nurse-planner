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
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
