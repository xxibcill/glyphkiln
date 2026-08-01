import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";

import { FontRegistry } from "../dist/fonts/index.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const verify = process.argv.includes("--verify");
const cobalt = "#0D3B9C";
const ink = "#111111";

const kilnmakerCutout =
  "M 150 398 V 220 A 106 106 0 0 1 256 114 H 274 V 238 L 430 166 L 456 222 L 318 284 L 456 350 L 428 406 L 274 333 V 398 Z";

const fonts = new FontRegistry();
const wordmark = fonts.outlineText({
  lines: ["KILNFORM"],
  family: "Inter",
  weight: 700,
  style: "normal",
  fontSize: 122,
  lineHeight: 1,
  x: 390,
  y: 110,
  align: "left",
  letterSpacing: 12,
})[0];

if (wordmark === undefined) throw new Error("Kilnform wordmark outline is missing.");

const symbolSvg = createSymbolSvg(cobalt);
const horizontalSvg = createHorizontalSvg(cobalt);
const monochromeSvg = createHorizontalSvg(ink, "Kilnform monochrome seal");
const symbolPng = renderPng(symbolSvg, 1_024);
const horizontalPng = renderPng(horizontalSvg, 2_000);
const monochromePng = renderPng(monochromeSvg, 2_000);

assertTransparentPng(symbolPng, "symbol");
assertTransparentPng(horizontalPng, "horizontal");
assertTransparentPng(monochromePng, "monochrome");

const outputs = [
  [resolve(packageRoot, "examples/assets/kilnform-mark.png"), symbolPng],
  [resolve(repositoryRoot, "Deliverables/svg/kilnform-seal-symbol.svg"), symbolSvg],
  [
    resolve(repositoryRoot, "Deliverables/svg/kilnform-seal-horizontal.svg"),
    horizontalSvg,
  ],
  [
    resolve(repositoryRoot, "Deliverables/svg/kilnform-seal-monochrome.svg"),
    monochromeSvg,
  ],
  [resolve(repositoryRoot, "Deliverables/png/kilnform-seal-symbol.png"), symbolPng],
  [
    resolve(repositoryRoot, "Deliverables/png/kilnform-seal-horizontal.png"),
    horizontalPng,
  ],
  [
    resolve(repositoryRoot, "Deliverables/png/kilnform-seal-monochrome.png"),
    monochromePng,
  ],
];

for (const [path, bytes] of outputs) await writeOrVerify(path, bytes);

process.stdout.write(
  `${verify ? "Verified" : "Generated"} Kilnmaker Seal symbol, horizontal, and monochrome identity files.\n`,
);

function createSymbolSvg(color) {
  return `${svgStart("0 0 512 512", "Kilnform Kilnmaker Seal")}${sealMarkup(color, "symbol")}\n</svg>\n`;
}

function createHorizontalSvg(
  color,
  title = "Kilnform Kilnmaker Seal horizontal lockup",
) {
  return `${svgStart("0 0 1200 360", title)}
  <g transform="translate(32 32) scale(0.578125)">${sealMarkup(color, "lockup")}</g>
  <path d="${wordmark}" fill="${color}" aria-label="KILNFORM"/>
</svg>\n`;
}

function svgStart(viewBox, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">A circular maker seal with a kiln doorway and a cut-out K aperture.</desc>`;
}

function sealMarkup(color, suffix) {
  return `
    <defs>
      <mask id="kilnmaker-cutout-${suffix}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#FFFFFF"/>
        <path d="${kilnmakerCutout}" fill="#000000"/>
      </mask>
    </defs>
    <circle cx="256" cy="256" r="220" fill="${color}" mask="url(#kilnmaker-cutout-${suffix})"/>`;
}

function renderPng(svg, width) {
  return Buffer.from(
    new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng(),
  );
}

function assertTransparentPng(bytes, label) {
  const decoded = PNG.sync.read(bytes, { checkCRC: true });
  const cornerAlpha = [
    decoded.data[3],
    decoded.data[(decoded.width - 1) * 4 + 3],
    decoded.data[(decoded.height - 1) * decoded.width * 4 + 3],
    decoded.data[(decoded.width * decoded.height - 1) * 4 + 3],
  ];
  if (cornerAlpha.some((alpha) => alpha !== 0)) {
    throw new Error(`Kilnform ${label} PNG corners must be transparent.`);
  }
  let opaquePixels = 0;
  for (let offset = 3; offset < decoded.data.length; offset += 4) {
    if (decoded.data[offset] === 255) opaquePixels += 1;
  }
  if (opaquePixels < decoded.width * decoded.height * 0.1) {
    throw new Error(`Kilnform ${label} PNG has insufficient opaque artwork.`);
  }
}

async function writeOrVerify(path, bytes) {
  const expected = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8");
  if (verify) {
    const actual = await readFile(path);
    if (!actual.equals(expected)) throw new Error(`${path} is stale.`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, expected);
}
