// Renders the Thai + Latin font specimen with Glyphkiln Core.
// Usage, after building Core: node docs/research/thai-latin-fonts-2026-11/specimen.mjs <fontDir> <outPng>
// <fontDir> holds the Google Fonts files listed in the README (not committed).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { renderScene } from "../../../packages/glyphkiln-core/dist/scene/index.js";

const [dir, out] = process.argv.slice(2);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rows = [
  [
    "IBM Plex Sans Thai",
    "IBMPlexSansThai-Bold.ttf",
    700,
    "IBMPlexSansThai-Regular.ttf",
    400,
    "Sans · workhorse",
  ],
  [
    "IBM Plex Sans Thai Looped",
    "IBMPlexSansThaiLooped-Bold.ttf",
    700,
    "IBMPlexSansThaiLooped-Regular.ttf",
    400,
    "Sans · looped (formal)",
  ],
  [
    "Noto Sans Thai",
    "NotoSansThai[wdth,wght].ttf",
    800,
    "NotoSansThai[wdth,wght].ttf",
    400,
    "Sans · variable 100–900",
  ],
  [
    "Anuphan",
    "Anuphan[wght].ttf",
    700,
    "Anuphan[wght].ttf",
    400,
    "Sans · variable 100–700",
  ],
  [
    "Sarabun",
    "Sarabun-Bold.ttf",
    700,
    "Sarabun-Regular.ttf",
    400,
    "Sans · looped body, italics",
  ],
  [
    "Kanit",
    "Kanit-Black.ttf",
    900,
    "Kanit-Regular.ttf",
    400,
    "Display sans · 9 weights, italics",
  ],
  [
    "Prompt",
    "Prompt-ExtraBold.ttf",
    800,
    "Prompt-Regular.ttf",
    400,
    "Display sans · geometric, italics",
  ],
  [
    "Chakra Petch",
    "ChakraPetch-Bold.ttf",
    700,
    "ChakraPetch-Regular.ttf",
    400,
    "Technical / square, italics",
  ],
  ["Mitr", "Mitr-SemiBold.ttf", 600, "Mitr-Regular.ttf", 400, "Friendly / soft"],
  [
    "Trirong",
    "Trirong-Bold.ttf",
    700,
    "Trirong-Regular.ttf",
    400,
    "Serif · looped, 9 weights, italics",
  ],
  [
    "Taviraj",
    "Taviraj-Bold.ttf",
    700,
    "Taviraj-Regular.ttf",
    400,
    "Serif · high contrast, italics",
  ],
  [
    "Noto Serif Thai",
    "NotoSerifThai[wdth,wght].ttf",
    700,
    "NotoSerifThai[wdth,wght].ttf",
    400,
    "Serif · variable 100–900",
  ],
  [
    "Chonburi",
    "Chonburi-Regular.ttf",
    400,
    "Chonburi-Regular.ttf",
    400,
    "Display serif · one weight",
  ],
];
const fonts = new Map();
const addFont = (family, file, weight) => {
  const key = `${family}|${weight}`;
  if (fonts.has(key)) return;
  const bytes = new Uint8Array(readFileSync(dir + "/" + file));
  fonts.set(key, { family, weight, style: "normal", bytes, sha256: sha(bytes) });
};
const ROW = 200,
  W = 1800,
  TOP = 110;
const elements = [
  {
    type: "text",
    id: "sheet-heading",
    text: "Free Thai + Latin fonts — Glyphkiln render",
    box: { x: 60, y: 36, width: 1680, height: 50 },
    font: { family: "Inter", weight: 700, style: "normal" },
    fit: {
      preferredFontSize: 38,
      minimumFontSize: 38,
      maximumLines: 1,
      lineHeight: 1.2,
      align: "left",
    },
    fill: "#15100D",
    textMode: "outline",
    semantic: { role: "content" },
  },
];
rows.forEach(([family, boldFile, boldW, regFile, regW, note], i) => {
  addFont(family, boldFile, boldW);
  addFont(family, regFile, regW);
  const y = TOP + i * ROW;
  elements.push(
    {
      type: "rect",
      id: `rule-${i}`,
      x: 60,
      y: y - 6,
      width: 1680,
      height: 1,
      fill: "#D9CEC1",
    },
    {
      type: "text",
      id: `label-${i}`,
      text: `${family} — ${note}`,
      box: { x: 60, y: y + 6, width: 1680, height: 34 },
      font: { family: "Inter", weight: 600, style: "normal" },
      fit: {
        preferredFontSize: 22,
        minimumFontSize: 22,
        maximumLines: 1,
        lineHeight: 1.2,
        align: "left",
      },
      fill: "#A34F37",
      textMode: "outline",
      semantic: { role: "content" },
    },
    {
      type: "text",
      id: `display-${i}`,
      text: "วางแผน AI Pilot ให้ชัด ก่อนลงมือทำจริง",
      box: { x: 60, y: y + 44, width: 1680, height: 86 },
      font: { family, weight: boldW, style: "normal" },
      fit: {
        preferredFontSize: 56,
        minimumFontSize: 56,
        maximumLines: 1,
        lineHeight: 1.35,
        align: "left",
      },
      fill: "#15100D",
      textMode: "outline",
      semantic: { role: "content" },
    },
    {
      type: "text",
      id: `body-${i}`,
      text: "สมุดบันทึก A5 · 80 หน้าไม่มีเส้น · 120 บาท (ไม่รวมค่าจัดส่ง) — Clay to glow. 0123456789",
      box: { x: 60, y: y + 134, width: 1680, height: 52 },
      font: { family, weight: regW, style: "normal" },
      fit: {
        preferredFontSize: 30,
        minimumFontSize: 30,
        maximumLines: 1,
        lineHeight: 1.35,
        align: "left",
      },
      fill: "#3B3430",
      textMode: "outline",
      semantic: { role: "content" },
    },
  );
});
const interSha = "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031";
const declared = [
  { family: "Inter", weight: 600, style: "normal", sha256: interSha },
  { family: "Inter", weight: 700, style: "normal", sha256: interSha },
  ...[...fonts.values()].map(({ family, weight, style, sha256 }) => ({
    family,
    weight,
    style,
    sha256,
  })),
];
const scene = {
  schemaVersion: "1.0.0",
  id: "thai-latin-font-specimen",
  seed: "thai-latin-font-specimen",
  dimensions: { width: W, height: TOP + rows.length * ROW + 30 },
  title: "Thai and Latin font specimen",
  description: "Specimen of free Thai+Latin fonts",
  backgroundColor: "#FFFCF7",
  assets: [],
  fonts: declared,
  readingOrder: elements.filter((e) => e.type === "text").map((e) => e.id),
  elements,
};
const result = await renderScene(scene, {
  formats: ["png"],
  fonts: [...fonts.values()],
  creationTimestamp: "2026-11-04T00:00:00.000Z",
});
writeFileSync(out, result.outputs[0].bytes);
console.log(
  "issues:",
  JSON.stringify(
    result.qualityIssues.map((q) => [q.code, q.details?.elementId ?? q.layerId]),
  ),
);
