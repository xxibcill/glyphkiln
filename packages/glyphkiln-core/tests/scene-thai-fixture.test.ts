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
});
