import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  renderScene,
  validateSceneDocument,
  verifySceneReproduction,
} from "@glyphkiln/core/scene";

const base = new URL("./", import.meta.url);
const verify = process.argv.includes("--verify");
if (process.argv.length > 3 || (process.argv.length === 3 && !verify)) {
  throw new Error("Usage: node build.mjs [--verify]");
}

const ink = "#172B34";
const muted = "#52636A";
const clay = "#A34F37";
const blue = "#2B5361";
const paper = "#F5F0E7";
const card = "#FFFCF7";
const hairline = "#D9CEC1";
const font = (weight) => ({ family: "Inter", weight, style: "normal" });
const decoration = { role: "decoration" };

function rect(id, x, y, width, height, fill, radius = 0, stroke) {
  return {
    id,
    type: "rect",
    x,
    y,
    width,
    height,
    fill,
    ...(radius ? { radius } : {}),
    ...(stroke ? { stroke, strokeWidth: 1 } : {}),
    semantic: decoration,
  };
}

function circle(id, cx, cy, radius, fill, stroke, strokeWidth = 1) {
  return {
    id,
    type: "circle",
    cx,
    cy,
    radius,
    fill,
    ...(stroke ? { stroke, strokeWidth } : {}),
    semantic: decoration,
  };
}

function path(id, data, fill, stroke, strokeWidth = 1) {
  return {
    id,
    type: "path",
    data,
    fill,
    ...(stroke ? { stroke, strokeWidth, lineCap: "round", lineJoin: "round" } : {}),
    semantic: decoration,
  };
}

function label(id, value, box, size, weight, fill, role = "content", extra = {}) {
  return {
    id,
    type: "text",
    text: value,
    box,
    font: font(weight),
    fit: {
      preferredFontSize: size,
      minimumFontSize: size,
      maximumLines: extra.maximumLines ?? 1,
      lineHeight: extra.lineHeight ?? 1.16,
      align: extra.align ?? "left",
      ...(extra.letterSpacing ? { letterSpacing: extra.letterSpacing } : {}),
    },
    fill,
    textMode: "outline-with-selectable-text",
    semantic: { role, label: extra.semanticLabel ?? value },
  };
}

function stageIcon(kind, cx, cy) {
  const id = (part) => `${kind}-${part}`;
  if (kind === "shape") {
    return [
      path(
        id("wheel"),
        `M ${cx - 43} ${cy + 37} L ${cx + 43} ${cy + 37}`,
        "none",
        blue,
        4,
      ),
      path(
        id("form-icon"),
        `M ${cx - 19} ${cy - 23} C ${cx - 24} ${cy - 7} ${cx - 37} ${cy + 5} ${cx - 31} ${cy + 23} C ${cx - 25} ${cy + 36} ${cx + 25} ${cy + 36} ${cx + 31} ${cy + 23} C ${cx + 37} ${cy + 5} ${cx + 24} ${cy - 7} ${cx + 19} ${cy - 23} Z`,
        "#C87856",
        blue,
        3,
      ),
      path(
        id("rim"),
        `M ${cx - 23} ${cy - 22} C ${cx - 10} ${cy - 32} ${cx + 10} ${cy - 32} ${cx + 23} ${cy - 22}`,
        "none",
        blue,
        3,
      ),
      path(
        id("groove"),
        `M ${cx - 20} ${cy + 13} C ${cx - 7} ${cy + 19} ${cx + 7} ${cy + 19} ${cx + 20} ${cy + 13}`,
        "none",
        "#FCE7D7",
        2,
      ),
    ];
  }
  if (kind === "dry") {
    return [
      path(
        id("shelf"),
        `M ${cx - 47} ${cy + 37} L ${cx + 47} ${cy + 37}`,
        "none",
        blue,
        4,
      ),
      path(
        id("form-icon"),
        `M ${cx - 16} ${cy - 13} C ${cx - 24} ${cy + 5} ${cx - 28} ${cy + 19} ${cx - 22} ${cy + 28} C ${cx - 16} ${cy + 35} ${cx + 16} ${cy + 35} ${cx + 22} ${cy + 28} C ${cx + 28} ${cy + 19} ${cx + 24} ${cy + 5} ${cx + 16} ${cy - 13} Z`,
        "#C88F70",
        blue,
        3,
      ),
      path(
        id("air-left"),
        `M ${cx - 43} ${cy - 14} C ${cx - 35} ${cy - 24} ${cx - 42} ${cy - 32} ${cx - 35} ${cy - 39}`,
        "none",
        clay,
        3,
      ),
      path(
        id("air-mid"),
        `M ${cx - 3} ${cy - 20} C ${cx + 5} ${cy - 29} ${cx - 3} ${cy - 37} ${cx + 4} ${cy - 44}`,
        "none",
        clay,
        3,
      ),
      path(
        id("air-right"),
        `M ${cx + 35} ${cy - 14} C ${cx + 43} ${cy - 24} ${cx + 35} ${cy - 32} ${cx + 42} ${cy - 39}`,
        "none",
        clay,
        3,
      ),
    ];
  }
  if (kind === "fire") {
    return [
      path(
        id("kiln"),
        `M ${cx - 44} ${cy + 37} L ${cx - 44} ${cy - 12} C ${cx - 44} ${cy - 43} ${cx + 44} ${cy - 43} ${cx + 44} ${cy - 12} L ${cx + 44} ${cy + 37}`,
        "none",
        blue,
        4,
      ),
      path(
        id("hearth"),
        `M ${cx - 43} ${cy + 37} L ${cx + 43} ${cy + 37}`,
        "none",
        blue,
        4,
      ),
      path(
        id("flame"),
        `M ${cx} ${cy + 30} C ${cx - 25} ${cy + 20} ${cx - 23} ${cy + 3} ${cx - 10} ${cy - 12} C ${cx - 9} ${cy + 1} ${cx - 3} ${cy + 4} ${cx} ${cy - 22} C ${cx + 25} ${cy - 3} ${cx + 25} ${cy + 19} ${cx} ${cy + 30} Z`,
        "#C75B38",
      ),
      path(
        id("flame-core"),
        `M ${cx} ${cy + 25} C ${cx - 10} ${cy + 19} ${cx - 7} ${cy + 8} ${cx + 1} ${cy + 1} C ${cx + 11} ${cy + 14} ${cx + 11} ${cy + 20} ${cx} ${cy + 25} Z`,
        "#F5BD78",
      ),
    ];
  }
  return [
    path(
      id("stem"),
      `M ${cx} ${cy + 5} L ${cx} ${cy + 35} M ${cx - 27} ${cy + 36} L ${cx + 27} ${cy + 36}`,
      "none",
      blue,
      4,
    ),
    path(
      id("shade"),
      `M ${cx - 10} ${cy - 29} L ${cx + 10} ${cy - 29} L ${cx + 33} ${cy + 2} L ${cx - 33} ${cy + 2} Z`,
      "#C87856",
      blue,
      3,
    ),
    circle(id("bulb"), cx, cy + 11, 5, "#E8A653"),
    path(
      id("ray-left"),
      `M ${cx - 40} ${cy - 18} L ${cx - 53} ${cy - 22}`,
      "none",
      clay,
      3,
    ),
    path(
      id("ray-right"),
      `M ${cx + 40} ${cy - 18} L ${cx + 53} ${cy - 22}`,
      "none",
      clay,
      3,
    ),
    path(id("ray-top"), `M ${cx} ${cy - 35} L ${cx} ${cy - 48}`, "none", clay, 3),
  ];
}

const stages = [
  {
    id: "shape",
    number: "01 / FORM",
    title: "Shape",
    body: "Hands shape the clay into a calm, balanced form.",
    x: 56,
    tone: "#E8EEE9",
  },
  {
    id: "dry",
    number: "02 / REST",
    title: "Dry",
    body: "Air leaves the body slowly before it enters the kiln.",
    x: 335,
    tone: "#F2E9DE",
  },
  {
    id: "fire",
    number: "03 / TRANSFORM",
    title: "Fire",
    body: "Heat hardens the body and sets its final surface.",
    x: 614,
    tone: "#F5E9DA",
  },
  {
    id: "finish",
    number: "04 / GLOW",
    title: "Finish",
    body: "Glaze, wiring and testing turn the form into light.",
    x: 893,
    tone: "#E8EEE9",
  },
];

function stageElements(stage) {
  const { x, id } = stage;
  return {
    id: `stage-${id}`,
    type: "group",
    semantic: {
      role: "content",
      conceptId: `process-${id}`,
      label: `${stage.title}: ${stage.body}`,
    },
    elements: [
      rect(`${id}-card`, x, 252, 251, 311, card, 18, hairline),
      rect(`${id}-top-rule`, x + 21, 345, 209, 1, hairline),
      label(
        `${id}-index`,
        stage.number,
        { x: x + 22, y: 271, width: 206, height: 21 },
        13,
        700,
        clay,
        "annotation",
        { letterSpacing: 1.1 },
      ),
      label(
        `${id}-title`,
        stage.title,
        { x: x + 21, y: 299, width: 209, height: 40 },
        30,
        700,
        ink,
      ),
      circle(`${id}-roundel`, x + 125.5, 405, 54, stage.tone),
      ...stageIcon(id, x + 125.5, 405),
      rect(`${id}-bottom-rule`, x + 21, 464, 209, 1, hairline),
      label(
        `${id}-body`,
        stage.body,
        { x: x + 21, y: 478, width: 209, height: 67 },
        16,
        400,
        muted,
        "content",
        { maximumLines: 3, lineHeight: 1.32 },
      ),
    ],
  };
}

const railNodes = stages.map((stage) =>
  circle(`rail-${stage.id}`, stage.x + 125.5, 599, 5.5, clay),
);
const railConnectors = stages.slice(0, -1).map((stage, index) => ({
  id: `flow-${stage.id}-${stages[index + 1].id}`,
  type: "connector",
  fromId: `rail-${stage.id}`,
  toId: `rail-${stages[index + 1].id}`,
  points: [
    { x: stage.x + 140, y: 599 },
    { x: stages[index + 1].x + 109, y: 599 },
  ],
  stroke: blue,
  strokeWidth: 2,
  markers: { start: "none", end: "arrow" },
  semantic: {
    role: "connector",
    label: `${stage.title} to ${stages[index + 1].title}`,
  },
}));

const scene = {
  schemaVersion: "1.0.0",
  id: "kilnform-how-the-light-is-made-v1",
  seed: "kilnform-process-diagram-2026-09-25-v1",
  dimensions: { width: 1200, height: 675 },
  title: "How the light is made",
  description:
    "An editorial process diagram for fictional ceramic lighting brand Kilnform. Four stages read left to right: Shape, Dry, Fire, Finish. Drawn symbols are schematic; process wording is general and requires production review.",
  backgroundColor: paper,
  assets: [],
  fonts: [400, 700].map((weight) => ({
    ...font(weight),
    sha256: "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
  })),
  elements: [
    circle("brand-mark-outer", 69, 63, 14, "none", clay, 2.5),
    path(
      "brand-mark-inner",
      "M 64 56 L 64 70 M 75 56 L 64 63 L 75 70",
      "none",
      clay,
      2.2,
    ),
    label(
      "brand-wordmark",
      "KILNFORM",
      { x: 93, y: 47, width: 190, height: 30 },
      18,
      700,
      ink,
      "annotation",
      { letterSpacing: 1.7 },
    ),
    label(
      "series-label",
      "ATELIER NOTES   /   01",
      { x: 918, y: 49, width: 226, height: 22 },
      13,
      700,
      clay,
      "annotation",
      { align: "right", letterSpacing: 1 },
    ),
    label(
      "headline",
      "How the light is made",
      { x: 56, y: 99, width: 1050, height: 83 },
      66,
      700,
      ink,
    ),
    label(
      "deck",
      "Four deliberate stages, from raw clay to a warm glow.",
      { x: 58, y: 185, width: 880, height: 34 },
      20,
      400,
      muted,
    ),
    rect("header-rule", 56, 230, 1088, 2, ink),
    ...stages.map(stageElements),
    ...railConnectors,
    ...railNodes,
    rect("footer-rule", 56, 628, 1088, 1, hairline),
    label(
      "footer-left",
      "EARTH  /  AIR  /  HEAT  /  LIGHT",
      { x: 56, y: 638, width: 510, height: 22 },
      12,
      700,
      blue,
      "annotation",
      { letterSpacing: 1.15 },
    ),
    label(
      "footer-right",
      "KILNFORM  ·  OBJECT 01 / CERAMIC TABLE LAMP",
      { x: 592, y: 638, width: 552, height: 22 },
      12,
      700,
      muted,
      "annotation",
      { align: "right", letterSpacing: 0.7 },
    ),
  ],
  readingOrder: [
    "brand-wordmark",
    "series-label",
    "headline",
    "deck",
    "stage-shape",
    "stage-dry",
    "stage-fire",
    "stage-finish",
    "footer-left",
    "footer-right",
  ],
  metadata: {
    purpose: "designer-stress-test",
    authoring: "reviewed-static-scene",
    subject: "fictional ceramic lighting process",
  },
};

const validation = validateSceneDocument(scene);
if (!validation.success) throw new Error(JSON.stringify(validation.problems, null, 2));
const result = await renderScene(scene, {
  formats: ["svg", "png"],
  creationTimestamp: "2026-09-25T00:00:00.000Z",
  reviewReadingOrder: true,
});
if (result.qualityIssues.length > 0) {
  throw new Error(
    `Scene review issues: ${JSON.stringify(result.qualityIssues, null, 2)}`,
  );
}

const files = [
  ["scene.json", Buffer.from(`${JSON.stringify(scene, null, 2)}\n`)],
  [
    "scene-evidence.json",
    Buffer.from(
      await prettier.format(JSON.stringify(result.evidence), {
        ...(await prettier.resolveConfig(
          fileURLToPath(new URL("scene-evidence.json", base)),
        )),
        parser: "json",
      }),
    ),
  ],
  ...result.outputs.flatMap((output) => [
    [`how-the-light-is-made.${output.format}`, Buffer.from(output.bytes)],
    [
      `how-the-light-is-made.${output.format}.manifest.json`,
      Buffer.from(`${JSON.stringify(output.manifest, null, 2)}\n`),
    ],
  ]),
];

for (const output of result.outputs) {
  const issues = verifySceneReproduction({
    document: scene,
    bytes: output.bytes,
    manifest: output.manifest,
  });
  if (issues.length > 0)
    throw new Error(`Reproduction failed: ${JSON.stringify(issues)}`);
}

for (const [name, bytes] of files) {
  const url = new URL(name, base);
  if (verify) {
    const committed = await readFile(url);
    if (!committed.equals(bytes)) throw new Error(`Stale artifact: ${name}`);
  } else {
    await writeFile(url, bytes);
  }
}

process.stdout.write(
  `${verify ? "Verified" : "Built"} Kilnform process scene: ${result.outputs.map((output) => `${output.format} ${output.manifest.output.sha256}`).join(", ")}; ${result.evidence.text.length} text records, ${result.qualityIssues.length} issues.\n`,
);
