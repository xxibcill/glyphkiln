# Migrating from private `renderSceneToSvg`

Before Core 0.8, some integrations imported `src/renderer/svg.ts` and passed a
private, already-resolved `Scene`. Use the public `@glyphkiln/core/scene`
entry point for new integrations. `renderScene` validates a versioned
`SceneDocument`, resolves declared font and image bytes, fits raw text, writes
portable outlines, and returns SVG or PNG bytes with a manifest. It does not
accept the old `lines`, `outlines`, or embedded image `href` fields. Convert the
source data deliberately; no automatic migration runs during rendering.

This complete example uses bundled Inter. Pass a licensed custom font's bytes
to `renderExample` if needed. The hash in the document must match those bytes;
the example uses a different family name when custom bytes are supplied.

```ts
import { writeFile } from "node:fs/promises";
import { DEVELOPMENT_FONT_SHA256, sha256 } from "@glyphkiln/core";
import {
  renderScene,
  verifySceneReproduction,
  type SceneDocument,
} from "@glyphkiln/core/scene";

export async function renderExample(customFontBytes?: Uint8Array) {
  const family = customFontBytes === undefined ? "Inter" : "Custom Sans";
  const fontHash =
    customFontBytes === undefined ? DEVELOPMENT_FONT_SHA256 : sha256(customFontBytes);
  const scene: SceneDocument = {
    schemaVersion: "1.0.0",
    id: "migration-example",
    seed: "migration-example-v1",
    dimensions: { width: 640, height: 360 },
    title: "A small explanation",
    description: "A cause connects to a result.",
    backgroundColor: "#F8F7F2",
    assets: [],
    fonts: [{ family, weight: 400, style: "normal", sha256: fontHash }],
    elements: [
      {
        id: "cause",
        type: "text",
        text: "Input signal",
        box: { x: 48, y: 90, width: 200, height: 64 },
        font: { family, weight: 400, style: "normal" },
        fit: {
          preferredFontSize: 30,
          minimumFontSize: 22,
          maximumLines: 2,
          lineHeight: 1.2,
          align: "left",
        },
        fill: "#172827",
        textMode: "outline",
        semantic: { role: "content", conceptId: "signal" },
      },
      {
        id: "result",
        type: "text",
        text: "Visible result",
        box: { x: 390, y: 90, width: 210, height: 64 },
        font: { family, weight: 400, style: "normal" },
        fit: {
          preferredFontSize: 30,
          minimumFontSize: 22,
          maximumLines: 2,
          lineHeight: 1.2,
          align: "left",
        },
        fill: "#172827",
        textMode: "outline",
        semantic: { role: "content", conceptId: "result" },
      },
      {
        id: "flow",
        type: "connector",
        fromId: "cause",
        toId: "result",
        points: [
          { x: 250, y: 122 },
          { x: 380, y: 122 },
        ],
        stroke: "#226C60",
        strokeWidth: 3,
        markers: { start: "none", end: "arrow" },
        semantic: { role: "connector" },
      },
    ],
    readingOrder: ["cause", "result"],
  };

  const result = await renderScene(scene, {
    formats: ["svg", "png"],
    reviewReadingOrder: true,
    ...(customFontBytes === undefined
      ? {}
      : {
          fonts: [
            {
              family,
              weight: 400,
              style: "normal",
              sha256: fontHash,
              bytes: customFontBytes,
            },
          ],
        }),
  });
  for (const output of result.outputs) {
    const problems = verifySceneReproduction({
      document: scene,
      bytes: output.bytes,
      manifest: output.manifest,
    });
    if (problems.length > 0) throw new Error(JSON.stringify(problems));
    await writeFile(`migration-example.${output.format}`, output.bytes);
    await writeFile(
      `migration-example.${output.format}.manifest.json`,
      JSON.stringify(output.manifest, null, 2) + "\n",
    );
  }
  return result.evidence;
}
```

Bundled Inter still requires a matching font declaration and SHA-256 in the
scene. Core resolves those exact bytes without caller-supplied `fonts`. For
other faces, supply verified bytes explicitly, offline. The document contains
no file path or URL. `glyphkiln scene render` takes a separately selected
`--resource-bundle` directory when running this flow from JSON.

`result.evidence` has stable element IDs and measured bounds for review.
`qualityIssues` may include advisory warnings; neither proves accessibility
or design quality. Review the SVG reading order, meaning, and delivered-size
PNG with a person before publication.
