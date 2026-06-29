import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for Hugo.
 *
 * - `edge-runtime` is required by convex-test (it runs Convex functions in a
 *   web-standard runtime, not Node).
 * - `server.deps.inline: ["convex-test"]` lets Vitest transform the package.
 * - `globals: true` exposes describe/it/expect without imports.
 * - The `@` alias mirrors tsconfig `paths` so unit tests can import "@/lib/...".
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    globals: true,
  },
});
