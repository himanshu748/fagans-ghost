import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    // The default is 5000 ms. The fast-check properties (150 fc.commands runs on a
    // temp store, 300 report round-trips) take 4 to 6 s when files run in parallel.
    testTimeout: 60_000,
  },
});
