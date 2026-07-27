/**
 * Compile-time only: teach TypeScript about the jest-dom matchers
 * (`toBeInTheDocument`, `toBeDisabled`, …). They are registered at RUNTIME in
 * `setupDom.ts`, and only for the jsdom suites, so the node-environment tests are
 * unaffected either way.
 */
import "@testing-library/jest-dom/vitest";
