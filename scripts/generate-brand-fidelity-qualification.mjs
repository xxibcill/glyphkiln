import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import * as fontkit from "fontkit";
import prettier from "prettier";

import {
  normalizeRasterColor,
  renderGraphic,
  sha256,
} from "../packages/glyphkiln-core/dist/index.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUALIFICATION_ROOT = resolve(
  REPOSITORY_ROOT,
  "docs/qualification/brand-fidelity-2026-08-18",
);
const ASSET_ROOT = resolve(QUALIFICATION_ROOT, "assets");
const GENERATED_ROOT = resolve(QUALIFICATION_ROOT, "generated");
const VERIFY = process.argv.includes("--verify");
const CREATION_TIMESTAMP = "2026-08-18T12:00:00.000Z";
const GOOGLE_FONTS_COMMIT = "e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7";

const paths = {
  inter: resolve(
    REPOSITORY_ROOT,
    "packages/glyphkiln-core/assets/fonts/Inter-Variable.ttf",
  ),
  fraunces: resolve(ASSET_ROOT, "fonts/fraunces/Fraunces-Variable.ttf"),
  spaceGrotesk: resolve(ASSET_ROOT, "fonts/space-grotesk/SpaceGrotesk-Variable.ttf"),
  kilnformImage: resolve(
    REPOSITORY_ROOT,
    "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png",
  ),
  kilnformLogo: resolve(
    REPOSITORY_ROOT,
    "packages/glyphkiln-core/examples/assets/kilnform-mark.png",
  ),
  morrowSource: resolve(ASSET_ROOT, "images/morrow-field-botanical-still-life.png"),
  morrowNormalized: resolve(
    ASSET_ROOT,
    "images/morrow-field-botanical-still-life.normalized.png",
  ),
  northlineSource: resolve(ASSET_ROOT, "images/northline-works-rain-commute.png"),
  northlineNormalized: resolve(
    ASSET_ROOT,
    "images/northline-works-rain-commute.normalized.png",
  ),
};

const fontBytes = {
  inter: new Uint8Array(await readFile(paths.inter)),
  fraunces: new Uint8Array(await readFile(paths.fraunces)),
  spaceGrotesk: new Uint8Array(await readFile(paths.spaceGrotesk)),
};

const logoSpecs = [
  {
    brandId: "morrow-field",
    name: "MORROW FIELD",
    font: fontBytes.fraunces,
    weight: 700,
    foreground: "#26382A",
    inverseForeground: "#F3EBDD",
    accent: "#B7673C",
    symbol: morrowFieldSymbol,
  },
  {
    brandId: "northline-works",
    name: "NORTHLINE WORKS",
    font: fontBytes.spaceGrotesk,
    weight: 700,
    foreground: "#162431",
    inverseForeground: "#EEF2F3",
    accent: "#E59C3A",
    symbol: northlineWorksSymbol,
  },
];

for (const spec of logoSpecs) {
  await generateLogoVariants(spec);
}

const normalizationEvidence = {
  morrow: await normalizeQualificationImage(paths.morrowSource, paths.morrowNormalized),
  northline: await normalizeQualificationImage(
    paths.northlineSource,
    paths.northlineNormalized,
  ),
};

const brands = await createBrandCases(normalizationEvidence);
const renderedCases = [];

for (const brand of brands) {
  for (const format of [
    "linkedin-landscape",
    "instagram-square",
    "instagram-portrait",
  ]) {
    const document = createDocument(brand, format);
    const caseName = `${brand.id}-${format}`;
    const result = await renderGraphic(document, {
      formats: ["svg", "png"],
      creationTimestamp: CREATION_TIMESTAMP,
      assets: brand.assets,
      fonts: brand.fonts,
    });
    assertQualificationResult(caseName, result);
    const documentPath = resolve(GENERATED_ROOT, "designs", `${caseName}.json`);
    await emit(
      documentPath,
      await prettier.format(JSON.stringify(result.document), { parser: "json" }),
    );

    const outputs = {};
    for (const output of result.outputs) {
      const outputPath = resolve(
        GENERATED_ROOT,
        "outputs",
        `${caseName}.${output.format}`,
      );
      await emit(outputPath, output.bytes);
      await emit(
        `${outputPath}.manifest.json`,
        `${JSON.stringify(output.manifest, null, 2)}\n`,
      );
      outputs[output.format] = {
        path: repositoryPath(outputPath),
        sha256: output.manifest.output.sha256,
        byteSize: output.bytes.byteLength,
        fingerprint: output.fingerprint,
      };
    }

    renderedCases.push({
      caseName,
      briefId: brand.briefId,
      brandId: brand.id,
      brandName: brand.name,
      format,
      documentPath: repositoryPath(documentPath),
      qualityIssues: result.qualityIssues,
      evidence: result.evidence,
      outputs,
    });
  }
}

const reviewBoard = createReviewBoard(renderedCases, fontBytes.inter);
const reviewBoardPng = renderSvg(reviewBoard, 2_400);
await emit(resolve(GENERATED_ROOT, "brand-fidelity-review-board.svg"), reviewBoard);
await emit(resolve(GENERATED_ROOT, "brand-fidelity-review-board.png"), reviewBoardPng);

const index = {
  version: "1.0.1",
  status: "awaiting-human-visual-approval",
  creationTimestamp: CREATION_TIMESTAMP,
  generator: repositoryPath(fileURLToPath(import.meta.url)),
  rendererContract: {
    designSchema: "1.4.0",
    template: "image-led-campaign@1.0.1",
    renderer: "0.4.0",
    manifest: "1.2.0",
  },
  sourcePolicy: {
    photography: "original OpenAI image generation with no embedded marks or text",
    logos: "deterministic project-authored SVG and PNG",
    fontRepository: "https://github.com/google/fonts",
    fontRepositoryCommit: GOOGLE_FONTS_COMMIT,
    fontLicense: "SIL Open Font License 1.1",
  },
  normalization: normalizationEvidence,
  brands: brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    briefId: brand.briefId,
    fontFamily: brand.fontFamily,
    image: brand.imageEvidence,
    logo: brand.logoEvidence,
  })),
  cases: renderedCases,
  reviewBoard: {
    svg: repositoryPath(resolve(GENERATED_ROOT, "brand-fidelity-review-board.svg")),
    png: repositoryPath(resolve(GENERATED_ROOT, "brand-fidelity-review-board.png")),
    sha256: sha256(reviewBoardPng),
  },
};
await emit(
  resolve(GENERATED_ROOT, "qualification-index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
);

process.stdout.write(
  `${VERIFY ? "Verified" : "Generated"} ${renderedCases.length.toString()} brand-fidelity cases and ${renderedCases.length.toString() * 2} exact outputs.\n`,
);
process.stdout.write(
  `Review board ${sha256(reviewBoardPng)} (${reviewBoardPng.byteLength.toString()} bytes).\n`,
);

async function normalizeQualificationImage(sourcePath, normalizedPath) {
  const sourceBytes = new Uint8Array(await readFile(sourcePath));
  const normalized = await normalizeRasterColor({
    bytes: sourceBytes,
    mimeType: "image/png",
  });
  await emit(normalizedPath, normalized.bytes);
  return {
    sourcePath: repositoryPath(sourcePath),
    normalizedPath: repositoryPath(normalizedPath),
    report: normalized.report,
  };
}

async function createBrandCases(normalization) {
  const kilnformImage = await resolvedAsset({
    id: "kilnform-lamp-campaign",
    path: paths.kilnformImage,
    width: 1_536,
    height: 1_024,
    sourceName: "Kilnform lamp campaign fixture",
    sourceReference:
      "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png",
  });
  const kilnformLogo = await resolvedAsset({
    id: "kilnform-mark",
    path: paths.kilnformLogo,
    width: 1_024,
    height: 1_024,
    sourceName: "Kilnform Kilnmaker Seal",
    sourceReference: "packages/glyphkiln-core/examples/assets/kilnform-mark.png",
  });
  const morrowLogoPath = resolve(ASSET_ROOT, "logos/morrow-field-symbol.png");
  const northlineLogoPath = resolve(ASSET_ROOT, "logos/northline-works-symbol.png");
  const morrowImage = await resolvedAsset({
    id: "morrow-field-botanical-still-life",
    path: paths.morrowNormalized,
    width: normalization.morrow.report.output.width,
    height: normalization.morrow.report.output.height,
    sourceName: "Morrow Field botanical still life, canonical sRGB admission",
    sourceReference:
      "docs/qualification/brand-fidelity-2026-08-18/assets/images/morrow-field-botanical-still-life.png",
  });
  const morrowLogo = await resolvedAsset({
    id: "morrow-field-mark",
    path: morrowLogoPath,
    width: 512,
    height: 512,
    sourceName: "Morrow Field deterministic symbol",
    sourceReference: repositoryPath(morrowLogoPath),
  });
  const northlineImage = await resolvedAsset({
    id: "northline-works-rain-commute",
    path: paths.northlineNormalized,
    width: normalization.northline.report.output.width,
    height: normalization.northline.report.output.height,
    sourceName: "Northline Works rain commute, canonical sRGB admission",
    sourceReference:
      "docs/qualification/brand-fidelity-2026-08-18/assets/images/northline-works-rain-commute.png",
  });
  const northlineLogo = await resolvedAsset({
    id: "northline-works-mark",
    path: northlineLogoPath,
    width: 512,
    height: 512,
    sourceName: "Northline Works deterministic symbol",
    sourceReference: repositoryPath(northlineLogoPath),
  });

  return [
    {
      id: "kilnform",
      name: "Kilnform",
      briefId: "brief-01-first-firing",
      fontFamily: "Inter",
      fontBytes: fontBytes.inter,
      fontWeights: [400, 700, 800],
      fonts: [],
      assets: [kilnformImage, kilnformLogo],
      image: kilnformImage,
      logo: kilnformLogo,
      imageEvidence: assetEvidence(kilnformImage),
      logoEvidence: assetEvidence(kilnformLogo),
      seed: "qualification-kilnform-first-firing",
      mode: "dark",
      treatment: "dark-scrim",
      focalPoint: { x: 0.68, y: 0.48 },
      copy: {
        eyebrow: "KILNFORM · SERIES 01",
        headline: "Fired into light.",
        subtitle: "Sculptural ceramic lighting with a point of view.",
        cta: "DISCOVER THE FIRST FIRING →",
      },
      brand: kilnformBrand(),
    },
    {
      id: "morrow-field",
      name: "Morrow Field",
      briefId: "brief-02-one-object-clearly-held",
      fontFamily: "Fraunces",
      fontBytes: fontBytes.fraunces,
      fontWeights: [400, 600, 700],
      fonts: resolvedFonts("Fraunces", fontBytes.fraunces, [400, 600, 700]),
      assets: [morrowImage, morrowLogo],
      image: morrowImage,
      logo: morrowLogo,
      imageEvidence: {
        ...assetEvidence(morrowImage),
        sourceSha256: normalization.morrow.report.source.sha256,
        normalizationPolicy: normalization.morrow.report.policyVersion,
      },
      logoEvidence: assetEvidence(morrowLogo),
      seed: "qualification-morrow-field-restorative",
      mode: "dark",
      treatment: "dark-scrim",
      focalPoint: { x: 0.5, y: 0.66 },
      copy: {
        eyebrow: "MORROW FIELD · BOTANICAL 02",
        headline: "A slower bright.",
        subtitle: "A concentrated botanical ritual for spacious mornings.",
        cta: "MEET THE RESTORATIVE OIL",
      },
      brand: morrowFieldBrand(),
    },
    {
      id: "northline-works",
      name: "Northline Works",
      briefId: "brief-02-one-object-clearly-held",
      fontFamily: "Space Grotesk",
      fontBytes: fontBytes.spaceGrotesk,
      fontWeights: [400, 500, 700],
      fonts: resolvedFonts("Space Grotesk", fontBytes.spaceGrotesk, [400, 500, 700]),
      assets: [northlineImage, northlineLogo],
      image: northlineImage,
      logo: northlineLogo,
      imageEvidence: {
        ...assetEvidence(northlineImage),
        sourceSha256: normalization.northline.report.source.sha256,
        normalizationPolicy: normalization.northline.report.policyVersion,
      },
      logoEvidence: assetEvidence(northlineLogo),
      seed: "qualification-northline-rain-shift",
      mode: "dark",
      treatment: "dark-scrim",
      focalPoint: { x: 0.72, y: 0.62 },
      copy: {
        eyebrow: "NORTHLINE WORKS · TRANSIT 04",
        headline: "Built for the weather between.",
        subtitle: "Sealed carry for wet platforms and last-mile rides.",
        cta: "SEE THE TRANSIT PACK",
      },
      brand: northlineWorksBrand(),
    },
  ];
}

function createDocument(brand, format) {
  const fontHash = sha256(brand.fontBytes);
  return {
    schemaVersion: "1.4.0",
    id: `qualification-${brand.id}-${format}`,
    template: { id: "image-led-campaign", version: "1.0.1" },
    format,
    seed: brand.seed,
    mode: brand.mode,
    brand: brand.brand,
    assets: [assetDeclaration(brand.image), assetDeclaration(brand.logo)],
    fonts: brand.fontWeights.map((weight) => ({
      family: brand.fontFamily,
      weight,
      style: "normal",
      sha256: fontHash,
    })),
    layers: [
      {
        id: "campaign-image",
        type: "image",
        assetId: brand.image.id,
        alt: `${brand.name} qualification campaign photograph.`,
        fit: "cover",
        focalPoint: brand.focalPoint,
        treatment: brand.treatment,
      },
      {
        id: "brand-mark",
        type: "logo",
        assetId: brand.logo.id,
        alt: `${brand.name} symbol.`,
        fit: "contain",
      },
      { id: "eyebrow", type: "eyebrow", text: brand.copy.eyebrow },
      { id: "headline", type: "headline", text: brand.copy.headline },
      { id: "subtitle", type: "subtitle", text: brand.copy.subtitle },
      { id: "cta", type: "cta", text: brand.copy.cta },
    ],
    metadata: {
      qualification: "brand-fidelity-2026-08-18",
      qualificationBriefId: brand.briefId,
      productAcceptance: "awaiting-human-visual-approval",
    },
  };
}

function assertQualificationResult(caseName, result) {
  if (result.qualityIssues.length > 0) {
    throw new Error(
      `${caseName} returned ${result.qualityIssues.length.toString()} quality issue(s).`,
    );
  }
  const safe = result.evidence.safeArea;
  for (const text of result.evidence.text) {
    if (text.overflow) {
      throw new Error(`${caseName} overflows text layer ${text.layerId}.`);
    }
    const insideSafeArea =
      text.bounds.x >= safe.x - 0.001 &&
      text.bounds.y >= safe.y - 0.001 &&
      text.bounds.x + text.bounds.width <= safe.x + safe.width + 0.001 &&
      text.bounds.y + text.bounds.height <= safe.y + safe.height + 0.001;
    if (!insideSafeArea) {
      throw new Error(
        `${caseName} places text layer ${text.layerId} outside safe area.`,
      );
    }
  }
  if (result.evidence.crops.length !== 1) {
    throw new Error(`${caseName} must record exactly one focal crop.`);
  }
  if (result.evidence.contrast.length !== result.evidence.text.length) {
    throw new Error(`${caseName} must record contrast for every text layer.`);
  }
  for (const contrast of result.evidence.contrast) {
    if (contrast.minimumRatio < contrast.minimumRequired) {
      throw new Error(
        `${caseName} fails contrast for ${contrast.layerId}: ${contrast.minimumRatio.toString()} < ${contrast.minimumRequired.toString()}.`,
      );
    }
  }
}

function kilnformBrand() {
  return {
    snapshotId: "brand-kilnform-qualification-2026-08",
    version: "1.0.0",
    name: "Kilnform",
    palette: {
      primary: "#0D3B9C",
      secondary: "#C85F27",
      accent: "#F3C879",
      neutrals: ["#15100D", "#FFF6E7", "#A77B5A"],
    },
    themes: {
      light: {
        background: "#FFF6E7",
        surface: "#F3E4CC",
        text: "#15100D",
        mutedText: "#5E4637",
      },
      dark: {
        background: "#15100D",
        surface: "#2B211C",
        text: "#FFF6E7",
        mutedText: "#F3E4CC",
      },
    },
    typography: typography("Inter", 800, 400, 700, 0.92, -0.03, 0.08),
    spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
    borderRadii: [0, 12, 24],
    visualDensity: "quiet",
    preferredProceduralStyles: ["layered-waves"],
    safeArea: { top: 0.08, right: 0.07, bottom: 0.08, left: 0.07 },
    prohibitedColors: [],
    prohibitedStyles: ["photorealistic-ai-composition"],
  };
}

function morrowFieldBrand() {
  return {
    snapshotId: "brand-morrow-field-qualification-2026-08",
    version: "1.0.0",
    name: "Morrow Field",
    palette: {
      primary: "#26382A",
      secondary: "#B7673C",
      accent: "#D8B45A",
      neutrals: ["#F3EBDD", "#D6CCB9", "#172219"],
    },
    themes: {
      light: {
        background: "#F3EBDD",
        surface: "#E5D9C4",
        text: "#172219",
        mutedText: "#405344",
      },
      dark: {
        background: "#172219",
        surface: "#26382A",
        text: "#F3EBDD",
        mutedText: "#D6CCB9",
      },
    },
    typography: typography("Fraunces", 700, 400, 600, 0.96, -0.015, 0.06),
    spacingScale: [4, 8, 12, 18, 26, 38, 56, 72],
    borderRadii: [0, 18, 36],
    visualDensity: "quiet",
    preferredProceduralStyles: ["layered-waves"],
    safeArea: { top: 0.085, right: 0.075, bottom: 0.085, left: 0.075 },
    prohibitedColors: ["#FF00FF"],
    prohibitedStyles: ["hard-neon", "high-gloss-plastic"],
  };
}

function northlineWorksBrand() {
  return {
    snapshotId: "brand-northline-works-qualification-2026-08",
    version: "1.0.0",
    name: "Northline Works",
    palette: {
      primary: "#162431",
      secondary: "#536B7A",
      accent: "#E59C3A",
      neutrals: ["#EEF2F3", "#AAB5BA", "#101820"],
    },
    themes: {
      light: {
        background: "#EEF2F3",
        surface: "#D9E0E3",
        text: "#101820",
        mutedText: "#40525C",
      },
      dark: {
        background: "#101820",
        surface: "#162431",
        text: "#EEF2F3",
        mutedText: "#BAC4C8",
      },
    },
    typography: typography("Space Grotesk", 700, 400, 500, 0.93, -0.025, 0.09),
    spacingScale: [4, 8, 12, 16, 24, 36, 52, 76],
    borderRadii: [0, 6, 12],
    visualDensity: "balanced",
    preferredProceduralStyles: ["topographic-contours"],
    safeArea: { top: 0.07, right: 0.06, bottom: 0.07, left: 0.06 },
    prohibitedColors: ["#FF00FF"],
    prohibitedStyles: ["ornamental-serif", "soft-pastel-wash"],
  };
}

function typography(
  family,
  displayWeight,
  bodyWeight,
  labelWeight,
  displayLineHeight,
  displayTracking,
  labelTracking,
) {
  return {
    headlineFamily: family,
    bodyFamily: family,
    monospaceFamily: family,
    roles: {
      display: {
        family,
        weight: displayWeight,
        lineHeight: displayLineHeight,
        tracking: displayTracking,
      },
      body: {
        family,
        weight: bodyWeight,
        lineHeight: 1.24,
        tracking: 0,
      },
      label: {
        family,
        weight: labelWeight,
        lineHeight: 1,
        tracking: labelTracking,
      },
    },
  };
}

async function resolvedAsset({ id, path, width, height, sourceName, sourceReference }) {
  const bytes = new Uint8Array(await readFile(path));
  return {
    id,
    mimeType: "image/png",
    sha256: sha256(bytes),
    width,
    height,
    origin: {
      kind: "generated",
      sourceName,
      sourceReference,
      generativeImageModel: sourceName.includes("deterministic")
        ? "deterministic project-authored vector"
        : "OpenAI image generation",
    },
    bytes,
  };
}

function assetDeclaration(asset) {
  const { bytes: _bytes, ...declaration } = asset;
  return declaration;
}

function assetEvidence(asset) {
  return {
    path: asset.origin.sourceReference,
    sha256: asset.sha256,
    byteSize: asset.bytes.byteLength,
    width: asset.width,
    height: asset.height,
  };
}

function resolvedFonts(family, bytes, weights) {
  const hash = sha256(bytes);
  return weights.map((weight) => ({
    family,
    weight,
    style: "normal",
    sha256: hash,
    bytes,
  }));
}

async function generateLogoVariants(spec) {
  const variants = [
    {
      name: "symbol",
      width: 512,
      height: 512,
      svg: logoSvg({ ...spec, variant: "symbol", width: 512, height: 512 }),
    },
    {
      name: "horizontal",
      width: 1_200,
      height: 320,
      svg: logoSvg({ ...spec, variant: "horizontal", width: 1_200, height: 320 }),
    },
    {
      name: "monochrome",
      width: 512,
      height: 512,
      svg: logoSvg({
        ...spec,
        variant: "monochrome",
        width: 512,
        height: 512,
      }),
    },
  ];
  for (const variant of variants) {
    const basePath = resolve(ASSET_ROOT, "logos", `${spec.brandId}-${variant.name}`);
    await emit(`${basePath}.svg`, variant.svg);
    await emit(`${basePath}.png`, renderSvg(variant.svg, variant.width));
  }
}

function logoSvg(spec) {
  const monochrome = spec.variant === "monochrome";
  const foreground =
    spec.variant === "symbol" ? spec.inverseForeground : spec.foreground;
  const symbol = spec.symbol({
    foreground,
    accent: monochrome ? foreground : spec.accent,
  });
  const horizontal = spec.variant === "horizontal";
  const wordmark = horizontal
    ? `<path d="${outlineText(spec.font, spec.name, {
        x: 330,
        baseline: 188,
        fontSize: 72,
        weight: spec.weight,
        letterSpacing: 5,
      })}" fill="${spec.foreground}"/>`
    : "";
  const symbolTransform = horizontal
    ? 'transform="translate(42 34) scale(0.4921875)"'
    : "";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`,
    `<g ${symbolTransform}>${symbol}</g>`,
    wordmark,
    "</svg>",
    "",
  ].join("\n");
}

function morrowFieldSymbol({ foreground, accent }) {
  return [
    `<path d="M112 420V224C112 126 170 64 256 64s144 62 144 160v196h-58V226c0-62-32-104-86-104s-86 42-86 104v194z" fill="${foreground}"/>`,
    `<path d="M256 166c-54 22-82 63-82 120 48-8 78-32 92-74 7 42 32 70 76 84 5-60-24-104-86-130z" fill="${accent}"/>`,
    `<circle cx="256" cy="357" r="31" fill="${accent}"/>`,
  ].join("");
}

function northlineWorksSymbol({ foreground, accent }) {
  return [
    `<path d="M256 48 438 153v210L256 468 74 363V153zm0 68-123 71v142l123 71 123-71V187z" fill="${foreground}"/>`,
    `<path d="M158 334V178h58l80 91v-91h58v156h-54l-84-95v95z" fill="${foreground}"/>`,
    `<path d="m256 90 35 61h-70z" fill="${accent}"/>`,
  ].join("");
}

function outlineText(bytes, text, options) {
  const created = fontkit.create(Buffer.from(bytes));
  if (!("layout" in created)) throw new Error("Expected a single font face.");
  const face =
    created.variationAxes.wght === undefined
      ? created
      : created.getVariation({ wght: options.weight });
  const run = face.layout(text);
  const scale = options.fontSize / face.unitsPerEm;
  let penX = options.x;
  const paths = [];
  for (const [index, glyph] of run.glyphs.entries()) {
    const position = run.positions[index];
    paths.push(
      serializePath(
        glyph.path.commands,
        scale,
        penX + position.xOffset * scale,
        options.baseline - position.yOffset * scale,
      ),
    );
    penX += position.xAdvance * scale + options.letterSpacing;
  }
  return paths.join(" ");
}

function serializePath(commands, scale, offsetX, offsetY) {
  return commands
    .map((command) => {
      const points = command.args.map((value, index) =>
        coordinate(index % 2 === 0 ? offsetX + value * scale : offsetY - value * scale),
      );
      switch (command.command) {
        case "moveTo":
          return `M ${points.join(" ")}`;
        case "lineTo":
          return `L ${points.join(" ")}`;
        case "quadraticCurveTo":
          return `Q ${points.join(" ")}`;
        case "bezierCurveTo":
          return `C ${points.join(" ")}`;
        case "closePath":
          return "Z";
        default:
          throw new Error(`Unsupported path command ${command.command}.`);
      }
    })
    .join(" ");
}

function coordinate(value) {
  const rounded = Math.round(value * 1_000) / 1_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function createReviewBoard(cases, labelFont) {
  const rows = ["kilnform", "morrow-field", "northline-works"];
  const formats = ["linkedin-landscape", "instagram-square", "instagram-portrait"];
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2400" height="2200" viewBox="0 0 2400 2200">',
    '<rect width="2400" height="2200" fill="#111315"/>',
    `<path d="${outlineText(labelFont, "BRAND FIDELITY / VISUAL REVIEW", {
      x: 100,
      baseline: 120,
      fontSize: 54,
      weight: 700,
      letterSpacing: 3,
    })}" fill="#F4F1E8"/>`,
  ];
  rows.forEach((brandId, rowIndex) => {
    const brandCases = cases.filter((entry) => entry.brandId === brandId);
    const brandName = brandCases[0].brandName.toUpperCase();
    const rowY = 210 + rowIndex * 650;
    parts.push(
      `<path d="${outlineText(labelFont, brandName, {
        x: 100,
        baseline: rowY + 48,
        fontSize: 38,
        weight: 700,
        letterSpacing: 2,
      })}" fill="#C8C5BC"/>`,
    );
    formats.forEach((format, columnIndex) => {
      const entry = brandCases.find((candidate) => candidate.format === format);
      const pngPath = resolve(REPOSITORY_ROOT, entry.outputs.png.path);
      const data = readFileSyncForBoard(pngPath);
      const x = 100 + columnIndex * 760;
      const y = rowY + 85;
      const width = 700;
      const height = 500;
      parts.push(
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#23272A"/>`,
        `<image x="${x + 16}" y="${y + 16}" width="${width - 32}" height="${height - 70}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data}"/>`,
        `<path d="${outlineText(labelFont, format.toUpperCase(), {
          x: x + 20,
          baseline: y + height - 17,
          fontSize: 22,
          weight: 500,
          letterSpacing: 1.5,
        })}" fill="#9DA3A5"/>`,
      );
    });
  });
  parts.push("</svg>", "");
  return parts.join("\n");
}

function readFileSyncForBoard(path) {
  return readFileSync(path).toString("base64");
}

function renderSvg(svg, width) {
  return new Uint8Array(
    new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng(),
  );
}

async function emit(path, value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  if (VERIFY) {
    const current = new Uint8Array(await readFile(path));
    if (!Buffer.from(current).equals(Buffer.from(bytes))) {
      throw new Error(`${repositoryPath(path)} does not match generated bytes.`);
    }
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function repositoryPath(path) {
  return relative(REPOSITORY_ROOT, path).replaceAll("\\", "/");
}
