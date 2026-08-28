import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { assertSafeGeneratedSvg } from "../src/renderer/index.js";

describe("security boundary", () => {
  it("rejects active and external SVG content", () => {
    expect(() =>
      assertSafeGeneratedSvg("<svg><script>alert(1)</script></svg>"),
    ).toThrow();
    expect(() =>
      assertSafeGeneratedSvg('<svg><image href="https://example.com/x.png"/></svg>'),
    ).toThrow();
    expect(() =>
      assertSafeGeneratedSvg('<svg><rect onclick="alert(1)"/></svg>'),
    ).toThrow();
    expect(() => assertSafeGeneratedSvg("<svg>invalid\u0000xml</svg>")).toThrow(
      /XML 1\.0/i,
    );
  });

  it("contains no dynamic execution or network-fetch primitives", async () => {
    const files = await typescriptFiles(resolve("src"));
    const source = (
      await Promise.all(files.map((file) => readFile(file, "utf8")))
    ).join("\n");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\bnew\s+Function\s*\(/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bimport\s*\(\s*[^"']/);
  });
});

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return typescriptFiles(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
}
