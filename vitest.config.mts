import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/unit/global-setup.ts"],
    env: { TZ: "America/Chicago", DATABASE_URL: "file:./test.db", GROQ_MOCK: "1", SESSION_SECRET: "test-secret" },
    fileParallelism: false, // the DB-backed suites share one SQLite file
    testTimeout: 20_000,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
