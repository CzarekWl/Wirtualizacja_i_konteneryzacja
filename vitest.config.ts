import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{packages,apps}/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["{packages,apps}/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
