import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import prettier from "prettier";
import { describe, expect, it } from "vitest";

import {
  renderGraphic,
  reviewGraphicCraft,
  sha256,
  type CraftReview,
  type DesignDocument,
} from "../src/index.js";
import {
  renderScene,
  reviewSceneCraft,
  type SceneDocument,
} from "../src/scene/index.js";
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
 *
 * Each case is also craft-reviewed at its delivery widths, and the result is
 * pinned beside the baseline (`<name>.craft.json`). For the M1 cases authored
 * here, any finding outside ACCEPTED_CRAFT fails: Core's quality issues only
 * prove the text fits, not that it reads at phone size.
 */
const TIMESTAMP = "2026-11-04T00:00:00.000Z";
const DIRECTORY = "tests/visual/m1";

type Case = { name: string; noFindings: boolean; deliveryWidths: readonly number[] } & (
  | { kind: "scene"; document: () => SceneDocument }
  | { kind: "design"; document: () => Promise<DesignDocument> }
);

/** The phone-feed width; brief A also names its own 400 px delivery view. */
const PHONE_WIDTH = 360;

/**
 * Advisory craft findings accepted for review, as `code:element@width`.
 * Specimens are type sheets, not compositions, so their empty bands are
 * expected. quote-card@1.4.0 sets the attribution at 34 px; Source Serif 4's
 * small x-height lands at 5.4 px at 360 px, just under the 5.5 px threshold.
 * That is left visible for the owner's review rather than tuned away.
 */
function acceptedCraft(name: string): readonly string[] {
  if (name.startsWith("specimen-")) return [`CRAFT_DEAD_SPACE:canvas@${PHONE_WIDTH}`];
  if (name === "kilnform-quote-noto-serif")
    return [`CRAFT_TEXT_SMALL_AT_DELIVERY:attribution@${PHONE_WIDTH}`];
  return [];
}

function craftKeys(review: CraftReview, width: number): string[] {
  return review.findings.map(
    (finding) => `${finding.code}:${finding.elementId ?? "canvas"}@${width}`,
  );
}

function craftRecord(review: CraftReview, width: number) {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    displayWidth: width,
    policyVersion: review.policyVersion,
    minimumXHeight: review.thresholds.minimumXHeight,
    findings: craftKeys(review, width),
    text: review.metrics.text.map((metric) => ({
      elementId: metric.elementId,
      fontSize: round(metric.fontSize),
      displayedXHeight: round(metric.displayedXHeight),
    })),
  };
}

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
    deliveryWidths: [PHONE_WIDTH],
  })),
  ...PAIRINGS.map((pairing): Case => ({
    name: `brief-a-${pairing.id}`,
    kind: "scene",
    document: () => briefA(pairing),
    noFindings: true,
    deliveryWidths: [PHONE_WIDTH, 400],
  })),
  ...PAIRINGS.map((pairing): Case => ({
    name: `kilnform-quote-${pairing.id}`,
    kind: "design",
    document: () => Promise.resolve(kilnformQuote(pairing)),
    noFindings: true,
    deliveryWidths: [PHONE_WIDTH],
  })),
  {
    name: "quote-card-m1",
    kind: "design",
    document: () => upgradedBaseline("quote-card-roles", "1.4.0"),
    noFindings: false,
    deliveryWidths: [PHONE_WIDTH],
  },
  {
    name: "statistic-card-m1",
    kind: "design",
    document: () => upgradedBaseline("statistic-card-roles", "1.4.0"),
    noFindings: false,
    deliveryWidths: [PHONE_WIDTH],
  },
  {
    name: "image-led-campaign-m1-square",
    kind: "design",
    document: () => upgradedBaseline("image-led-campaign-local-square", "1.3.0"),
    noFindings: false,
    deliveryWidths: [PHONE_WIDTH],
  },
];

async function render(testCase: Case) {
  if (testCase.kind === "scene") {
    const document = testCase.document();
    const result = await renderScene(document, {
      formats: ["png"],
      creationTimestamp: TIMESTAMP,
    });
    const craft = [];
    for (const width of testCase.deliveryWidths)
      craft.push(
        craftRecord(
          await reviewSceneCraft(document, { thresholds: { displayWidth: width } }),
          width,
        ),
      );
    return {
      document: document as unknown,
      output: result.outputs[0]!,
      issues: result.qualityIssues,
      craft,
    };
  }
  const document = await testCase.document();
  const assets = await loadExampleAssets(document);
  const result = await renderGraphic(document, {
    formats: ["png"],
    creationTimestamp: TIMESTAMP,
    assets,
  });
  const craft = [];
  for (const width of testCase.deliveryWidths)
    craft.push(
      craftRecord(
        await reviewGraphicCraft(document, {
          assets,
          thresholds: { displayWidth: width },
        }),
        width,
      ),
    );
  return {
    document: document as unknown,
    output: result.outputs[0]!,
    issues: result.qualityIssues,
    craft,
  };
}

describe("typography M1 visual baselines (review pending)", () => {
  it.each(M1_VISUAL_CASES.map((testCase) => [testCase.name, testCase] as const))(
    "%s matches the exact pinned PNG",
    async (name, testCase) => {
      const { document, output, issues, craft } = await render(testCase);
      if (testCase.noFindings) {
        expect(issues, name).toEqual([]);
        const unaccepted = craft
          .flatMap((record) => record.findings)
          .filter((key) => !acceptedCraft(name).includes(key));
        expect(unaccepted, `${name} craft review`).toEqual([]);
      }
      const designPath = resolve(`${DIRECTORY}/${name}.${testCase.kind}.json`);
      const pngPath = resolve(`${DIRECTORY}/${name}.png`);
      const manifestPath = resolve(`${DIRECTORY}/${name}.manifest.json`);
      const craftPath = resolve(`${DIRECTORY}/${name}.craft.json`);
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
        await writeFile(
          craftPath,
          await prettier.format(JSON.stringify(craft), { parser: "json" }),
          "utf8",
        );
      }
      expect(JSON.parse(await readFile(craftPath, "utf8"))).toEqual(craft);
      expect(JSON.parse(await readFile(designPath, "utf8"))).toEqual(
        JSON.parse(JSON.stringify(document)),
      );
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        output: { sha256: string };
        renderer: { version: string };
      };
      expect(manifest.renderer.version).toBe("0.6.0");
      expect(sha256(output.bytes)).toBe(manifest.output.sha256);
      // The whole committed manifest, including the shaper identity in
      // typographyPolicy.m1, is the render's own.
      expect(manifest).toEqual(JSON.parse(JSON.stringify(output.manifest)));
      expect(output.bytes).toEqual(new Uint8Array(await readFile(pngPath)));
    },
    120_000,
  );
});
