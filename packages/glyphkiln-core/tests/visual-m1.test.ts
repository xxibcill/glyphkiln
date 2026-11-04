import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import prettier from "prettier";
import { describe, expect, it } from "vitest";

import { renderGraphic, sha256, type DesignDocument } from "../src/index.js";
import { renderScene, type SceneDocument } from "../src/scene/index.js";
import { loadExampleAssets } from "./helpers.js";
import {
  FAMILY_SPECIMENS,
  PAIRINGS,
  briefA,
  familySpecimen,
  kilnformQuote,
} from "./visual/m1/specimens.js";

/**
 * Exact PNG baselines for the typography M1 policies (renderer 0.6.0).
 * Candidates are written with GLYPHKILN_UPDATE_VISUALS=1. They still need
 * the owner's review: see docs/research/typography-m1-baselines/.
 */
const TIMESTAMP = "2026-11-04T00:00:00.000Z";
const DIRECTORY = "tests/visual/m1";

type Case =
  | { name: string; kind: "scene"; document: () => SceneDocument; noFindings: boolean }
  | {
      name: string;
      kind: "design";
      document: () => Promise<DesignDocument>;
      noFindings: boolean;
    };

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function upgradedBaseline(name: string, version: "1.3.0" | "1.4.0") {
  const document = JSON.parse(
    await readFile(resolve(`tests/visual/baselines/${name}.design.json`), "utf8"),
  ) as DesignDocument;
  return {
    ...document,
    schemaVersion: "1.8.0",
    template: { ...document.template, version },
  } as DesignDocument;
}

export const M1_VISUAL_CASES: readonly Case[] = [
  ...FAMILY_SPECIMENS.map((family): Case => ({
    name: `specimen-${slug(family.family)}`,
    kind: "scene",
    document: () => familySpecimen(family),
    noFindings: true,
  })),
  ...PAIRINGS.map((pairing): Case => ({
    name: `brief-a-${pairing.id}`,
    kind: "scene",
    document: () => briefA(pairing),
    noFindings: true,
  })),
  ...PAIRINGS.map((pairing): Case => ({
    name: `kilnform-quote-${pairing.id}`,
    kind: "design",
    document: () => Promise.resolve(kilnformQuote(pairing)),
    noFindings: true,
  })),
  {
    name: "quote-card-m1",
    kind: "design",
    document: () => upgradedBaseline("quote-card-roles", "1.4.0"),
    noFindings: false,
  },
  {
    name: "statistic-card-m1",
    kind: "design",
    document: () => upgradedBaseline("statistic-card-roles", "1.4.0"),
    noFindings: false,
  },
  {
    name: "image-led-campaign-m1-square",
    kind: "design",
    document: () => upgradedBaseline("image-led-campaign-local-square", "1.3.0"),
    noFindings: false,
  },
];

async function render(testCase: Case) {
  if (testCase.kind === "scene") {
    const document = testCase.document();
    const result = await renderScene(document, {
      formats: ["png"],
      creationTimestamp: TIMESTAMP,
    });
    return {
      document: document as unknown,
      output: result.outputs[0]!,
      issues: result.qualityIssues,
    };
  }
  const document = await testCase.document();
  const result = await renderGraphic(document, {
    formats: ["png"],
    creationTimestamp: TIMESTAMP,
    assets: await loadExampleAssets(document),
  });
  return {
    document: document as unknown,
    output: result.outputs[0]!,
    issues: result.qualityIssues,
  };
}

describe("typography M1 visual baselines (review pending)", () => {
  it.each(M1_VISUAL_CASES.map((testCase) => [testCase.name, testCase] as const))(
    "%s matches the exact pinned PNG",
    async (name, testCase) => {
      const { document, output, issues } = await render(testCase);
      if (testCase.noFindings) expect(issues, name).toEqual([]);
      const designPath = resolve(`${DIRECTORY}/${name}.${testCase.kind}.json`);
      const pngPath = resolve(`${DIRECTORY}/${name}.png`);
      const manifestPath = resolve(`${DIRECTORY}/${name}.manifest.json`);
      if (process.env["GLYPHKILN_UPDATE_VISUALS"] === "1") {
        await writeFile(
          designPath,
          await prettier.format(JSON.stringify(document), { parser: "json" }),
          "utf8",
        );
        await writeFile(pngPath, output.bytes);
        await writeFile(
          manifestPath,
          await prettier.format(JSON.stringify(output.manifest), { parser: "json" }),
          "utf8",
        );
      }
      expect(JSON.parse(await readFile(designPath, "utf8"))).toEqual(
        JSON.parse(JSON.stringify(document)),
      );
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        output: { sha256: string };
        renderer: { version: string };
      };
      expect(manifest.renderer.version).toBe("0.6.0");
      expect(sha256(output.bytes)).toBe(manifest.output.sha256);
      expect(output.bytes).toEqual(new Uint8Array(await readFile(pngPath)));
    },
    120_000,
  );
});
