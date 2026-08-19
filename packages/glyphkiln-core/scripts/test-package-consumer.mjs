import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { installedCliInvocation } from "./package-consumer-cli.mjs";
import { packageConsumerInstallPlan } from "./package-consumer-install.mjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const typescriptPackagePath = require.resolve("typescript/package.json");
const typescriptPackage = require(typescriptPackagePath);
const typescriptCompiler = resolve(
  dirname(typescriptPackagePath),
  typescriptPackage.bin.tsc,
);
const invocationDirectory = process.cwd();
const requestedPackageSpec = process.env["GLYPHKILN_PACKAGE_SPEC"]?.trim();
const signatureVerificationMode =
  process.env["GLYPHKILN_VERIFY_PACKAGE_SIGNATURES"]?.trim();

if (
  process.env["GLYPHKILN_PACKAGE_SPEC"] !== undefined &&
  requestedPackageSpec?.length === 0
) {
  throw new Error("GLYPHKILN_PACKAGE_SPEC must not be empty when provided.");
}
if (signatureVerificationMode !== undefined && signatureVerificationMode !== "1") {
  throw new Error("GLYPHKILN_VERIFY_PACKAGE_SIGNATURES must be 1 when provided.");
}

const verifyPackageSignatures = signatureVerificationMode === "1";
if (verifyPackageSignatures && requestedPackageSpec === undefined) {
  throw new Error(
    "GLYPHKILN_VERIFY_PACKAGE_SIGNATURES requires GLYPHKILN_PACKAGE_SPEC.",
  );
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "glyphkiln-consumer-"));
const consumerDirectory = join(temporaryRoot, "consumer");

try {
  await mkdir(consumerDirectory);
  const packageSpec =
    requestedPackageSpec === undefined
      ? await packArchive()
      : resolveSelectedPackageSpec(requestedPackageSpec);
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({
      name: "glyphkiln-package-consumer",
      private: true,
      type: "module",
    })}\n`,
  );
  const { installArguments, signatureAuditArguments } = packageConsumerInstallPlan(
    packageSpec,
    verifyPackageSignatures,
  );
  await execFileAsync("npm", installArguments, { cwd: consumerDirectory });
  if (signatureAuditArguments !== undefined) {
    const verification = await execFileAsync("npm", signatureAuditArguments, {
      cwd: consumerDirectory,
    });
    process.stdout.write(verification.stdout);
    process.stdout.write("Verified installed-package signatures and attestations.\n");
  }
  await cp(
    join(root, "examples/article-cover.json"),
    join(consumerDirectory, "design.json"),
  );
  await writeConsumerSources();
  await runJavaScriptConsumer();
  await runTypeScriptConsumer();
  await runCliConsumer();
  process.stdout.write(
    `Fresh ${requestedPackageSpec === undefined ? "tarball" : "published-package"} JavaScript, TypeScript, schema-subpath, installed-bin, and isolated consumers passed.\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function packArchive() {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--pack-destination", temporaryRoot, "--silent"],
    { cwd: root },
  );
  const archiveName = stdout.trim().split(/\r?\n/).at(-1);
  if (archiveName === undefined || archiveName.length === 0) {
    throw new Error("npm pack did not report an archive name.");
  }
  return join(temporaryRoot, archiveName);
}

function resolveSelectedPackageSpec(packageSpec) {
  if (packageSpec.startsWith("file:")) {
    const filePath = packageSpec.slice("file:".length);
    return isRelativePathSpec(filePath)
      ? `file:${resolve(invocationDirectory, filePath)}`
      : packageSpec;
  }
  return isRelativePathSpec(packageSpec)
    ? resolve(invocationDirectory, packageSpec)
    : packageSpec;
}

function isRelativePathSpec(packageSpec) {
  return (
    packageSpec === "." ||
    packageSpec === ".." ||
    packageSpec.startsWith("./") ||
    packageSpec.startsWith("../") ||
    packageSpec.startsWith(".\\") ||
    packageSpec.startsWith("..\\")
  );
}

async function writeConsumerSources() {
  await writeFile(
    join(consumerDirectory, "consumer.mjs"),
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CANDIDATE_DOCUMENT_VALIDATION_VERSION,
  CAMPAIGN_SEED_DERIVATION_VERSION,
  COLOR_NORMALIZATION_POLICY_VERSION,
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  analyzeTextLayoutSupport,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
  inspectDesignDocument,
  normalizeRasterColor,
  renderGraphic,
  renderGraphicIsolated,
  validateCandidateDocuments,
} from "@glyphkiln/core";
import {
  AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_REGISTRY,
  AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
  AUTHORING_TEMPLATE_REGISTRY,
  CAMPAIGN_FAMILY_METADATA_VERSION,
  CAMPAIGN_FAMILY_REGISTRY,
  CAROUSEL_SEQUENCE_VERSION,
  DELIVERY_PROFILE_METADATA_VERSION,
  DELIVERY_PROFILE_REGISTRY,
  canonicalJson,
  createRenderFingerprintPayload,
  mapQualityIssuesToAuthoringIssues,
  readExactInertDataRecord,
  readInertArrayDataValue,
  readInertArrayLength,
} from "@glyphkiln/core/browser";
import {
  DesignDocumentSchema,
  getDesignDocumentJsonSchema,
} from "@glyphkiln/core/schema";

const document = JSON.parse(await readFile(new URL("./design.json", import.meta.url)));
assert.equal(DesignDocumentSchema.safeParse(document).success, true);
assert.equal(typeof getDesignDocumentJsonSchema(), "object");
const inertRecord = readExactInertDataRecord(
  { value: "safe" },
  new Set(["value"]),
);
assert.equal(inertRecord?.value, "safe");
assert.equal(readInertArrayLength([inertRecord]), 1);
assert.equal(readInertArrayDataValue([inertRecord], 0), inertRecord);
assert.equal(AUTHORING_CONTRACT_VERSION, "1.2.0");
assert.equal(DELIVERY_PROFILE_METADATA_VERSION, "1.0.0");
assert.equal(CAROUSEL_SEQUENCE_VERSION, "1.1.0");
assert.equal(
  DELIVERY_PROFILE_REGISTRY["instagram-api-carousel"].slideCount.value.maximum,
  10,
);
assert.equal(
  AUTHORING_TEMPLATE_REGISTRY["article-cover@1.1.0"].template.version,
  "1.1.0",
);
assert.equal(AUTHORING_ISSUE_REGISTRY.COPY_TOO_LONG.action, "shorten-copy");
const authoringQuality = mapQualityIssuesToAuthoringIssues([
  {
    code: "LOW_TEXT_CONTRAST",
    severity: "error",
    message: "runtime evidence must not become guidance",
    layerId: "headline",
  },
]);
assert.equal(authoringQuality.version, AUTHORING_QUALITY_ISSUE_MAPPING_VERSION);
assert.equal(authoringQuality.valid, true);
assert.equal(authoringQuality.issues[0].action, "improve-contrast");
assert.equal(
  authoringQuality.issues[0].message,
  AUTHORING_ISSUE_REGISTRY.CONTRAST_INSUFFICIENT.guidance,
);
const candidates = validateCandidateDocuments([document]);
assert.equal(candidates.version, CANDIDATE_DOCUMENT_VALIDATION_VERSION);
assert.equal(candidates.success, true);
assert.equal(candidates.candidates[0].status, "valid");
assert.equal(
  candidates.candidates[0].canonicalDocument,
  canonicalJson(candidates.candidates[0].document),
);
assert.equal(CAMPAIGN_FAMILY_METADATA_VERSION, "1.2.0");
assert.equal(
  CAMPAIGN_FAMILY_REGISTRY["image-led-campaign"].members[0].template.version,
  "1.0.1",
);
assert.deepEqual(
  CAMPAIGN_FAMILY_REGISTRY["image-led-campaign"].members[1],
  {
    template: { id: "tiktok-carousel-slide", version: "1.0.4" },
    formats: ["tiktok-photo-carousel"],
    compositionVariants: [
      {
        id: "organic-photo-editorial",
        label: "Organic photo editorial",
        description:
          "A compact 3:4 organic composition with content-responsive spacing and optional deterministic pattern rails.",
      },
    ],
    contentRoles: [
      { layerType: "badge", required: true },
      { layerType: "eyebrow", required: false },
      { layerType: "headline", required: true },
      { layerType: "subtitle", required: false },
      { layerType: "statistic", required: false },
      { layerType: "cta", required: false },
      { layerType: "footer", required: false },
    ],
    assetRoles: [],
    safeAreaPolicy: {
      semanticContent: "brand-snapshot",
      fullBleedAssetLayers: [],
      exposesRenderEvidence: true,
      guidance: "Honor compact top, action-side, and bottom interface insets.",
    },
  },
);
assert.equal(
  deriveCampaignSeeds({
    campaignSeed: "packed-consumer",
    familyId: "image-led-campaign",
    directionKey: createCampaignDirectionKey("direction-a"),
    canvasKey: createCampaignCanvasKey("landscape-01"),
    template: { id: "image-led-campaign", version: "1.0.1" },
    format: "linkedin-landscape",
    compositionVariantId: "focal-editorial",
  }).version,
  CAMPAIGN_SEED_DERIVATION_VERSION,
);
assert.equal(canonicalJson({ z: 2, a: 1 }), '{"a":1,"z":2}');
assert.equal(
  createRenderFingerprintPayload({
    document,
    outputFormat: "svg",
    assetHashes: [],
    fontHashes: [],
    proceduralAlgorithmVersions: {},
  }).outputFormat,
  "svg",
);
assert.equal(
  analyzeTextLayoutSupport("Latin").version,
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
);
const rasterSource = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
  "base64",
));
const normalizedRaster = await normalizeRasterColor({
  bytes: rasterSource,
  mimeType: "image/png",
});
assert.equal(
  normalizedRaster.report.policyVersion,
  COLOR_NORMALIZATION_POLICY_VERSION,
);
assert.equal(normalizedRaster.report.output.mimeType, "image/png");
assert.notEqual(
  normalizedRaster.report.source.sha256,
  normalizedRaster.report.output.sha256,
);
const direct = await renderGraphic(document, { formats: ["svg"] });
const isolated = await renderGraphicIsolated(document, { formats: ["png"] });
assert.ok(direct.outputs[0].bytes.length > 0);
assert.ok(isolated.outputs[0].bytes.length > 0);

const unsupported = structuredClone(document);
unsupported.layers.find((layer) => layer.type === "headline").text = "\\u05D0";
assert.equal(inspectDesignDocument(unsupported).textLayout.renderable, false);
await assert.rejects(
  renderGraphic(unsupported),
  (error) =>
    error.code === "QUALITY_VALIDATION_FAILED" &&
    error.details.textLayout.totalDiagnostics === 1 &&
    error.details.textLayout.retainedDiagnostics === 1 &&
    error.details.textLayout.truncated === false &&
    error.details.issues.some((issue) => issue.code === "BIDI_LAYOUT_UNSUPPORTED"),
);
await assert.rejects(
  import("@glyphkiln/core/typography/text-layout"),
  (error) => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
`,
  );
  await writeFile(
    join(consumerDirectory, "consumer.ts"),
    `import {
  CANDIDATE_DOCUMENT_VALIDATION_VERSION,
  CAMPAIGN_SEED_DERIVATION_VERSION,
  COLOR_NORMALIZATION_POLICY_VERSION,
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  analyzeTextLayoutSupport,
  createDesignDocument,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
  normalizeRasterColor,
  validateCandidateDocuments,
  type CandidateDocumentSetValidation,
  type CampaignCanvasKey,
  type CampaignDirectionKey,
  type CampaignSeedDerivationInput,
  type DerivedCampaignSeeds,
  type DesignTextLayoutDiagnostic,
  type DesignTextLayoutInspection,
  type NormalizedRasterColor,
  type TextLayoutAnalysis,
  type TextLayoutDiagnostic,
  type TextLayoutDiagnosticCode,
  type TextLayoutMatch,
  type TextLayoutMatchProperty,
  type RenderEvidence,
} from "@glyphkiln/core";
import {
  AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_REGISTRY,
  AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
  AUTHORING_TEMPLATE_REGISTRY,
  CAMPAIGN_FAMILY_METADATA_VERSION,
  CAMPAIGN_FAMILY_REGISTRY,
  CAROUSEL_SEQUENCE_VERSION,
  DELIVERY_PROFILE_METADATA_VERSION,
  DELIVERY_PROFILE_REGISTRY,
  FOCAL_CROP_POLICY_VERSION,
  calculateFocalCrop,
  canonicalJson,
  createRenderFingerprintPayload,
  mapQualityIssuesToAuthoringIssues,
  readExactInertDataRecord,
  readInertArrayDataValue,
  readInertArrayLength,
  type AuthoringIssueMetadata,
  type AuthoringQualityIssueMapping,
  type AuthoringTemplateContract,
  type CampaignFamilyDefinition,
  type RenderFingerprintInput,
} from "@glyphkiln/core/browser";
import {
  DesignDocumentSchema,
  getDesignDocumentJsonSchema,
  type DesignDocument as SchemaDesignDocument,
} from "@glyphkiln/core/schema";

const inertRecord = readExactInertDataRecord(
  { value: "safe" },
  new Set(["value"]),
);
if (
  inertRecord?.value !== "safe" ||
  readInertArrayLength([inertRecord]) !== 1 ||
  readInertArrayDataValue([inertRecord], 0) !== inertRecord
) {
  throw new Error("inert data reader contract");
}

const campaignSeedInput = {
  campaignSeed: "strict-packed-consumer",
  familyId: "image-led-campaign",
  directionKey: createCampaignDirectionKey("direction-a"),
  canvasKey: createCampaignCanvasKey("portrait-01"),
  template: { id: "image-led-campaign", version: "1.0.1" },
  format: "instagram-portrait",
  compositionVariantId: "focal-editorial",
} satisfies CampaignSeedDerivationInput;
const campaignDirectionKey: CampaignDirectionKey = campaignSeedInput.directionKey;
const campaignCanvasKey: CampaignCanvasKey = campaignSeedInput.canvasKey;
const campaignSeeds: DerivedCampaignSeeds = deriveCampaignSeeds(campaignSeedInput);
const campaignFamily: CampaignFamilyDefinition =
  CAMPAIGN_FAMILY_REGISTRY["image-led-campaign"];
if (
  campaignSeeds.version !== CAMPAIGN_SEED_DERIVATION_VERSION ||
  CAMPAIGN_FAMILY_METADATA_VERSION !== "1.2.0" ||
  campaignFamily.members[1]?.template.id !== "tiktok-carousel-slide"
) {
  throw new Error("campaign contract");
}
void [campaignFamily, campaignDirectionKey, campaignCanvasKey];

const authoringTemplate: AuthoringTemplateContract =
  AUTHORING_TEMPLATE_REGISTRY["product-announcement@1.1.1"];
const copyIssue: AuthoringIssueMetadata = AUTHORING_ISSUE_REGISTRY.COPY_TOO_LONG;
const authoringQuality: AuthoringQualityIssueMapping =
  mapQualityIssuesToAuthoringIssues([
    {
      code: "ORPHAN_LINE",
      severity: "warning",
      message: "runtime evidence",
      layerId: "headline",
    },
  ]);
if (
  AUTHORING_CONTRACT_VERSION !== "1.2.0" ||
  DELIVERY_PROFILE_METADATA_VERSION !== "1.0.0" ||
  CAROUSEL_SEQUENCE_VERSION !== "1.1.0" ||
  DELIVERY_PROFILE_REGISTRY["instagram-api-carousel"].slideCount.value.maximum !==
    10 ||
  authoringQuality.version !== AUTHORING_QUALITY_ISSUE_MAPPING_VERSION ||
  authoringQuality.issues[0]?.action !== "review-copy-rhythm" ||
  authoringTemplate.compositionVariant.selection !== "fixed-by-template-version" ||
  copyIssue.action !== "shorten-copy"
) {
  throw new Error("authoring contract");
}

const normalizedRaster: Promise<NormalizedRasterColor> = normalizeRasterColor({
  bytes: new Uint8Array(),
  mimeType: "image/png",
});
void [normalizedRaster, COLOR_NORMALIZATION_POLICY_VERSION];

const carousel = createDesignDocument({
  template: { id: "tiktok-carousel-slide", version: "1.0.4" },
  format: "tiktok-photo-carousel",
  seed: "strict-packed-consumer",
  brand: {
    snapshotId: "consumer-brand",
    version: "1.0.0",
    name: "Consumer Brand",
    palette: {
      primary: "#29231F",
      secondary: "#526A60",
      accent: "#A83F22",
      neutrals: ["#F1E8DA", "#29231F"],
    },
    themes: {
      light: {
        background: "#F1E8DA",
        surface: "#FFF9F0",
        text: "#29231F",
        mutedText: "#675B50",
      },
      dark: {
        background: "#25211E",
        surface: "#352F2A",
        text: "#FFF8EC",
        mutedText: "#CFC3B4",
      },
    },
    typography: {
      headlineFamily: "Inter",
      bodyFamily: "Inter",
      roles: {
        display: {
          family: "Inter",
          weight: 700,
          lineHeight: 0.95,
          tracking: -0.02,
        },
      },
    },
    spacingScale: [4, 8, 16],
    borderRadii: [0, 8],
    visualDensity: "balanced",
    preferredProceduralStyles: ["recursive-subdivision"],
    safeArea: { top: 0.06, right: 0.14, bottom: 0.08, left: 0.06 },
  },
  fonts: [{ family: "Inter", weight: 400, style: "normal" }],
  layers: [{ id: "background", type: "background" }],
});
void carousel;
const candidateValidation: CandidateDocumentSetValidation =
  validateCandidateDocuments([carousel]);
if (candidateValidation.version !== CANDIDATE_DOCUMENT_VALIDATION_VERSION) {
  throw new Error("candidate validation contract");
}

const crop = calculateFocalCrop({
  source: { width: 1600, height: 900 },
  destination: { x: 0, y: 0, width: 1080, height: 1080 },
  focalPoint: { x: 0.75, y: 0.5 },
});
if (crop.policyVersion !== FOCAL_CROP_POLICY_VERSION) throw new Error("crop");
const evidence = {} as RenderEvidence;
void evidence;
const schemaDocument: SchemaDesignDocument = DesignDocumentSchema.parse(carousel);
void [schemaDocument, getDesignDocumentJsonSchema()];

const analysis: TextLayoutAnalysis = analyzeTextLayoutSupport("Latin");
const browserInput = {
  document: {} as never,
  outputFormat: "svg",
  assetHashes: [],
  fontHashes: [],
  proceduralAlgorithmVersions: {},
} satisfies RenderFingerprintInput;
void [canonicalJson({ stable: true }), createRenderFingerprintPayload(browserInput)];
const code: TextLayoutDiagnosticCode = "BIDI_LAYOUT_UNSUPPORTED";
const property: TextLayoutMatchProperty = "Bidi_Class=R";
const match: TextLayoutMatch = { codePoint: 0x05d0, scalarIndex: 0, property };
const diagnostic: TextLayoutDiagnostic = {
  code,
  message: "fixed",
  totalMatches: 1,
  matches: [match],
  truncated: false,
};
const designDiagnostic: DesignTextLayoutDiagnostic = {
  ...diagnostic,
  layerId: "headline",
  layerType: "headline",
  fieldPath: "/layers/0/text",
  visible: true,
  blocksRender: true,
};
const inspection: DesignTextLayoutInspection = {
  version: TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  renderable: false,
  totalDiagnostics: 1,
  diagnostics: [designDiagnostic],
  truncated: false,
};
void [analysis, inspection];
`,
  );
  await writeFile(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["consumer.ts"],
    })}\n`,
  );
}

async function runJavaScriptConsumer() {
  await execFileAsync(process.execPath, ["consumer.mjs"], {
    cwd: consumerDirectory,
  });
}

async function runTypeScriptConsumer() {
  await execFileAsync(process.execPath, [typescriptCompiler, "-p", "tsconfig.json"], {
    cwd: consumerDirectory,
  });
}

async function runCliConsumer() {
  const cli = join(
    consumerDirectory,
    "node_modules/.bin",
    process.platform === "win32" ? "glyphkiln.cmd" : "glyphkiln",
  );
  const inspection = await runInstalledCli(cli, [
    "inspect",
    join(consumerDirectory, "design.json"),
  ]);
  assert.equal(JSON.parse(inspection.stdout).textLayout.renderable, true);

  const unsupported = JSON.parse(
    await readFile(join(consumerDirectory, "design.json"), "utf8"),
  );
  unsupported.layers.find((layer) => layer.type === "headline").text = "\u05D0";
  const unsupportedPath = join(consumerDirectory, "unsupported.json");
  await writeFile(unsupportedPath, `${JSON.stringify(unsupported)}\n`);
  await assert.rejects(
    runInstalledCli(cli, [
      "render",
      unsupportedPath,
      "--format",
      "svg",
      "--output",
      join(consumerDirectory, "blocked.svg"),
    ]),
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.includes("BIDI_LAYOUT_UNSUPPORTED"),
  );

  const bundledDesign = JSON.parse(
    await readFile(join(consumerDirectory, "design.json"), "utf8"),
  );
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    "base64",
  );
  const pixelHash = createHash("sha256").update(pixel).digest("hex");
  bundledDesign.assets = [
    {
      id: "consumer-pixel",
      mimeType: "image/png",
      sha256: pixelHash,
      width: 1,
      height: 1,
      origin: { kind: "user-upload" },
    },
  ];
  const bundledDesignPath = join(consumerDirectory, "bundled-design.json");
  await writeFile(bundledDesignPath, `${JSON.stringify(bundledDesign)}\n`);

  const bundleRoot = join(consumerDirectory, "resource-bundle");
  await mkdir(join(bundleRoot, "assets"), { recursive: true });
  await mkdir(join(bundleRoot, "fonts"), { recursive: true });
  await writeFile(join(bundleRoot, "assets/pixel.png"), pixel);
  await cp(
    join(
      consumerDirectory,
      "node_modules/@glyphkiln/core/assets/fonts/Inter-Variable.ttf",
    ),
    join(bundleRoot, "fonts/inter.ttf"),
  );
  await writeFile(
    join(bundleRoot, "glyphkiln-resource-bundle.json"),
    `${JSON.stringify({
      bundleVersion: "1.0.0",
      assets: [
        {
          ...bundledDesign.assets[0],
          file: "assets/pixel.png",
        },
      ],
      fonts: [
        {
          ...bundledDesign.fonts[0],
          file: "fonts/inter.ttf",
        },
      ],
    })}\n`,
  );
  const bundledOutput = join(consumerDirectory, "bundled.svg");
  const bundledManifest = join(consumerDirectory, "bundled.manifest.json");
  await runInstalledCli(cli, [
    "render",
    bundledDesignPath,
    "--resource-bundle",
    bundleRoot,
    "--format",
    "svg",
    "--output",
    bundledOutput,
    "--manifest",
    bundledManifest,
  ]);
  assert.match(await readFile(bundledOutput, "utf8"), /^<svg /);
  const provenance = JSON.parse(await readFile(bundledManifest, "utf8"));
  assert.equal(provenance.assets[0].sha256, pixelHash);
}

function runInstalledCli(cliPath, args) {
  const invocation = installedCliInvocation(
    process.platform,
    cliPath,
    args,
    process.env["ComSpec"],
  );
  return execFileAsync(invocation.file, invocation.args);
}
