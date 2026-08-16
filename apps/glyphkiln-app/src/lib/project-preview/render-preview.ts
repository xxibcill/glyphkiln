import {
  createDevelopmentFont,
  GlyphkilnError,
  renderGraphicIsolated,
  validateDesignDocument,
} from "@glyphkiln/core";
import type {
  QualityIssue,
  ResolvedAsset,
  ResolvedFont,
  RenderGraphicResult,
  ValidationProblem,
} from "@glyphkiln/core";

import type { PreviewOutput, PreviewResponse } from "@/features/project-preview/types";

type PreviewDependencies = {
  render: typeof renderGraphicIsolated;
  now: () => Date;
};

type PreviewServiceResult = {
  status: number;
  body: PreviewResponse;
};

export type PreviewResources = {
  assets?: readonly ResolvedAsset[];
  fonts?: readonly ResolvedFont[];
};

const DEFAULT_DEPENDENCIES: PreviewDependencies = {
  render: renderGraphicIsolated,
  now: () => new Date(),
};
const DEVELOPMENT_FONT = createDevelopmentFont();
let renderSlotAvailable = true;

const CLIENT_RENDER_ERROR_CODES = new Set([
  "ASSET_DECLARATION_MISMATCH",
  "ASSET_DECODE_FAILED",
  "ASSET_DIMENSION_MISMATCH",
  "ASSET_HASH_MISMATCH",
  "ASSET_MIME_MISMATCH",
  "COLOR_GLYPH_UNSUPPORTED",
  "DUPLICATE_RESOLVED_ASSET",
  "FONT_COLLECTION_UNSUPPORTED",
  "FONT_HASH_MISMATCH",
  "INVALID_DESIGN_DOCUMENT",
  "MALFORMED_RASTER_ASSET",
  "QUALITY_VALIDATION_FAILED",
  "UNDECLARED_ASSET_REFERENCE",
  "UNDECLARED_FONT_REFERENCE",
  "UNRESOLVED_ASSET",
  "UNSUPPORTED_FONT",
  "UNSUPPORTED_TEMPLATE_FORMAT",
  "UNSUPPORTED_TEMPLATE_VERSION",
]);

export async function createProjectPreview(
  input: unknown,
  dependencies: PreviewDependencies = DEFAULT_DEPENDENCIES,
  resources: PreviewResources = {},
  creationTimestamp?: Date,
): Promise<PreviewServiceResult> {
  const validation = validateDesignDocument(input);
  if (!validation.success) {
    return validationFailure(validation.problems);
  }
  if (!renderSlotAvailable) {
    return failure(
      429,
      "Renderer is busy",
      "PREVIEW_RENDER_BUSY",
      "Another local proof is already rendering. Wait for it to finish and try again.",
    );
  }

  renderSlotAvailable = false;
  try {
    const result = await dependencies.render(
      validation.data,
      {
        formats: ["svg", "png"],
        assets: resources.assets ?? [],
        fonts: resources.fonts ?? [DEVELOPMENT_FONT],
        creationTimestamp: (creationTimestamp ?? dependencies.now()).toISOString(),
      },
      {},
    );
    return {
      status: 200,
      body: {
        ok: true,
        document: result.document,
        qualityIssues: result.qualityIssues,
        evidence: result.evidence,
        outputs: result.outputs.map(serializeOutput),
      },
    };
  } catch (error) {
    return renderFailure(error);
  } finally {
    renderSlotAvailable = true;
  }
}

function validationFailure(problems: ValidationProblem[]): PreviewServiceResult {
  return {
    status: 422,
    body: {
      ok: false,
      status: 422,
      title: "Design document needs attention",
      code: "INVALID_DESIGN_DOCUMENT",
      detail: "Core rejected the structured document. Review the fields below.",
      problems,
    },
  };
}

function serializeOutput(
  output: RenderGraphicResult["outputs"][number],
): PreviewOutput {
  return {
    format: output.format,
    mimeType: output.mimeType,
    base64: Buffer.from(output.bytes).toString("base64"),
    byteSize: output.bytes.byteLength,
    fingerprint: output.fingerprint,
    filename: `glyphkiln-${output.manifest.designDocumentId}.${output.format}`,
    manifest: output.manifest,
  };
}

function renderFailure(error: unknown): PreviewServiceResult {
  if (!(error instanceof GlyphkilnError)) {
    return internalRenderFailure();
  }

  if (error.code === "RENDER_TIMEOUT") {
    return failure(
      504,
      "Preview timed out",
      error.code,
      "Core did not finish within the isolated-render deadline. Try simpler copy or controls.",
    );
  }

  if (error.code === "DESIGN_RESOURCE_LIMIT_EXCEEDED") {
    return failure(
      413,
      "Design document is too large",
      error.code,
      "The structured document exceeds Core's local-render resource boundary.",
    );
  }

  if (CLIENT_RENDER_ERROR_CODES.has(error.code)) {
    return {
      status: 422,
      body: {
        ok: false,
        status: 422,
        title: "Preview could not be rendered",
        code: error.code,
        detail: error.message,
        qualityIssues: readQualityIssues(error.details),
      },
    };
  }

  if (
    error.code === "RENDER_PROCESS_NOT_BUILT" ||
    error.code === "RENDER_PROCESS_FAILED" ||
    error.code === "RENDER_PROCESS_EXITED" ||
    error.code === "RENDER_PROCESS_IPC_FAILED"
  ) {
    return failure(
      503,
      "Local renderer is unavailable",
      error.code,
      "The isolated Core renderer is not ready. Rebuild the Core workspace and try again.",
    );
  }

  return internalRenderFailure();
}

function internalRenderFailure(): PreviewServiceResult {
  return failure(
    500,
    "Preview failed",
    "PREVIEW_RENDER_FAILED",
    "The local renderer encountered an unexpected error. The design was not saved.",
  );
}

function failure(
  status: number,
  title: string,
  code: string,
  detail: string,
): PreviewServiceResult {
  return {
    status,
    body: { ok: false, status, title, code, detail },
  };
}

function readQualityIssues(
  details: Record<string, unknown> | undefined,
): QualityIssue[] | undefined {
  const issues = details?.issues;
  if (!Array.isArray(issues)) return undefined;
  return issues.filter(isQualityIssue);
}

function isQualityIssue(value: unknown): value is QualityIssue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Partial<QualityIssue>;
  return (
    typeof issue.code === "string" &&
    (issue.severity === "warning" || issue.severity === "error") &&
    typeof issue.message === "string"
  );
}
