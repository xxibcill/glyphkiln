import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sha256 } from "../src/cache/canonical.js";
import { LEGACY_RENDERER_VERSION, RENDERER_VERSION } from "../src/domain/types.js";
import {
  HARFBUZZ_SHAPER_IDENTITY,
  HARFBUZZ_VERSION,
  HARFBUZZJS_VERSION,
  loadHarfBuzzShaper,
} from "../src/fonts/harfbuzz.js";
import { TYPOGRAPHY_POLICY } from "../src/typography/policy.js";
import { M1_TYPOGRAPHY_POLICY } from "../src/typography/typesetter.js";

/**
 * Typography M2 shaper identity (plan §5 M2 and §7, ADR 0019 decision 1):
 * the M1 policy and every manifest rendered under it record
 * `harfbuzzjs@1.6.4/harfbuzz@15.0.0` and the wasm SHA-256, and no legacy
 * policy or manifest records a shaper at all.
 */

const EXPECTED_IDENTITY = {
  id: "harfbuzzjs@1.6.4/harfbuzz@15.0.0",
  wasmSha256: "6eeed8e1bc9ad7773038e48ff8f9e07e0ad228572c594b45e5357e9c2f7a0b2e",
};

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));
const SKIPPED = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".turbo",
]);

type Manifest = {
  manifestVersion: string;
  renderer: { version: string };
  template?: { id: string; version: string };
  typographyPolicy?: { m1?: { shaper?: unknown } };
};

/** Every committed JSON file that is a render manifest, by repository path. */
function committedManifests(): Map<string, { manifest: Manifest; text: string }> {
  const found = new Map<string, { manifest: Manifest; text: string }>();
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      if (SKIPPED.has(name)) continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!name.endsWith(".json")) continue;
      const text = readFileSync(path, "utf8");
      if (!text.includes('"manifestVersion"')) continue;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        continue;
      }
      if (
        typeof value === "object" &&
        value !== null &&
        "manifestVersion" in value &&
        "renderer" in value
      ) {
        found.set(relative(REPOSITORY, path), { manifest: value as Manifest, text });
      }
    }
  };
  walk(REPOSITORY);
  return found;
}

function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(
    ([name, child]) => name === key || hasKey(child, key),
  );
}

describe("M2 shaper identity", () => {
  it("pins the M1 policy to the installed harfbuzzjs build", async () => {
    expect(HARFBUZZ_SHAPER_IDENTITY).toEqual(EXPECTED_IDENTITY);
    expect(M1_TYPOGRAPHY_POLICY.shaper).toEqual(EXPECTED_IDENTITY);
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("harfbuzzjs/dist/harfbuzz.wasm");
    const wasm = readFileSync(wasmPath);
    expect(sha256(wasm)).toBe(EXPECTED_IDENTITY.wasmSha256);
    const manifest = JSON.parse(
      readFileSync(join(dirname(dirname(wasmPath)), "package.json"), "utf8"),
    ) as { version: string };
    expect(manifest.version).toBe(HARFBUZZJS_VERSION);
    const hb = await import("harfbuzzjs");
    expect(hb.versionString()).toBe(HARFBUZZ_VERSION);
    expect((await loadHarfBuzzShaper()).id).toBe(EXPECTED_IDENTITY.id);
  });

  it("keeps the legacy policy free of any shaper identity", () => {
    expect(hasKey(TYPOGRAPHY_POLICY, "shaper")).toBe(false);
    expect(JSON.stringify(TYPOGRAPHY_POLICY)).not.toMatch(/harfbuzz|fontkit/i);
  });

  it("records the identity in every committed M1 manifest and none in any other", () => {
    const manifests = committedManifests();
    const m1: string[] = [];
    const templates = new Set<string>();
    let legacy = 0;
    for (const [path, { manifest, text }] of manifests) {
      if (manifest.renderer.version === RENDERER_VERSION) {
        m1.push(path);
        expect(manifest.typographyPolicy?.m1?.shaper, path).toEqual(EXPECTED_IDENTITY);
        // Exactly one shaper record, in the M1 policy.
        expect(text.match(/"shaper"/g), path).toHaveLength(1);
        if (manifest.template !== undefined) {
          templates.add(`${manifest.template.id}@${manifest.template.version}`);
        }
      } else {
        legacy += 1;
        expect(hasKey(manifest, "shaper"), path).toBe(false);
        expect(text, path).not.toMatch(/harfbuzz/i);
      }
    }
    // The M1 visual baselines: 18 Scene 1.1.0 and 9 template renders.
    expect(m1.every((path) => path.includes("tests/visual/m1/"))).toBe(true);
    expect(m1).toHaveLength(27);
    expect([...templates].sort()).toEqual([
      "image-led-campaign@1.3.0",
      "quote-card@1.4.0",
      "statistic-card@1.4.0",
    ]);
    // Legacy baselines, examples, fixtures, deliverables and qualification
    // outputs, at renderer 0.5.0 and older.
    expect(legacy).toBeGreaterThan(200);
    const legacyAtCurrentLegacyRenderer = [...manifests.values()].filter(
      ({ manifest }) => manifest.renderer.version === LEGACY_RENDERER_VERSION,
    ).length;
    expect(legacyAtCurrentLegacyRenderer).toBeGreaterThan(50);
  });
});
