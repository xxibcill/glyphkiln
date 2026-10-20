import { inspectDesignTextLayout } from "../src/typography/design-text-layout.js";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  renderGraphic,
  validateDesignDocument,
  TEMPLATE_REGISTRY,
  type DesignDocument,
} from "../src/index.js";
import { loadExampleAssets } from "./helpers.js";

const families = [
  "testimonial-evidence",
  "comparison",
  "problem-solution",
  "offer-urgency",
] as const;
const formats = [
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "linkedin-landscape",
] as const;

async function example(family: string): Promise<DesignDocument> {
  return JSON.parse(
    await readFile(`examples/${family}.json`, "utf8"),
  ) as DesignDocument;
}

describe("static ad families", () => {
  it.each(families)(
    "rejects missing required roles and overflow in %s",
    async (family) => {
      const source = await example(family);
      const assets = await loadExampleAssets(source);
      for (const role of TEMPLATE_REGISTRY[family].requiredLayers) {
        const document = {
          ...source,
          layers: source.layers.filter((layer) => layer.type !== role),
        };
        await expect(renderGraphic(document, { assets })).rejects.toMatchObject({
          code: "QUALITY_VALIDATION_FAILED",
        });
      }
      const headline = source.layers.find((layer) => layer.type === "headline")!;
      headline.text = "W".repeat(2000);
      await expect(renderGraphic(source, { assets })).rejects.toMatchObject({
        code: "QUALITY_VALIDATION_FAILED",
      });
    },
  );

  it.each(families)(
    "renders minimal dark %s without decorative roles",
    async (family) => {
      const document = await example(family);
      const required = TEMPLATE_REGISTRY[family].requiredLayers;
      document.layers = document.layers.filter((layer) =>
        required.includes(layer.type),
      );
      document.assets = [];
      document.mode = "dark";
      await expect(
        renderGraphic(document, { formats: ["svg"] }),
      ).resolves.toBeDefined();
    },
  );

  it.each([1, 2, 3])("renders %s aligned comparison criteria", async (count) => {
    const document = await example("comparison");
    const table = document.layers.find((layer) => layer.type === "comparison-table")!;
    table.rows = table.rows.slice(0, count);
    const result = await renderGraphic(document, { formats: ["svg"] });
    expect(
      result.evidence.text.filter((item) => /^comparison-\d-/u.test(item.layerId)),
    ).toHaveLength(count * 3);
    for (const rows of [
      [],
      [...table.rows, ...table.rows, ...table.rows, ...table.rows],
      [{ label: " ", left: "A", right: "B" }],
      [{ label: "X", left: "A", right: "B", extra: "forbidden" }],
    ]) {
      expect(
        validateDesignDocument({ ...document, layers: [{ ...table, rows }] }).success,
      ).toBe(false);
    }
  });

  it("preserves optional speaker portrait, product and logo as separate contain assets", async () => {
    const document = await example("testimonial-evidence");
    const assetId = document.assets[0]!.id;
    document.layers.push(
      {
        id: "speaker",
        type: "image",
        visible: true,
        assetId,
        alt: "Fixture portrait",
        fit: "contain",
        focalPoint: { x: 0.5, y: 0.5 },
        treatment: "none",
      },
      {
        id: "mark",
        type: "logo",
        visible: true,
        assetId,
        alt: "Fixture mark",
        fit: "contain",
      },
    );
    const assets = await loadExampleAssets(document);
    for (const format of formats) {
      document.format = format;
      const result = await renderGraphic(document, { assets, formats: ["svg"] });
      const svg = new TextDecoder().decode(result.outputs[0]!.bytes);
      for (const id of ["speaker", "mark", "product"])
        expect(svg).toContain(`id="${id}"`);
      expect(svg.match(/preserveAspectRatio="xMidYMid meet"/gu)).toHaveLength(3);
    }
    const image = document.layers.find((layer) => layer.type === "image")!;
    image.fit = "cover";
    await expect(renderGraphic(document, { assets })).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
  });

  it("classifies every structured field and rejects unsupported scripts", async () => {
    const comparison = await example("comparison");
    const table = comparison.layers.find((layer) => layer.type === "comparison-table")!;
    table.rows = [{ label: "Row", left: "مرحبا", right: "B" }];
    const result = inspectDesignTextLayout(comparison);
    expect(result.renderable).toBe(false);
    expect(
      result.diagnostics.some((item) => item.fieldPath.endsWith("/rows/0/left")),
    ).toBe(true);
    const panels = await example("problem-solution");
    const layer = panels.layers.find((item) => item.type === "problem-solution")!;
    layer.solution = "مرحبا";
    expect(inspectDesignTextLayout(panels).renderable).toBe(false);
    await expect(renderGraphic(panels)).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
    expect(
      validateDesignDocument({ ...panels, layers: [{ ...layer, problem: " " }] })
        .success,
    ).toBe(false);
    expect(
      validateDesignDocument({
        ...panels,
        layers: [{ ...layer, solution: "x".repeat(181) }],
      }).success,
    ).toBe(false);
  });

  it("honors text overrides and ignores hidden duplicate roles", async () => {
    const document = await example("comparison");
    const headline = document.layers.find((layer) => layer.type === "headline")!;
    headline.id = "custom-headline";
    document.layers.find((layer) => layer.type === "footer")!.id = "headline";
    headline.fontSize = 40;
    document.layers.unshift({
      id: "hidden",
      type: "headline",
      visible: false,
      text: "Do not render me",
    });
    const result = await renderGraphic(document, { formats: ["svg"] });
    expect(
      result.evidence.text.find((item) => item.layerId === "custom-headline")?.fontSize,
    ).toBe(40);
    expect(result.evidence.text.some((item) => item.layerId === "hidden")).toBe(false);
  });

  it.each(families)(
    "renders %s in every supported shape without losing copy",
    async (family) => {
      const document = await example(family);
      const assets = await loadExampleAssets(document);
      for (const format of formats) {
        document.format = format;
        const result = await renderGraphic(document, { assets, formats: ["svg"] });
        expect(
          result.qualityIssues.filter((issue) => issue.severity === "error"),
        ).toEqual([]);
        expect(result.outputs[0]!.bytes).toEqual(
          (await renderGraphic(document, { assets, formats: ["svg"] })).outputs[0]!
            .bytes,
        );
        const boxes = result.evidence.text;
        for (const [index, a] of boxes.entries()) {
          for (const b of boxes.slice(index + 1)) {
            expect(
              a.bounds.x < b.bounds.x + b.bounds.width &&
                a.bounds.x + a.bounds.width > b.bounds.x &&
                a.bounds.y < b.bounds.y + b.bounds.height &&
                a.bounds.y + a.bounds.height > b.bounds.y,
              `${format}: ${a.layerId}/${b.layerId}`,
            ).toBe(false);
          }
        }
      }
      expect(
        validateDesignDocument({ ...document, schemaVersion: "1.5.0" }).success,
      ).toBe(false);
      document.assets = [];
      document.layers = document.layers.filter(
        (layer) =>
          !["product-screenshot", "image", "logo", "eyebrow", "cta"].includes(
            layer.type,
          ),
      );
      document.mode = "dark";
      await expect(
        renderGraphic(document, { formats: ["svg"] }),
      ).resolves.toBeDefined();
    },
    60_000,
  );
});
