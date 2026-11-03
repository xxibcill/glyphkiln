import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GlyphkilnError,
  inspectDesignDocument,
  renderGraphic,
  validateDesignDocument,
} from "@glyphkiln/core";
import { format } from "prettier";

const probeDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(probeDirectory, "../../..");
const exampleDirectory = join(repositoryRoot, "packages/glyphkiln-core/examples");
const outputPath = join(probeDirectory, "probe-results.json");

const expectedResults = {
  "overlong-visible-copy": {
    inspectRenderable: true,
    inspectionCodes: [],
    renderErrorCode: "QUALITY_VALIDATION_FAILED",
    qualityIssueCodes: ["TEXT_OVERFLOW"],
  },
  "unsupported-visible-rtl": {
    inspectRenderable: false,
    inspectionCodes: ["BIDI_LAYOUT_UNSUPPORTED"],
    renderErrorCode: "QUALITY_VALIDATION_FAILED",
    qualityIssueCodes: ["BIDI_LAYOUT_UNSUPPORTED"],
  },
  "wrong-declared-asset-hash": {
    inspectRenderable: true,
    inspectionCodes: [],
    renderErrorCode: "ASSET_DECLARATION_MISMATCH",
    qualityIssueCodes: [],
    mismatchFields: ["sha256"],
  },
};

async function loadExample(name) {
  return JSON.parse(await readFile(join(exampleDirectory, `${name}.json`), "utf8"));
}

async function loadImageLedAssets(document) {
  const paths = {
    "kilnform-lamp-campaign": "kilnform-lamp-campaign.png",
    "kilnform-mark": "kilnform-mark.png",
  };
  return Promise.all(
    document.assets.map(async (declaration) => {
      const filename = paths[declaration.id];
      assert.ok(filename, `Unknown local fixture asset: ${declaration.id}`);
      return {
        ...declaration,
        bytes: new Uint8Array(
          await readFile(join(exampleDirectory, "assets", filename)),
        ),
      };
    }),
  );
}

function qualityIssueCodes(error) {
  const issues = error.details?.issues;
  if (!Array.isArray(issues)) return [];
  return [...new Set(issues.map((issue) => issue.code))].sort();
}

async function runCase({ id, source, mutate, assets = [] }) {
  const baseline = await loadExample(source);
  const baselineValidation = validateDesignDocument(baseline);
  assert.equal(baselineValidation.success, true, `${id}: control must validate`);
  const baselineInspection = inspectDesignDocument(baselineValidation.data);
  assert.equal(
    baselineInspection.textLayout.renderable,
    true,
    `${id}: control must pass text inspection`,
  );
  const baselineRender = await renderGraphic(baselineValidation.data, {
    formats: ["svg"],
    assets,
  });
  assert.equal(baselineRender.outputs.length, 1, `${id}: control must render`);

  const input = structuredClone(baseline);
  mutate(input);

  const validation = validateDesignDocument(input);
  assert.equal(validation.success, true, `${id}: document must be schema-valid`);
  const inspection = inspectDesignDocument(validation.data);
  const inspectionCodes = [
    ...new Set(inspection.textLayout.diagnostics.map((item) => item.code)),
  ].sort();

  let caught;
  try {
    await renderGraphic(validation.data, { formats: ["svg"], assets });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${id}: render unexpectedly succeeded`);
  assert.ok(caught instanceof GlyphkilnError, `${id}: unexpected error type`);

  const result = {
    id,
    source: `packages/glyphkiln-core/examples/${source}.json`,
    control: {
      validationAccepted: true,
      inspectionRenderable: true,
      renderAccepted: true,
    },
    validation: { accepted: true },
    inspection: {
      accepted: true,
      renderable: inspection.textLayout.renderable,
      diagnosticCodes: inspectionCodes,
    },
    render: {
      accepted: false,
      errorCode: caught.code,
      qualityIssueCodes: qualityIssueCodes(caught),
      ...(Array.isArray(caught.details?.fields)
        ? { mismatchFields: caught.details.fields }
        : {}),
    },
    firstDetectionStage: inspection.textLayout.renderable ? "render" : "inspect",
  };

  const expected = expectedResults[id];
  assert.equal(result.inspection.renderable, expected.inspectRenderable, id);
  assert.deepEqual(result.inspection.diagnosticCodes, expected.inspectionCodes, id);
  assert.equal(result.render.errorCode, expected.renderErrorCode, id);
  assert.deepEqual(result.render.qualityIssueCodes, expected.qualityIssueCodes, id);
  if (expected.mismatchFields) {
    assert.deepEqual(result.render.mismatchFields, expected.mismatchFields, id);
  }

  return result;
}

async function main() {
  const baselineImageDocument = await loadExample("image-led-campaign");
  const imageAssets = await loadImageLedAssets(baselineImageDocument);
  const results = {
    suite: "designer-stress-test-negative-probes",
    cases: [
      await runCase({
        id: "overlong-visible-copy",
        source: "tiktok-carousel-slide",
        mutate(document) {
          const headline = document.layers.find((layer) => layer.type === "headline");
          assert.ok(headline, "Carousel example must have a headline");
          headline.text = "A deliberately oversized carousel headline ".repeat(8);
          headline.maxLines = 20;
        },
      }),
      await runCase({
        id: "unsupported-visible-rtl",
        source: "product-announcement",
        mutate(document) {
          const headline = document.layers.find((layer) => layer.type === "headline");
          assert.ok(headline, "Announcement example must have a headline");
          headline.text = "\u05D0";
        },
      }),
      await runCase({
        id: "wrong-declared-asset-hash",
        source: "image-led-campaign",
        assets: imageAssets,
        mutate(document) {
          assert.ok(document.assets[0], "Image-led example must have an asset");
          document.assets[0].sha256 = "0".repeat(64);
        },
      }),
    ],
  };

  const serialized = await format(JSON.stringify(results), { parser: "json" });
  if (process.argv.includes("--verify")) {
    assert.equal(await readFile(outputPath, "utf8"), serialized);
  } else {
    await writeFile(outputPath, serialized);
  }
  process.stdout.write(
    `${results.cases.length} negative probes matched expected Core failures.\n`,
  );
}

await main();
