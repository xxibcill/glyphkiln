import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadExampleAssets } from "./helpers.js";
import {
  renderGraphic,
  validateDesignDocument,
  type DesignDocument,
} from "../src/index.js";

async function candidate() {
  const base = JSON.parse(
    await readFile("tests/visual/baselines/product-offer-square.design.json", "utf8"),
  ) as Record<string, unknown>;
  return {
    ...base,
    schemaVersion: "1.5.0",
    format: "instagram-square",
    template: { id: "benefit-proof", version: "1.0.0" },
    assets: [],
    layers: [
      {
        id: "headline",
        type: "headline",
        visible: true,
        text: "Made for your evening.",
      },
      {
        id: "benefits",
        type: "benefit-list",
        visible: true,
        items: [
          { title: "Ceramic base", description: "A sculptural presence." },
          { title: "Linen shade", description: "A softer pool of light." },
          { title: "Compact form", description: "Room for the essentials." },
        ] as { title: string; description?: string; url?: string }[],
      },
    ] satisfies [unknown, unknown],
  };
}

describe("benefit proof", () => {
  it.each([1, 2, 3])("preserves optional imagery, logo and %s facts", async (count) => {
    const document = JSON.parse(
      await readFile("examples/benefit-proof.json", "utf8"),
    ) as DesignDocument;
    const facts = document.layers.find((layer) => layer.type === "benefit-list");
    if (!facts) throw new Error("Missing benefits");
    facts.items = facts.items.slice(0, count).map((item) => ({ title: item.title }));
    document.layers.push({
      id: "logo",
      type: "logo",
      assetId: document.assets[0]!.id,
      alt: "Test brand mark",
      fit: "contain",
      visible: true,
    });
    const assets = await loadExampleAssets(document);
    for (const format of [
      "instagram-square",
      "instagram-portrait",
      "instagram-story",
      "linkedin-landscape",
    ] as const) {
      document.format = format;
      const result = await renderGraphic(document, { formats: ["svg"], assets });
      expect(
        result.evidence.text.filter((item) => item.layerId.startsWith("benefits-")),
      ).toHaveLength(count);
      const svg = new TextDecoder().decode(result.outputs[0]!.bytes);
      const image = /<g id="product"[\s\S]*?<image[^>]*>/.exec(svg)![0];
      expect(image).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(image).toContain('rx="0"');
    }
    document.layers = document.layers.filter(
      (layer) => !["eyebrow", "cta", "footer"].includes(layer.type),
    );
    document.mode = "dark";
    await expect(
      renderGraphic(document, { formats: ["svg"], assets }),
    ).resolves.toBeDefined();
    Object.assign(
      document.layers.find((layer) => layer.type === "product-screenshot")!,
      { fit: "cover" },
    );
    await expect(renderGraphic(document, { assets })).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
  });

  it("fails on excessive proof copy, unknown fields and missing assets", async () => {
    const document = await candidate();
    document.layers[1].items = [
      { title: "W".repeat(80), description: "W".repeat(180) },
    ];
    document.format = "instagram-story";
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
    for (const items of [
      [{ title: " " }],
      [{ title: "Title", description: " " }],
      [{ title: "Title", description: "x".repeat(181) }],
    ]) {
      document.layers[1].items = items;
      expect(validateDesignDocument(document).success).toBe(false);
    }
    const imageDocument: unknown = JSON.parse(
      await readFile("examples/benefit-proof.json", "utf8"),
    );
    await expect(renderGraphic(imageDocument)).rejects.toThrow();
  });

  it("accepts a bounded list only in the new schema", async () => {
    const document = await candidate();
    expect(validateDesignDocument(document).success).toBe(true);
    expect(
      validateDesignDocument({ ...document, schemaVersion: "1.4.0" }).success,
    ).toBe(false);
    for (const items of [
      [],
      Array.from({ length: 4 }, () => ({ title: "Too many" })),
      [{ title: "" }],
      [{ title: "Valid", url: "https://example.com" }],
    ]) {
      document.layers[1].items = items;
      expect(validateDesignDocument(document).success).toBe(false);
    }
  });

  it.each([
    "instagram-square",
    "instagram-portrait",
    "instagram-story",
    "linkedin-landscape",
  ])("renders every benefit deterministically in %s", async (format) => {
    const document = { ...(await candidate()), format };
    const result = await renderGraphic(document, { formats: ["svg"] });
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(
      result.evidence.text.filter((item) => item.layerId.startsWith("benefits-")),
    ).toHaveLength(6);
    expect(result.outputs[0]!.bytes).toEqual(
      (await renderGraphic(document, { formats: ["svg"] })).outputs[0]!.bytes,
    );
    const boxes = result.evidence.text;
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        expect(
          a.bounds.x < b.bounds.x + b.bounds.width &&
            a.bounds.x + a.bounds.width > b.bounds.x &&
            a.bounds.y < b.bounds.y + b.bounds.height &&
            a.bounds.y + a.bounds.height > b.bounds.y,
          `${a.layerId}/${b.layerId}`,
        ).toBe(false);
      }
    }
  });

  it("rejects hidden required proof and unsupported copy rather than dropping it", async () => {
    const document = await candidate();
    document.layers[1].visible = false;
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
    document.layers[1].visible = true;
    document.layers[1].items = [{ title: "مرحبا" }];
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
  });
});
