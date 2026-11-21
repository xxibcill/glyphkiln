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
import { loadExampleAssets } from "./helpers.js";
import { thaiQuote } from "./visual/m3/documents.js";

/**
 * Exact PNG candidates for the typography M3 template versions (plan M3).
 * Written with GLYPHKILN_UPDATE_VISUALS=1; they still need the owner's
 * review: see docs/research/typography-m3-metrics/. Each is craft-reviewed at
 * its delivery width and the result is pinned beside it (`<name>.craft.json`).
 * `thai-quote-m1` is the quote-card@1.4.0 "before" of `thai-quote-m3`. The
 * Latin-only M3 versions must give the M1 baseline's exact PNG bytes, since
 * no M3 opportunity changes their lines; only their manifests are pinned.
 */
const TIMESTAMP = "2026-11-05T00:00:00.000Z";
const DIRECTORY = "tests/visual/m3";
const PHONE_WIDTH = 360;

type Case = {
  name: string;
  document: () => Promise<DesignDocument>;
  deliveryWidths: readonly number[];
  /** An M1 baseline whose PNG bytes this case must equal (Latin-only copy). */
  samePngAs?: string;
};

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

async function upgradedBaseline(name: string, version: "1.4.0" | "1.5.0") {
  const document = JSON.parse(
    await readFile(resolve(`tests/visual/baselines/${name}.design.json`), "utf8"),
  ) as DesignDocument;
  return {
    ...document,
    schemaVersion: "1.8.0",
    template: { ...document.template, version },
  } as DesignDocument;
}

export const M3_VISUAL_CASES: readonly Case[] = [
  {
    name: "thai-quote-m1",
    document: () => Promise.resolve(thaiQuote("1.4.0")),
    deliveryWidths: [PHONE_WIDTH],
  },
  {
    name: "thai-quote-m3",
    document: () => Promise.resolve(thaiQuote("1.5.0")),
    deliveryWidths: [PHONE_WIDTH],
  },
  {
    name: "thai-quote-m3-lexicon",
    document: () =>
      Promise.resolve(thaiQuote("1.5.0", { lexicon: ["เพื่อนไร่เพื่อนสวน"] })),
    deliveryWidths: [PHONE_WIDTH],
  },
  {
    name: "quote-card-m3",
    samePngAs: "tests/visual/m1/quote-card-m1.png",
    document: () => upgradedBaseline("quote-card-roles", "1.5.0"),
    deliveryWidths: [PHONE_WIDTH],
  },
  {
    name: "statistic-card-m3",
    samePngAs: "tests/visual/m1/statistic-card-m1.png",
    document: () => upgradedBaseline("statistic-card-roles", "1.5.0"),
    deliveryWidths: [PHONE_WIDTH],
  },
  {
    name: "image-led-campaign-m3-square",
    samePngAs: "tests/visual/m1/image-led-campaign-m1-square.png",
    document: () => upgradedBaseline("image-led-campaign-local-square", "1.4.0"),
    deliveryWidths: [PHONE_WIDTH],
  },
];

async function render(testCase: Case) {
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
  return { document: document as unknown, output: result.outputs[0]!, craft };
}

describe("typography M3 visual candidates (review pending)", () => {
  it.each(M3_VISUAL_CASES.map((testCase) => [testCase.name, testCase] as const))(
    "%s matches the exact pinned PNG",
    async (name, testCase) => {
      const { document, output, craft } = await render(testCase);
      const designPath = resolve(`${DIRECTORY}/${name}.design.json`);
      const pngPath = resolve(testCase.samePngAs ?? `${DIRECTORY}/${name}.png`);
      const manifestPath = resolve(`${DIRECTORY}/${name}.manifest.json`);
      const craftPath = resolve(`${DIRECTORY}/${name}.craft.json`);
      if (process.env["GLYPHKILN_UPDATE_VISUALS"] === "1") {
        await writeFile(
          designPath,
          await prettier.format(JSON.stringify(document), { parser: "json" }),
          "utf8",
        );
        if (testCase.samePngAs === undefined) await writeFile(pngPath, output.bytes);
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
        manifestVersion: string;
      };
      expect(manifest.manifestVersion).toBe(name.endsWith("-m1") ? "1.3.0" : "1.4.0");
      expect(sha256(output.bytes)).toBe(manifest.output.sha256);
      expect(manifest).toEqual(JSON.parse(JSON.stringify(output.manifest)));
      expect(output.bytes).toEqual(new Uint8Array(await readFile(pngPath)));
    },
    300_000,
  );
});
