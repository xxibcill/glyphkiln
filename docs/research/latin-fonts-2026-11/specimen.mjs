// Renders the Latin font specimen with Glyphkiln Core.
// Usage, after building Core: node docs/research/latin-fonts-2026-11/specimen.mjs <fontDir> <outDir>
// Writes specimen-sans.png and specimen-serif.png (a scene allows at most 32 fonts).
// <fontDir> holds the Google Fonts files listed in the README (not committed).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { renderScene } from "../../../packages/glyphkiln-core/dist/scene/index.js";

const [dir, outDir] = process.argv.slice(2);
const sha = (b) => createHash("sha256").update(b).digest("hex");
// [family, display file, display weight, text file, text weight, label]
const rows = [
  ["Inter", null, 800, null, 400, "Grotesk sans · bundled today"],
  [
    "IBM Plex Sans",
    "IBMPlexSans[wdth,wght].ttf",
    700,
    "IBMPlexSans[wdth,wght].ttf",
    400,
    "Grotesk sans · pairs with IBM Plex Sans Thai",
  ],
  ["Geist", "Geist[wght].ttf", 700, "Geist[wght].ttf", 400, "Neo-grotesk sans"],
  [
    "Schibsted Grotesk",
    "SchibstedGrotesk[wght].ttf",
    800,
    "SchibstedGrotesk[wght].ttf",
    400,
    "Editorial grotesk",
  ],
  [
    "Space Grotesk",
    "SpaceGrotesk[wght].ttf",
    700,
    "SpaceGrotesk[wght].ttf",
    400,
    "Quirky grotesk",
  ],
  [
    "Bricolage Grotesque",
    "BricolageGrotesque[opsz,wdth,wght].ttf",
    800,
    "BricolageGrotesque[opsz,wdth,wght].ttf",
    400,
    "Characterful grotesk · opsz fixed at 96",
  ],
  [
    "Barlow Condensed",
    "BarlowCondensed-ExtraBold.ttf",
    800,
    "BarlowCondensed-Regular.ttf",
    400,
    "Condensed · 9 weights, italics",
  ],
  [
    "Archivo Narrow",
    "ArchivoNarrow[wght].ttf",
    700,
    "ArchivoNarrow[wght].ttf",
    400,
    "Narrow sans",
  ],
  [
    "Anton",
    "Anton-Regular.ttf",
    400,
    "Anton-Regular.ttf",
    400,
    "Condensed display · one weight",
  ],
  [
    "Bebas Neue",
    "BebasNeue-Regular.ttf",
    400,
    "BebasNeue-Regular.ttf",
    400,
    "Condensed caps display · one weight",
  ],
  [
    "Instrument Serif",
    "InstrumentSerif-Regular.ttf",
    400,
    "InstrumentSerif-Regular.ttf",
    400,
    "Condensed display serif · one weight + italic",
  ],
  [
    "DM Serif Display",
    "DMSerifDisplay-Regular.ttf",
    400,
    "DMSerifDisplay-Regular.ttf",
    400,
    "High-contrast display serif",
  ],
  [
    "Playfair Display",
    "PlayfairDisplay[wght].ttf",
    800,
    "PlayfairDisplay[wght].ttf",
    400,
    "Didone display serif · italics",
  ],
  [
    "Fraunces",
    "Fraunces[SOFT,WONK,opsz,wght].ttf",
    700,
    "Fraunces[SOFT,WONK,opsz,wght].ttf",
    400,
    "Soft display serif · opsz fixed at 9",
  ],
  [
    "Young Serif",
    "YoungSerif-Regular.ttf",
    400,
    "YoungSerif-Regular.ttf",
    400,
    "Heavy old-style serif · one weight",
  ],
  [
    "Gloock",
    "Gloock-Regular.ttf",
    400,
    "Gloock-Regular.ttf",
    400,
    "Bold display serif · one weight",
  ],
  [
    "Source Serif 4",
    "SourceSerif4[opsz,wght].ttf",
    700,
    "SourceSerif4[opsz,wght].ttf",
    400,
    "Text serif · small caps, old-style figures",
  ],
  [
    "Newsreader",
    "Newsreader[opsz,wght].ttf",
    700,
    "Newsreader[opsz,wght].ttf",
    400,
    "News text serif",
  ],
  [
    "IBM Plex Serif",
    "IBMPlexSerif-Bold.ttf",
    700,
    "IBMPlexSerif-Regular.ttf",
    400,
    "Text serif · pairs with Plex",
  ],
  [
    "Spectral",
    "Spectral-Bold.ttf",
    700,
    "Spectral-Regular.ttf",
    400,
    "Screen text serif · small caps",
  ],
  [
    "EB Garamond",
    "EBGaramond[wght].ttf",
    700,
    "EBGaramond[wght].ttf",
    400,
    "Classical serif · small caps",
  ],
  [
    "IBM Plex Mono",
    "IBMPlexMono-Bold.ttf",
    700,
    "IBMPlexMono-Regular.ttf",
    400,
    "Mono · pairs with Plex",
  ],
  [
    "JetBrains Mono",
    "JetBrainsMono[wght].ttf",
    700,
    "JetBrainsMono[wght].ttf",
    400,
    "Mono",
  ],
  ["Geist Mono", "GeistMono[wght].ttf", 700, "GeistMono[wght].ttf", 400, "Mono"],
];
async function renderSheet(rows, heading, out) {
  const fonts = new Map();
  const addFont = (family, file, weight) => {
    if (file === null) return;
    const key = `${family}|${weight}`;
    if (fonts.has(key)) return;
    const bytes = new Uint8Array(readFileSync(dir + "/" + file));
    fonts.set(key, { family, weight, style: "normal", bytes, sha256: sha(bytes) });
  };
  const ROW = 176,
    W = 1800,
    TOP = 110;
  const text = (id, value, x, y, w, h, family, weight, size, fill) => ({
    type: "text",
    id,
    text: value,
    box: { x, y, width: w, height: h },
    font: { family, weight, style: "normal" },
    fit: {
      preferredFontSize: size,
      minimumFontSize: size,
      maximumLines: 1,
      lineHeight: 1.25,
      align: "left",
    },
    fill,
    textMode: "outline",
    semantic: { role: "content" },
  });
  const elements = [
    text("sheet-heading", heading, 60, 36, 1680, 50, "Inter", 700, 38, "#15100D"),
  ];
  rows.forEach(
    ([family, displayFile, displayWeight, textFile, textWeight, note], i) => {
      addFont(family, displayFile, displayWeight);
      addFont(family, textFile, textWeight);
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
        text(
          `label-${i}`,
          `${family} — ${note}`,
          60,
          y + 4,
          1680,
          32,
          "Inter",
          600,
          22,
          "#A34F37",
        ),
        text(
          `display-${i}`,
          "Clay to glow. Make room.",
          60,
          y + 38,
          1680,
          78,
          family,
          displayWeight,
          58,
          "#15100D",
        ),
        text(
          `body-${i}`,
          "The Studio Lamp returns in cobalt ceramic — 120 THB, 3 places, 1,240 g. 0123456789",
          60,
          y + 118,
          1680,
          48,
          family,
          textWeight,
          28,
          "#3B3430",
        ),
      );
    },
  );
  const interSha = "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031";
  const interDecl = [400, 600, 700, 800].map((weight) => ({
    family: "Inter",
    weight,
    style: "normal",
    sha256: interSha,
  }));
  const scene = {
    schemaVersion: "1.0.0",
    id: "latin-font-specimen",
    seed: "latin-font-specimen",
    dimensions: { width: W, height: TOP + rows.length * ROW + 30 },
    title: "Latin font specimen",
    description: "Specimen of free Latin fonts",
    backgroundColor: "#FFFCF7",
    assets: [],
    fonts: [
      ...interDecl,
      ...[...fonts.values()].map(({ family, weight, style, sha256 }) => ({
        family,
        weight,
        style,
        sha256,
      })),
    ],
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
    out,
    "issues:",
    JSON.stringify(
      result.qualityIssues.map((q) => [q.code, q.details?.elementId ?? q.layerId]),
    ),
  );
}

const isSerif = (row) =>
  /serif|Serif|Garamond|Gloock|Spectral|Newsreader|Fraunces|Playfair/.test(
    row[0] + row[5],
  ) && !/Sans/.test(row[0]);
await renderSheet(
  rows.filter((row) => !isSerif(row)),
  "Free Latin fonts: sans, condensed, mono — Glyphkiln render",
  `${outDir}/specimen-sans.png`,
);
await renderSheet(
  [rows[0], ...rows.filter(isSerif)],
  "Free Latin fonts: serif — Glyphkiln render",
  `${outDir}/specimen-serif.png`,
);
