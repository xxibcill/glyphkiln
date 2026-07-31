import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "src/app/api/app/**/route.ts",
        "src/app/api/health/**/route.ts",
        "src/app/page.tsx",
        "src/app/api/preview/route.ts",
        "src/features/app-alpha/auth-screen.tsx",
        "src/features/app-alpha/manual-state.ts",
        "src/features/project-preview/document-builder.ts",
        "src/features/project-preview/preview-stage.tsx",
        "src/features/project-preview/project-preview.tsx",
        "src/features/project-preview/proof-ledger.tsx",
        "src/features/project-preview/response-parser.ts",
        "src/lib/project-preview/catalog.ts",
        "src/lib/project-preview/render-preview.ts",
        "src/server/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/server/**/index.ts",
        "src/server/app-workflow/contracts.ts",
        "src/server/render-worker/worker-entry.ts",
        "src/server/resources/test-support.ts",
        "src/server/resources/types.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
    },
  },
});
