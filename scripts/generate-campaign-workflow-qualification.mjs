import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  canonicalJson,
  createCampaignCanvasKey,
  createCarouselDeliverySidecar,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
  hashCanonical,
  renderGraphic,
  reviewCarouselSequence,
  sha256,
} from "../packages/glyphkiln-core/dist/index.js";
import {
  campaignHandoffCanvasPrefix,
  campaignHandoffJsonFile,
  campaignHandoffSequencePrefix,
  createCampaignHandoffCanvasFiles,
  encodeCampaignHandoff,
} from "../apps/glyphkiln-app/src/server/app-workflow/campaign-handoff-format.mjs";
import {
  createQualificationEmitter,
  outlineText,
  renderSvg,
} from "./qualification-output.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUALIFICATION_ROOT = resolve(
  REPOSITORY_ROOT,
  "docs/qualification/campaign-workflow-2026-08-18",
);
const BRAND_ROOT = resolve(REPOSITORY_ROOT, "assets/brand/glyphkiln");
const ASSET_ROOT = resolve(QUALIFICATION_ROOT, "assets");
const GENERATED_ROOT = resolve(QUALIFICATION_ROOT, "generated");
const DELIVERABLE_ROOT = resolve(
  REPOSITORY_ROOT,
  "Deliverables/campaigns/glyphkiln-core-0-6-launch",
);
const VERIFY = process.argv.includes("--verify");
const { emit, repositoryPath } = createQualificationEmitter({
  repositoryRoot: REPOSITORY_ROOT,
  verify: VERIFY,
});
const CREATION_TIMESTAMP = "2026-08-18T14:00:00.000Z";
const APPROVAL_TIMESTAMP = "2026-08-19T14:09:22.000Z";
const APPROVER = Object.freeze({
  id: "project-owner",
  email: "project-owner@glyphkiln.invalid",
  displayName: "Project owner",
});
const CAMPAIGN_ID = "campaign-glyphkiln-core-0-6-launch";
const DIRECTION_ID = "direction-proof-not-promises";
const DIRECTION_KEY = "proof-not-promises";
const CAMPAIGN_SEED = "glyphkiln-core-0-6-launch-2026-08";
const HANDOFF_FILENAME = "glyphkiln-core-0-6-launch-proof-not-promises.gk-handoff.json";
const QUALIFICATION_SOURCE_URL =
  "https://github.com/xxibcill/glyphkiln/blob/main/docs/qualification/campaign-workflow-2026-08-18/README.md";

const paths = {
  inter: resolve(
    REPOSITORY_ROOT,
    "packages/glyphkiln-core/assets/fonts/Inter-Variable.ttf",
  ),
  logoSvg: resolve(BRAND_ROOT, "glyphkiln-mark-on-ivory.svg"),
  logoTransparentSvg: resolve(BRAND_ROOT, "glyphkiln-mark.svg"),
  logoPng: resolve(ASSET_ROOT, "glyphkiln-mark.png"),
  proofWallSvg: resolve(ASSET_ROOT, "glyphkiln-proof-wall.svg"),
  proofWallPng: resolve(ASSET_ROOT, "glyphkiln-proof-wall.png"),
};

const interBytes = new Uint8Array(await readFile(paths.inter));
const interHash = sha256(interBytes);

const logoSvgBytes = new Uint8Array(await readFile(paths.logoSvg));
const logoTransparentSvgBytes = new Uint8Array(
  await readFile(paths.logoTransparentSvg),
);
const logoSvg = new TextDecoder().decode(logoSvgBytes);
const logoPng = renderSvg(logoSvg, 1_024);
await emit(paths.logoPng, logoPng);

const proofWallSvg = createProofWall();
const proofWallPng = renderSvg(proofWallSvg, 1_536);
await emit(paths.proofWallSvg, proofWallSvg);
await emit(paths.proofWallPng, proofWallPng);

const logoAsset = resolvedAsset({
  id: "glyphkiln-mark",
  bytes: logoPng,
  width: 1_024,
  height: 1_024,
  sourceName: "Glyphkiln deterministic campaign mark",
  sourceReference: repositoryPath(paths.logoSvg),
});
const proofWallAsset = resolvedAsset({
  id: "glyphkiln-proof-wall",
  bytes: proofWallPng,
  width: 1_536,
  height: 1_024,
  sourceName: "Glyphkiln deterministic product-proof artwork",
  sourceReference: repositoryPath(paths.proofWallPng),
});

const canvasSpecs = [
  imageLedCanvas(
    "linkedin-hero",
    "linkedin-landscape",
    "LinkedIn landscape launch hero",
  ),
  imageLedCanvas(
    "instagram-square-hero",
    "instagram-square",
    "Instagram square launch hero",
  ),
  imageLedCanvas(
    "instagram-portrait-hero",
    "instagram-portrait",
    "Instagram portrait launch hero",
  ),
  carouselCanvas("carousel-01", 1, {
    eyebrow: "GLYPHKILN / PROOF 01",
    headline: "Same brief. Different pixels?",
    subtitle:
      "Not here. Glyphkiln pins the document, seed, font, renderer, and inputs.",
    cta: "SWIPE FOR THE CONTRACT →",
  }),
  carouselCanvas("carousel-02", 2, {
    eyebrow: "GLYPHKILN / INPUT 02",
    headline: "Inputs remain\nexplicit data.",
    subtitle: "Brand, assets, type, copy, composition, and seed remain explicit data.",
    cta: "KEEP THE INPUTS PINNED →",
  }),
  carouselCanvas("carousel-03", 3, {
    eyebrow: "GLYPHKILN / OUTPUT 03",
    headline: "SVG + PNG.\nHashes pinned.",
    subtitle:
      "Every artifact carries exact hashes, fingerprints, and a versioned manifest.",
    cta: "INSPECT THE PROOF →",
  }),
  carouselCanvas("carousel-04", 4, {
    eyebrow: "GLYPHKILN / SHIP 04",
    headline: "Proof beats\npromises.",
    subtitle:
      "Reproduce the final canvas locally before it reaches a feed—or a handoff.",
    cta: "INSTALL @GLYPHKILN/CORE →",
  }),
];

const renderedCases = [];
for (const [ordinal, spec] of canvasSpecs.entries()) {
  const seeds = deriveCampaignSeeds({
    campaignSeed: CAMPAIGN_SEED,
    familyId: "image-led-campaign",
    directionKey: createCampaignDirectionKey(DIRECTION_KEY),
    canvasKey: createCampaignCanvasKey(spec.canvasKey),
    template: spec.template,
    format: spec.format,
    compositionVariantId: spec.compositionVariantId,
  });
  const document = createDocument(spec, seeds.canvasSeed);
  const result = await renderGraphic(document, {
    formats: ["svg", "png"],
    creationTimestamp: CREATION_TIMESTAMP,
    assets:
      spec.template.id === "image-led-campaign" ? [proofWallAsset, logoAsset] : [],
    fonts: [],
  });
  assertQualificationResult(spec.canvasKey, spec.template.id, result);

  const documentPath = resolve(GENERATED_ROOT, "designs", `${spec.canvasKey}.json`);
  const formattedDocument = await prettier.format(JSON.stringify(result.document), {
    parser: "json",
  });
  await emit(documentPath, formattedDocument);

  const outputs = {};
  for (const output of result.outputs) {
    const outputPath = resolve(
      GENERATED_ROOT,
      "outputs",
      `${spec.canvasKey}.${output.format}`,
    );
    const manifestBytes = `${JSON.stringify(output.manifest, null, 2)}\n`;
    const handoffManifestBytes = new TextEncoder().encode(
      `${canonicalJson(output.manifest)}\n`,
    );
    await emit(outputPath, output.bytes);
    await emit(`${outputPath}.manifest.json`, manifestBytes);
    outputs[output.format] = {
      bytes: output.bytes,
      path: repositoryPath(outputPath),
      manifest: output.manifest,
      manifestPath: repositoryPath(`${outputPath}.manifest.json`),
      sha256: output.manifest.output.sha256,
      byteSize: output.bytes.byteLength,
      fingerprint: output.fingerprint,
      manifestSha256: sha256(handoffManifestBytes),
    };
  }

  renderedCases.push({
    ordinal,
    ...spec,
    ...seeds,
    document: result.document,
    documentPath: repositoryPath(documentPath),
    documentHash: hashCanonical(result.document),
    revisionId: `revision-${spec.canvasKey}-r1`,
    resourcePins: resourcePinsFor(spec),
    qualityIssues: result.qualityIssues,
    evidence: result.evidence,
    outputs,
  });
}

const directionSeed = renderedCases.at(0)?.directionSeed;
if (directionSeed === undefined) throw new Error("Direction seed was not derived.");
if (!renderedCases.every((entry) => entry.directionSeed === directionSeed)) {
  throw new Error("Every canvas must share one deterministic direction seed.");
}

const uniqueFormats = new Set(renderedCases.map((entry) => entry.format));
if (uniqueFormats.size !== 4) {
  throw new Error(`Expected four formats, received ${uniqueFormats.size.toString()}.`);
}
const carouselSlides = renderedCases.filter(
  (entry) => entry.format === "tiktok-photo-carousel",
);
if (carouselSlides.length < 2) throw new Error("A multi-slide series is required.");

const reviewBoardSvg = createReviewBoard(renderedCases, interBytes);
const reviewBoardPng = renderSvg(reviewBoardSvg, 2_400);
const reviewBoardSvgPath = resolve(GENERATED_ROOT, "campaign-review-board.svg");
const reviewBoardPngPath = resolve(GENERATED_ROOT, "campaign-review-board.png");
await emit(reviewBoardSvgPath, reviewBoardSvg);
await emit(reviewBoardPngPath, reviewBoardPng);

const campaign = {
  id: CAMPAIGN_ID,
  name: "Glyphkiln Core 0.6 launch",
  brief:
    "Launch the published @glyphkiln/core@0.6.0 package as one coherent, reproducible four-format campaign with a multi-slide proof series.",
  campaignSeed: CAMPAIGN_SEED,
  familyId: "image-led-campaign",
  createdAt: CREATION_TIMESTAMP,
  updatedAt: CREATION_TIMESTAMP,
};
const handoff = createApprovedHandoff(campaign, renderedCases);
const handoffPath = resolve(GENERATED_ROOT, HANDOFF_FILENAME);
await emit(handoffPath, handoff.bytes);
await emit(resolve(DELIVERABLE_ROOT, HANDOFF_FILENAME), handoff.bytes);
for (const entry of renderedCases) {
  for (const [format, output] of Object.entries(entry.outputs)) {
    await emit(
      resolve(DELIVERABLE_ROOT, format, `${entry.canvasKey}.${format}`),
      output.bytes,
    );
  }
}

const index = {
  version: "1.0.0",
  status: "pass",
  creationTimestamp: CREATION_TIMESTAMP,
  approval: {
    approvedAt: APPROVAL_TIMESTAMP,
    approvedBy: APPROVER,
    reviewBoardSha256: sha256(reviewBoardPng),
    checklist: {
      coherentImageLedLaunchSet: true,
      orderedCarouselStory: true,
      consistentBrandSystem: true,
      publishableHierarchy: true,
      requiresManualPixelRepair: false,
      completeExactRevisionApproved: true,
    },
  },
  generator: repositoryPath(fileURLToPath(import.meta.url)),
  brief: {
    product: "@glyphkiln/core@0.6.0",
    campaign: campaign.name,
    selectedDirection: "Proof, not promises",
    claim: "Same brief. Same pixels.",
    requiredFormats: [
      "linkedin-landscape",
      "instagram-square",
      "instagram-portrait",
      "tiktok-photo-carousel",
    ],
    carouselSlideCount: carouselSlides.length,
  },
  direction: {
    id: DIRECTION_ID,
    key: DIRECTION_KEY,
    seed: directionSeed,
    locks: ["typography"],
    varying: ["copy", "image", "crop", "composition"],
    paletteAuthority: "one immutable brand snapshot on every canvas",
  },
  rendererContract: {
    designSchema: "1.4.0",
    templates: ["image-led-campaign@1.0.1", "tiktok-carousel-slide@1.0.4"],
    renderer: "0.4.0",
    manifest: "1.2.0",
    campaignSeedDerivation: renderedCases.at(0)?.version,
  },
  resources: {
    font: {
      path: repositoryPath(paths.inter),
      sha256: interHash,
      byteSize: interBytes.byteLength,
      weights: [400, 500, 600, 700, 800],
    },
    logo: {
      ...assetEvidence(logoAsset),
      masters: {
        transparent: {
          path: repositoryPath(paths.logoTransparentSvg),
          sha256: sha256(logoTransparentSvgBytes),
          byteSize: logoTransparentSvgBytes.byteLength,
        },
        campaignBackground: {
          path: repositoryPath(paths.logoSvg),
          sha256: sha256(logoSvgBytes),
          byteSize: logoSvgBytes.byteLength,
        },
      },
    },
    campaignImage: assetEvidence(proofWallAsset),
  },
  automatedChecks: {
    canvasCount: renderedCases.length,
    uniqueFormatCount: uniqueFormats.size,
    carouselSlideCount: carouselSlides.length,
    qualityIssueCount: renderedCases.reduce(
      (total, entry) => total + entry.qualityIssues.length,
      0,
    ),
    allTextWithinSafeArea: true,
    allContrastChecksPass: true,
    stableHandoffOrdering: true,
    exactReproduction: true,
  },
  carouselReview: {
    deliveryProfileId: handoff.deliverySidecar.deliveryProfile.id,
    deliveryProfileMetadataVersion:
      handoff.deliverySidecar.deliveryProfile.metadataVersion,
    success: handoff.sequenceReview.success,
    acceptedWarningCodes: handoff.sequenceReview.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.code),
    deviceSpecificOverlayVerification:
      "not-recorded; verify the dated advisory against the live target device before publishing",
  },
  cases: renderedCases.map((entry) => ({
    ordinal: entry.ordinal,
    canvasKey: entry.canvasKey,
    label: entry.label,
    template: entry.template,
    format: entry.format,
    compositionVariantId: entry.compositionVariantId,
    directionSeed: entry.directionSeed,
    canvasSeed: entry.canvasSeed,
    documentPath: entry.documentPath,
    documentHash: entry.documentHash,
    revisionId: entry.revisionId,
    resourcePins: entry.resourcePins,
    outputs: Object.fromEntries(
      Object.entries(entry.outputs).map(([format, output]) => [
        format,
        {
          path: output.path,
          manifestPath: output.manifestPath,
          sha256: output.sha256,
          byteSize: output.byteSize,
          fingerprint: output.fingerprint,
        },
      ]),
    ),
  })),
  reviewBoard: {
    svg: repositoryPath(reviewBoardSvgPath),
    png: repositoryPath(reviewBoardPngPath),
    sha256: sha256(reviewBoardPng),
    byteSize: reviewBoardPng.byteLength,
  },
  handoff: {
    status: "approved",
    path: repositoryPath(handoffPath),
    deliverablePath: repositoryPath(resolve(DELIVERABLE_ROOT, HANDOFF_FILENAME)),
    filename: HANDOFF_FILENAME,
    mediaType: "application/vnd.glyphkiln.campaign-handoff+json",
    sha256: sha256(handoff.bytes),
    byteSize: handoff.bytes.byteLength,
    fileCount: handoff.files.length,
    approvedCanvasCount: renderedCases.length,
    unapprovedCanvasCount: 0,
  },
};
const indexBytes = await prettier.format(JSON.stringify(index), { parser: "json" });
await emit(resolve(GENERATED_ROOT, "qualification-index.json"), indexBytes);

process.stdout.write(
  `${VERIFY ? "Verified" : "Generated"} ${renderedCases.length.toString()} campaign canvases across ${uniqueFormats.size.toString()} formats, including ${carouselSlides.length.toString()} carousel slides.\n`,
);
process.stdout.write(
  `Review board ${sha256(reviewBoardPng)}; approved handoff ${sha256(handoff.bytes)}.\n`,
);

function imageLedCanvas(canvasKey, format, label) {
  return {
    canvasKey,
    format,
    label,
    template: { id: "image-led-campaign", version: "1.0.1" },
    compositionVariantId: "focal-editorial",
    copy: {
      eyebrow: "GLYPHKILN CORE · 0.6.0",
      headline: "Same brief.\nSame pixels.",
      subtitle: "Versioned inputs. Reproducible SVG, PNG, and proof.",
      cta: "INSTALL @GLYPHKILN/CORE →",
    },
  };
}

function carouselCanvas(canvasKey, slideIndex, copy) {
  return {
    canvasKey,
    format: "tiktok-photo-carousel",
    label: `TikTok proof slide ${slideIndex.toString()} of 4`,
    template: { id: "tiktok-carousel-slide", version: "1.0.4" },
    compositionVariantId: "organic-photo-editorial",
    slideIndex,
    slideCount: 4,
    copy,
  };
}

function createDocument(spec, seed) {
  return {
    schemaVersion: "1.4.0",
    id: `qualification-${spec.canvasKey}`,
    template: spec.template,
    format: spec.format,
    seed,
    mode: "dark",
    brand: glyphkilnBrand(),
    assets:
      spec.template.id === "image-led-campaign"
        ? [assetDeclaration(proofWallAsset), assetDeclaration(logoAsset)]
        : [],
    fonts: [400, 500, 600, 700, 800].map((weight) => ({
      family: "Inter",
      weight,
      style: "normal",
      sha256: interHash,
    })),
    layers:
      spec.template.id === "image-led-campaign"
        ? imageLedLayers(spec.copy)
        : carouselLayers(spec),
    metadata: {
      campaignId: CAMPAIGN_ID,
      campaignDirectionId: DIRECTION_ID,
      campaignCanvasKey: spec.canvasKey,
      qualification: "campaign-workflow-2026-08-18",
      reviewState: "in-review",
    },
  };
}

function imageLedLayers(copy) {
  return [
    {
      id: "campaign-image",
      type: "image",
      assetId: proofWallAsset.id,
      alt: "A deterministic Glyphkiln product-proof wall showing exact rendered outputs.",
      fit: "cover",
      focalPoint: { x: 0.72, y: 0.5 },
      treatment: "dark-scrim",
    },
    {
      id: "brand-mark",
      type: "logo",
      assetId: logoAsset.id,
      alt: "Glyphkiln mark.",
      fit: "contain",
    },
    { id: "eyebrow", type: "eyebrow", text: copy.eyebrow },
    { id: "headline", type: "headline", text: copy.headline },
    { id: "subtitle", type: "subtitle", text: copy.subtitle },
    { id: "cta", type: "cta", text: copy.cta },
  ];
}

function carouselLayers(spec) {
  return [
    {
      id: "slide-number",
      type: "badge",
      text: `${String(spec.slideIndex).padStart(2, "0")} / ${String(spec.slideCount).padStart(2, "0")}`,
    },
    { id: "eyebrow", type: "eyebrow", text: spec.copy.eyebrow },
    { id: "headline", type: "headline", text: spec.copy.headline },
    { id: "subtitle", type: "subtitle", text: spec.copy.subtitle },
    { id: "cta", type: "cta", text: spec.copy.cta },
  ];
}

function glyphkilnBrand() {
  return {
    snapshotId: "brand-glyphkiln-launch-2026-08",
    version: "1.0.0",
    name: "Glyphkiln",
    palette: {
      primary: "#6C5CE7",
      secondary: "#00B894",
      accent: "#FDCB6E",
      neutrals: ["#0B1020", "#F7F8FC", "#47506A"],
    },
    themes: {
      light: {
        background: "#F7F8FC",
        surface: "#FFFFFF",
        text: "#0B1020",
        mutedText: "#47506A",
      },
      dark: {
        background: "#0B1020",
        surface: "#171D32",
        text: "#F7F8FC",
        mutedText: "#B8C0D9",
      },
    },
    typography: {
      headlineFamily: "Inter",
      bodyFamily: "Inter",
      monospaceFamily: "Inter",
      roles: {
        display: {
          family: "Inter",
          weight: 800,
          lineHeight: 0.94,
          tracking: -0.035,
        },
        body: {
          family: "Inter",
          weight: 500,
          lineHeight: 1.2,
          tracking: 0,
        },
        label: {
          family: "Inter",
          weight: 700,
          lineHeight: 1,
          tracking: 0.075,
        },
      },
    },
    spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
    borderRadii: [0, 16, 28],
    visualDensity: "balanced",
    preferredProceduralStyles: ["layered-waves", "flow-field"],
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    prohibitedColors: [],
    prohibitedStyles: ["photorealistic-ai"],
  };
}

function assertQualificationResult(caseName, templateId, result) {
  if (result.qualityIssues.length > 0) {
    throw new Error(
      `${caseName} returned ${result.qualityIssues.length.toString()} quality issue(s): ${JSON.stringify(result.qualityIssues)}.`,
    );
  }
  const safe = result.evidence.safeArea;
  for (const text of result.evidence.text) {
    if (text.overflow) throw new Error(`${caseName} overflows ${text.layerId}.`);
    const insideSafeArea =
      text.bounds.x >= safe.x - 0.001 &&
      text.bounds.y >= safe.y - 0.001 &&
      text.bounds.x + text.bounds.width <= safe.x + safe.width + 0.001 &&
      text.bounds.y + text.bounds.height <= safe.y + safe.height + 0.001;
    if (!insideSafeArea) {
      throw new Error(`${caseName} places ${text.layerId} outside the safe area.`);
    }
  }
  for (const contrast of result.evidence.contrast) {
    if (contrast.minimumRatio < contrast.minimumRequired) {
      throw new Error(
        `${caseName} fails contrast for ${contrast.layerId}: ${contrast.minimumRatio.toString()} < ${contrast.minimumRequired.toString()}.`,
      );
    }
  }
  const expectedCropCount = templateId === "image-led-campaign" ? 1 : 0;
  if (result.evidence.crops.length !== expectedCropCount) {
    throw new Error(
      `${caseName} expected ${expectedCropCount.toString()} crop records, received ${result.evidence.crops.length.toString()}.`,
    );
  }
}

function resourcePinsFor(spec) {
  const pins = [];
  if (spec.template.id === "image-led-campaign") {
    pins.push(
      {
        resourceId: proofWallAsset.id,
        resourceKind: "raster-asset",
        ordinal: 0,
        contentHash: proofWallAsset.sha256,
      },
      {
        resourceId: logoAsset.id,
        resourceKind: "raster-asset",
        ordinal: 1,
        contentHash: logoAsset.sha256,
      },
    );
  }
  pins.push({
    resourceId: "glyphkiln-inter-variable",
    resourceKind: "font",
    ordinal: pins.length,
    contentHash: interHash,
  });
  return pins;
}

function createApprovedHandoff(campaign, cases) {
  const files = [];
  for (const entry of cases) {
    const canvasPrefix = campaignHandoffCanvasPrefix({
      campaignPrefix: `glyphkiln-core-0-6-launch-${CAMPAIGN_ID}`,
      directionKey: DIRECTION_KEY,
      canvasOrdinal: entry.ordinal,
      canvasKey: entry.canvasKey,
    });
    files.push(
      ...createCampaignHandoffCanvasFiles({
        canvasPrefix,
        document: entry.document,
        resources: {
          revisionId: entry.revisionId,
          documentHash: entry.documentHash,
          resourcePins: entry.resourcePins,
        },
        approval: {
          status: "approved",
          receipt: {
            id: `qualification-approval-${entry.canvasKey}-r1`,
            renderJobId: `qualification-render-${entry.canvasKey}-r1`,
            revisionCanonicalHash: entry.documentHash,
            resourcePins: entry.resourcePins,
            outputEvidence: Object.entries(entry.outputs)
              .map(([format, output]) => ({
                format,
                artifactSha256: output.sha256,
                manifestSha256: output.manifestSha256,
                fingerprint: output.fingerprint,
              }))
              .sort((left, right) =>
                left.format < right.format ? -1 : left.format > right.format ? 1 : 0,
              ),
            approvedBy: APPROVER,
            approvedAt: APPROVAL_TIMESTAMP,
          },
        },
        outputs: Object.entries(entry.outputs).map(([format, output]) => ({
          format,
          mimeType: format === "png" ? "image/png" : "image/svg+xml",
          bytes: output.bytes,
          manifest: output.manifest,
        })),
        approvalStatus: "approved",
      }),
    );
  }
  const carouselCases = cases.filter(
    (entry) => entry.document.format === "tiktok-photo-carousel",
  );
  const carouselSequence = {
    deliveryProfileId: "tiktok-organic-photo",
    slides: carouselCases.map((entry, ordinal) => ({
      document: entry.document,
      ordinal,
      narrativeRole: qualificationNarrativeRole(entry),
      compositionVariantId: entry.compositionVariantId,
      altText: `${entry.label}. ${entry.copy.headline.replaceAll("\n", " ")} ${entry.copy.subtitle}`,
      sourceNotes: [
        {
          label: "Glyphkiln campaign workflow qualification",
          url: QUALIFICATION_SOURCE_URL,
        },
      ],
    })),
  };
  const sequenceReview = reviewCarouselSequence(carouselSequence);
  if (!sequenceReview.success) {
    throw new Error("The qualification carousel sequence must pass review.");
  }
  const deliverySidecar = createCarouselDeliverySidecar(carouselSequence);
  const sequencePrefix = campaignHandoffSequencePrefix({
    campaignPrefix: `glyphkiln-core-0-6-launch-${CAMPAIGN_ID}`,
    directionKey: DIRECTION_KEY,
    sequenceKey: "proof-series",
  });
  files.push(
    campaignHandoffJsonFile(
      `${sequencePrefix}.review.json`,
      sequenceReview,
      "approved",
    ),
    campaignHandoffJsonFile(
      `${sequencePrefix}.delivery.json`,
      deliverySidecar,
      "approved",
    ),
  );
  return {
    ...encodeCampaignHandoff({
      campaign,
      directionId: DIRECTION_ID,
      files,
      summary: {
        approvedCanvasCount: cases.length,
        unapprovedCanvasCount: 0,
      },
    }),
    deliverySidecar,
    sequenceReview,
  };
}

function qualificationNarrativeRole(entry) {
  if (entry.slideIndex === 1) return "hook";
  if (entry.slideIndex === 4) return "action";
  if (entry.slideIndex === 3) return "evidence";
  return "explanation";
}

function createProofWall() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1536" height="1024" viewBox="0 0 1536 1024">',
    "<defs>",
    '<linearGradient id="proof-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0B1020"/><stop offset="0.58" stop-color="#171D32"/><stop offset="1" stop-color="#342B68"/></linearGradient>',
    '<filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="28" stdDeviation="28" flood-color="#050812" flood-opacity="0.7"/></filter>',
    "</defs>",
    '<rect width="1536" height="1024" fill="url(#proof-bg)"/>',
    '<g opacity="0.22" fill="none" stroke="#6C5CE7" stroke-width="2"><path d="M0 190h1536M0 388h1536M0 586h1536M0 784h1536"/><path d="M226 0v1024M482 0v1024M738 0v1024M994 0v1024M1250 0v1024"/></g>',
    '<g opacity="0.72"><circle cx="1240" cy="178" r="144" fill="#6C5CE7"/><circle cx="1342" cy="258" r="86" fill="#00B894"/><circle cx="1152" cy="304" r="38" fill="#FDCB6E"/></g>',
    '<g filter="url(#shadow)">',
    '<rect x="760" y="152" width="650" height="388" rx="30" fill="#202843" stroke="#8791B6" stroke-width="3"/>',
    '<path d="M790 438c72-116 146-132 222-48s150 82 222-12 116-92 146-62v194H790z" fill="#6C5CE7" opacity="0.52"/>',
    '<path d="M790 472c98-70 177-64 238 18s152 76 273-18 71-14 79 0v38H790z" fill="#00B894" opacity="0.68"/>',
    '<rect x="796" y="190" width="210" height="18" rx="9" fill="#F7F8FC" opacity="0.72"/><rect x="796" y="226" width="142" height="11" rx="5.5" fill="#B8C0D9" opacity="0.62"/>',
    '<rect x="1072" y="456" width="354" height="446" rx="30" fill="#202843" stroke="#8791B6" stroke-width="3"/>',
    '<rect x="1100" y="500" width="298" height="24" rx="12" fill="#FDCB6E"/><rect x="1100" y="550" width="214" height="17" rx="8.5" fill="#F7F8FC" opacity="0.82"/><rect x="1100" y="588" width="256" height="17" rx="8.5" fill="#F7F8FC" opacity="0.62"/><rect x="1100" y="626" width="176" height="17" rx="8.5" fill="#F7F8FC" opacity="0.5"/>',
    '<rect x="640" y="620" width="548" height="294" rx="30" fill="#202843" stroke="#8791B6" stroke-width="3"/>',
    '<path d="M676 842h94V714h94v72h94V678h94v164z" fill="#00B894" opacity="0.58"/><rect x="676" y="670" width="182" height="16" rx="8" fill="#F7F8FC" opacity="0.68"/>',
    "</g>",
    '<g opacity="0.42" fill="none" stroke="#B8C0D9" stroke-width="3"><path d="M508 170v650"/><path d="m494 194 14-24 14 24M494 796l14 24 14-24"/></g>',
    '<g fill="#F7F8FC" opacity="0.18"><rect x="112" y="164" width="270" height="16" rx="8"/><rect x="112" y="204" width="180" height="11" rx="5.5"/><rect x="112" y="760" width="224" height="12" rx="6"/><rect x="112" y="792" width="158" height="12" rx="6"/></g>',
    '<rect x="112" y="254" width="12" height="296" fill="#00B894" opacity="0.32"/><rect x="112" y="602" width="238" height="9" rx="4.5" fill="#FDCB6E" opacity="0.36"/>',
    "</svg>",
    "",
  ].join("\n");
}

function createReviewBoard(cases, fontBytes) {
  const imageLedCases = cases.filter(
    (entry) => entry.template.id === "image-led-campaign",
  );
  const carouselCases = cases.filter(
    (entry) => entry.template.id === "tiktok-carousel-slide",
  );
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2400" height="1980" viewBox="0 0 2400 1980">',
    '<rect width="2400" height="1980" fill="#090D18"/>',
    `<path d="${outlineText(fontBytes, "GLYPHKILN CORE 0.6 / CAMPAIGN REVIEW", {
      x: 90,
      baseline: 112,
      fontSize: 50,
      weight: 800,
      letterSpacing: 2,
    })}" fill="#F7F8FC"/>`,
    `<path d="${outlineText(
      fontBytes,
      "PROOF, NOT PROMISES · FOUR FORMATS · ONE LOCKED TYPOGRAPHY SYSTEM",
      {
        x: 90,
        baseline: 162,
        fontSize: 24,
        weight: 600,
        letterSpacing: 1.4,
      },
    )}" fill="#8F9BC1"/>`,
    `<path d="${outlineText(fontBytes, "IMAGE-LED LAUNCH SET", {
      x: 90,
      baseline: 230,
      fontSize: 30,
      weight: 700,
      letterSpacing: 1.8,
    })}" fill="#00B894"/>`,
  ];
  imageLedCases.forEach((entry, index) => {
    const x = 90 + index * 770;
    const y = 260;
    card(parts, fontBytes, entry, { x, y, width: 710, height: 630 });
  });
  parts.push(
    `<path d="${outlineText(fontBytes, "TIKTOK PHOTO SERIES · 01—04", {
      x: 90,
      baseline: 965,
      fontSize: 30,
      weight: 700,
      letterSpacing: 1.8,
    })}" fill="#FDCB6E"/>`,
  );
  carouselCases.forEach((entry, index) => {
    const x = 90 + index * 570;
    const y = 995;
    card(parts, fontBytes, entry, { x, y, width: 520, height: 820 });
  });
  parts.push(
    `<path d="${outlineText(
      fontBytes,
      "AWAITING PROJECT-OWNER VISUAL APPROVAL · NO MANUAL DESIGN REPAIR",
      {
        x: 90,
        baseline: 1905,
        fontSize: 24,
        weight: 700,
        letterSpacing: 1.3,
      },
    )}" fill="#F7F8FC"/>`,
    "</svg>",
    "",
  );
  return parts.join("\n");
}

function card(parts, fontBytes, entry, box) {
  const data = readFileSync(resolve(REPOSITORY_ROOT, entry.outputs.png.path)).toString(
    "base64",
  );
  parts.push(
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="22" fill="#171D32" stroke="#303A60" stroke-width="2"/>`,
    `<image x="${box.x + 18}" y="${box.y + 18}" width="${box.width - 36}" height="${box.height - 92}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data}"/>`,
    `<path d="${outlineText(fontBytes, entry.label.toUpperCase(), {
      x: box.x + 22,
      baseline: box.y + box.height - 25,
      fontSize: 20,
      weight: 600,
      letterSpacing: 1.1,
    })}" fill="#B8C0D9"/>`,
  );
}

function resolvedAsset({ id, bytes, width, height, sourceName, sourceReference }) {
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
      generativeImageModel: "deterministic project-authored vector composition",
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
