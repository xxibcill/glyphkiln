import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { sha256 } from "../src/index.js";
import {
  renderScene,
  verifySceneReproduction,
  type SceneDocument,
} from "../src/scene/index.js";

const root = resolve("fixtures/scene-thai");

describe("licensed Thai Scene typography fixture", () => {
  it("pins mixed-script wrapping and an offer qualifier with its number", async () => {
    const document = JSON.parse(
      await readFile(resolve(root, "thai-offer.scene.json"), "utf8"),
    ) as SceneDocument;
    const fontBytes = new Uint8Array(
      await readFile(resolve(root, "font/NotoSansThai.ttf")),
    );
    const license = await readFile(resolve(root, "font/OFL.txt"), "utf8");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(sha256(fontBytes)).toBe(document.fonts[0]!.sha256);
    const result = await renderScene(document, {
      formats: ["svg", "png"],
      fonts: document.fonts.map((font) => ({ ...font, bytes: fontBytes })),
      creationTimestamp: "2026-09-24T00:00:00.000Z",
      reviewReadingOrder: true,
    });
    expect(
      result.qualityIssues.find(
        (issue) =>
          issue.severity === "error" || issue.code === "SCENE_READING_ORDER_UNCOVERED",
      ),
    ).toBeUndefined();
    expect(
      result.evidence.text.find((text) => text.id === "eyebrow")?.lines[0],
    ).toContain("THAI TYPE / ตัวอย่าง");
    expect(result.evidence.text.find((text) => text.id === "headline")?.lines).toEqual([
      "วันนี้มีข้อเสนอพิเศษ",
      "สำหรับคนที่ชอบอ่านชัดๆ",
    ]);
    expect(result.evidence.text.find((text) => text.id === "offer")?.lines).toEqual([
      "ลดสูงสุด 25%",
      "วันนี้เท่านั้น",
    ]);
    expect(
      result.evidence.text.find((text) => text.id === "offer")?.wrap.segmentationPolicy,
    ).toBe("budoux-th");
    const svg = result.outputs[0]!;
    const png = result.outputs[1]!;
    expect(svg.bytes).toEqual(
      new Uint8Array(await readFile(resolve(root, "generated/thai-offer.svg"))),
    );
    expect(png.bytes).toEqual(
      new Uint8Array(await readFile(resolve(root, "generated/thai-offer.png"))),
    );
    expect(
      verifySceneReproduction({ document, bytes: png.bytes, manifest: png.manifest }),
    ).toEqual([]);
    const compact = PNG.sync.read(
      await readFile(resolve(root, "generated/thai-offer-360.png")),
    );
    expect({ width: compact.width, height: compact.height }).toEqual({
      width: 360,
      height: 360,
    });
  });

  it("reports a later opaque product image over the measured Thai headline", async () => {
    const document = JSON.parse(
      await readFile(resolve(root, "thai-occlusion.scene.json"), "utf8"),
    ) as SceneDocument;
    const fontBytes = new Uint8Array(
      await readFile(resolve(root, "font/NotoSansThai.ttf")),
    );
    const product = new PNG({ width: 1, height: 1 });
    product.data.fill(255);
    const bytes = PNG.sync.write(product);
    expect(sha256(bytes)).toBe(document.assets[0]!.sha256);
    const options = {
      assets: [{ ...document.assets[0]!, bytes }],
      fonts: document.fonts.map((font) => ({ ...font, bytes: fontBytes })),
      creationTimestamp: "2026-09-24T00:00:00.000Z",
    };
    const covered = await renderScene(document, options);
    const bounds = covered.evidence.text.find(
      (text) => text.id === "headline-second",
    )!.bounds;
    expect(bounds.y).toBe(221);
    expect(bounds.y + bounds.height).toBeCloseTo(348.44, 2);
    const issue = covered.qualityIssues.find(
      (item) => item.code === "SCENE_TEXT_OCCLUDED",
    );
    expect(issue).toEqual({
      code: "SCENE_TEXT_OCCLUDED",
      severity: "warning",
      layerId: "headline-second",
      message:
        'Later-painted element "product-image" covers visible text "headline-second".',
      details: {
        textElementId: "headline-second",
        occludingElementId: "product-image",
        overlapArea: Math.round(bounds.width * 28.44 * 1_000_000) / 1_000_000,
      },
    });
    expect(covered.outputs[0]!.manifest.qualityIssues).toContainEqual(issue);

    const lower = structuredClone(document);
    const image = lower.elements[2]!;
    if (image.type !== "image") throw new Error("Expected product image.");
    image.y = 380;
    const clear = await renderScene(lower, options);
    expect(
      clear.qualityIssues.some((item) => item.code === "SCENE_TEXT_OCCLUDED"),
    ).toBe(false);

    const behind = structuredClone(document);
    behind.elements.unshift(behind.elements.pop()!);
    const behindResult = await renderScene(behind, options);
    expect(
      behindResult.qualityIssues.some((item) => item.code === "SCENE_TEXT_OCCLUDED"),
    ).toBe(false);

    const transparent = new PNG({ width: 1, height: 2 });
    transparent.data.fill(255);
    transparent.data[3] = 0;
    const transparentBytes = PNG.sync.write(transparent);
    const transparentDocument = structuredClone(document);
    transparentDocument.assets[0]!.height = 2;
    transparentDocument.assets[0]!.sha256 = sha256(transparentBytes);
    const transparentResult = await renderScene(transparentDocument, {
      ...options,
      assets: [{ ...transparentDocument.assets[0]!, bytes: transparentBytes }],
    });
    expect(
      transparentResult.qualityIssues.some(
        (item) => item.code === "SCENE_TEXT_OCCLUDED",
      ),
    ).toBe(false);

    const intentional = await renderScene(document, {
      ...options,
      intentionalTextOverlayIds: ["product-image"],
    });
    expect(
      intentional.qualityIssues.some((item) => item.code === "SCENE_TEXT_OCCLUDED"),
    ).toBe(false);
    expect(intentional.outputs[0]!.bytes).toEqual(covered.outputs[0]!.bytes);
    expect(intentional.outputs[0]!.fingerprint).toBe(covered.outputs[0]!.fingerprint);
  }, 60_000);
});
