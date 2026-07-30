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
        "src/app/page.tsx",
        "src/app/api/preview/route.ts",
        "src/features/project-preview/document-builder.ts",
        "src/features/project-preview/preview-stage.tsx",
        "src/features/project-preview/project-preview.tsx",
        "src/features/project-preview/proof-ledger.tsx",
        "src/features/project-preview/response-parser.ts",
        "src/lib/project-preview/catalog.ts",
        "src/lib/project-preview/render-preview.ts",
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
