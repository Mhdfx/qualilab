import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Tests cover the rules the laboratory depends on being right — reading a
 * bench value, computing money, deciding conformity, deciding who may move a
 * sample. Those are pure functions on purpose: they hold the logic that would
 * be expensive to get wrong, and they can be tested without a database.
 *
 * Screens and routes are verified through `TESTPLAN.md` in a real browser.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/prisma.ts", "src/lib/auth-server.ts", "src/lib/pdf.ts"],
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
