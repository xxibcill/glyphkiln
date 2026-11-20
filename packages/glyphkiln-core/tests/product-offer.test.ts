import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { renderGraphic, type DesignDocument } from "../src/index.js";
import { loadExampleAssets } from "./helpers.js";

async function fixture(): Promise<DesignDocument> {
  return JSON.parse(
    await readFile("tests/visual/baselines/product-offer-square.design.json", "utf8"),
  ) as DesignDocument;
}

describe("product and offer composition", () => {
  it.each([
    "instagram-square",
    "instagram-portrait",
    "instagram-story",
    "linkedin-landscape",
    "x-landscape",
    "youtube-thumbnail",
  ] as const)("renders all copy without collisions in %s", async (format) => {
    const document = await fixture();
    document.format = format;
    const options = {
      assets: await loadExampleAssets(document),
      formats: ["svg"] as const,
    };
    const result = await renderGraphic(document, options);
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(result.outputs[0]!.bytes).toEqual(
      (await renderGraphic(document, options)).outputs[0]!.bytes,
    );
    const text = result.evidence.text;
    expect(text.map((item) => item.layerId)).toEqual([
      "eyebrow",
      "offer",
      "headline",
      "subtitle",
      "cta",
      "footer",
    ]);
    for (let index = 0; index < text.length; index += 1) {
      const a = text[index]!.bounds;
      for (const other of text.slice(index + 1)) {
        const b = other.bounds;
        expect(
          a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y,
          `${text[index]!.layerId}/${other.layerId}`,
        ).toBe(false);
      }
    }
    const svg = new TextDecoder().decode(result.outputs[0]!.bytes);
    const stage = /<rect[^>]*id="product-stage"[^>]*>/.exec(svg)![0];
    const coordinate = (name: string): number =>
      Number(new RegExp(`${name}="([^"]+)"`).exec(stage)![1]);
    const box = {
      x: coordinate("x"),
      y: coordinate("y"),
      width: coordinate("width"),
      height: coordinate("height"),
    };
    const safe = result.evidence.safeArea;
    expect(box.x).toBeGreaterThanOrEqual(safe.x - 0.001);
    expect(box.y).toBeGreaterThanOrEqual(safe.y - 0.001);
    expect(box.x + box.width).toBeLessThanOrEqual(safe.x + safe.width + 0.001);
    expect(box.y + box.height).toBeLessThanOrEqual(safe.y + safe.height + 0.001);
    for (const item of text) {
      const a = item.bounds;
      expect(
        a.x < box.x + box.width &&
          a.x + a.width > box.x &&
          a.y < box.y + box.height &&
          a.y + a.height > box.y,
        item.layerId,
      ).toBe(false);
    }
    const image = /<g id="product"[\s\S]*?<image[^>]*>/.exec(svg)![0];
    expect(image).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(image).toContain('rx="0"');
  });

  it("supports long copy, dark colors, a logo, and optional-free typography", async () => {
    const document = await fixture();
    document.mode = "dark";
    document.format = "instagram-portrait";
    Object.assign(
      document.layers.find((layer) => layer.type === "headline")!,
      { text: "A warmer welcome for every corner of your home." },
    );
    document.layers.push({
      id: "logo",
      type: "logo",
      assetId: document.assets[0]!.id,
      alt: "Test mark",
      fit: "contain",
      visible: true,
    });
    const assets = await loadExampleAssets(document);
    const result = await renderGraphic(document, { assets, formats: ["svg"] });
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    document.layers = document.layers.filter((layer) => layer.type === "headline");
    document.assets = [];
    expect(
      (await renderGraphic(document, { formats: ["svg"] })).evidence.text,
    ).toHaveLength(1);
  });

  it.each(["headline", "subtitle", "badge", "cta", "footer"] as const)(
    "rejects overflowing %s copy",
    async (type) => {
      const document = await fixture();
      Object.assign(
        document.layers.find((layer) => layer.type === type)!,
        {
          text: type === "badge" ? "W".repeat(80) : "Excessive offer copy ".repeat(80),
        },
      );
      await expect(
        renderGraphic(document, { assets: await loadExampleAssets(document) }),
      ).rejects.toMatchObject({ code: "QUALITY_VALIDATION_FAILED" });
    },
  );

  it("rejects cropped products and unresolved assets", async () => {
    const document = await fixture();
    await expect(renderGraphic(document)).rejects.toThrow();
    Object.assign(
      document.layers.find((layer) => layer.type === "product-screenshot")!,
      { fit: "cover" },
    );
    await expect(
      renderGraphic(document, { assets: await loadExampleAssets(document) }),
    ).rejects.toMatchObject({ code: "QUALITY_VALIDATION_FAILED" });
  });
});
