import { z } from "zod";

import { hashCanonical } from "../cache/canonical.js";
import { DESIGN_DOCUMENT_VERSION } from "../domain/types.js";
import { FORMAT_IDS } from "../formats/index.js";
import {
  assertDesignInputResources,
  getDesignInputResourceProblems,
  RENDER_RESOURCE_LIMITS,
} from "../resources/index.js";

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const semanticVersion = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const normalized = z.number().min(0).max(1);
const positiveDimension = z
  .number()
  .int()
  .positive()
  .max(RENDER_RESOURCE_LIMITS.maxAssetDimension);
const sha256Hash = z.string().regex(/^[0-9a-f]{64}$/);

export const QuietRegionSchema = z
  .object({
    x: normalized,
    y: normalized,
    width: normalized.positive(),
    height: normalized.positive(),
  })
  .strict()
  .refine((region) => region.x + region.width <= 1, {
    message: "Quiet region must fit horizontally inside the canvas.",
  })
  .refine((region) => region.y + region.height <= 1, {
    message: "Quiet region must fit vertically inside the canvas.",
  });

const safeAreaSchema = z
  .object({
    top: z.number().min(0).max(0.4),
    right: z.number().min(0).max(0.4),
    bottom: z.number().min(0).max(0.4),
    left: z.number().min(0).max(0.4),
  })
  .strict();

const themeSchema = z
  .object({
    background: color,
    surface: color,
    text: color,
    mutedText: color,
  })
  .strict();

export const PROCEDURAL_STYLE_IDS = [
  "flow-field",
  "layered-waves",
  "topographic-contours",
  "recursive-subdivision",
] as const;

export const BrandSnapshotSchema = z
  .object({
    snapshotId: identifier,
    version: semanticVersion,
    name: z.string().min(1).max(120),
    palette: z
      .object({
        primary: color,
        secondary: color,
        accent: color,
        neutrals: z.array(color).min(2).max(12),
      })
      .strict(),
    themes: z
      .object({
        light: themeSchema,
        dark: themeSchema,
      })
      .strict(),
    typography: z
      .object({
        headlineFamily: z.string().min(1).max(120),
        bodyFamily: z.string().min(1).max(120),
        monospaceFamily: z.string().min(1).max(120).optional(),
      })
      .strict(),
    spacingScale: z.array(z.number().positive()).min(3).max(12),
    borderRadii: z.array(z.number().min(0)).min(1).max(8),
    visualDensity: z.enum(["quiet", "balanced", "dense"]),
    preferredProceduralStyles: z
      .array(z.enum(PROCEDURAL_STYLE_IDS))
      .min(1)
      .max(PROCEDURAL_STYLE_IDS.length),
    safeArea: safeAreaSchema,
    prohibitedColors: z.array(color).max(24).default([]),
    prohibitedStyles: z.array(z.string().min(1).max(80)).max(24).default([]),
  })
  .strict();

const layerBase = {
  id: identifier,
  visible: z.boolean().default(true),
};

function textLayerSchema<T extends string>(type: T) {
  return z
    .object({
      ...layerBase,
      type: z.literal(type),
      text: z.string().min(1).max(2_000),
      color: color.optional(),
      fontFamily: z.string().min(1).max(120).optional(),
      fontWeight: z.number().int().min(100).max(900).multipleOf(100).optional(),
      fontSize: z.number().positive().max(512).optional(),
      maxLines: z.number().int().positive().max(20).optional(),
      align: z.enum(["left", "center", "right"]).optional(),
    })
    .strict();
}

function assetLayerSchema<T extends string>(type: T) {
  return z
    .object({
      ...layerBase,
      type: z.literal(type),
      assetId: identifier,
      alt: z.string().min(1).max(500),
      fit: z.enum(["contain", "cover"]).default("contain"),
    })
    .strict();
}

export const LayerSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...layerBase,
      type: z.literal("background"),
      color: color.optional(),
    })
    .strict(),
  z
    .object({
      ...layerBase,
      type: z.literal("procedural-decoration"),
      style: z.enum(PROCEDURAL_STYLE_IDS),
      intensity: normalized,
      density: normalized,
      complexity: normalized,
      contrast: normalized,
      quietRegion: QuietRegionSchema,
    })
    .strict(),
  textLayerSchema("headline"),
  textLayerSchema("subtitle"),
  textLayerSchema("eyebrow"),
  textLayerSchema("cta"),
  assetLayerSchema("logo"),
  assetLayerSchema("product-screenshot"),
  assetLayerSchema("image"),
  z
    .object({
      ...layerBase,
      type: z.literal("icon"),
      name: z.enum(["arrow-up-right", "check", "sparkles", "chart"]),
      color: color.optional(),
    })
    .strict(),
  z
    .object({
      ...layerBase,
      type: z.literal("badge"),
      text: z.string().min(1).max(80),
      color: color.optional(),
    })
    .strict(),
  z
    .object({
      ...layerBase,
      type: z.literal("shape"),
      shape: z.enum(["rectangle", "circle", "line"]),
      color: color,
      opacity: normalized.default(1),
    })
    .strict(),
  z
    .object({
      ...layerBase,
      type: z.literal("statistic"),
      value: z.string().min(1).max(80),
      label: z.string().min(1).max(240),
      trend: z.string().min(1).max(80).optional(),
    })
    .strict(),
  z
    .object({
      ...layerBase,
      type: z.literal("chart"),
      chart: z.enum(["bar", "sparkline"]),
      values: z
        .array(
          z
            .object({
              label: z.string().min(1).max(80),
              value: z.number(),
              color: color.optional(),
            })
            .strict(),
        )
        .min(2)
        .max(32),
    })
    .strict(),
  textLayerSchema("footer"),
  textLayerSchema("attribution"),
]);

export const AssetDeclarationSchema = z
  .object({
    id: identifier,
    mimeType: z.enum(["image/png", "image/jpeg"]),
    sha256: sha256Hash,
    width: positiveDimension,
    height: positiveDimension,
    origin: z
      .object({
        kind: z.enum(["user-upload", "licensed-library", "generated", "unknown"]),
        sourceName: z.string().min(1).max(200).optional(),
        sourceReference: z.string().min(1).max(500).optional(),
        generativeImageModel: z.string().min(1).max(200).optional(),
      })
      .strict(),
  })
  .strict();

export const FontDeclarationSchema = z
  .object({
    family: z.string().min(1).max(120),
    weight: z.number().int().min(100).max(900).multipleOf(100),
    style: z.enum(["normal", "italic"]),
    sha256: sha256Hash.optional(),
  })
  .strict();

export const TEMPLATE_IDS = [
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
] as const;

export const DesignDocumentSchema = z
  .object({
    schemaVersion: z.literal(DESIGN_DOCUMENT_VERSION),
    id: identifier,
    template: z
      .object({
        id: z.enum(TEMPLATE_IDS),
        version: semanticVersion,
      })
      .strict(),
    format: z.enum(FORMAT_IDS),
    seed: z.string().min(1).max(256),
    mode: z.enum(["light", "dark"]).default("light"),
    brand: BrandSnapshotSchema,
    assets: z.array(AssetDeclarationSchema).max(100).default([]),
    fonts: z.array(FontDeclarationSchema).min(1).max(32),
    layers: z.array(LayerSchema).min(1).max(100),
    metadata: z.record(z.string(), z.json()).optional(),
  })
  .strict()
  .superRefine((document, context) => {
    checkUniqueIds(document.layers, "layer", context);
    checkUniqueIds(document.assets, "asset", context);
  });

function checkUniqueIds(
  entries: readonly { id: string }[],
  kind: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (seen.has(entry.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate ${kind} ID "${entry.id}".`,
        path: [kind === "layer" ? "layers" : "assets", index, "id"],
      });
    }
    seen.add(entry.id);
  }
}

export type DesignDocument = z.infer<typeof DesignDocumentSchema>;
export type DesignLayer = DesignDocument["layers"][number];
export type BrandSnapshot = DesignDocument["brand"];
export type AssetDeclaration = DesignDocument["assets"][number];
export type FontDeclaration = DesignDocument["fonts"][number];
export type ProceduralStyleId = (typeof PROCEDURAL_STYLE_IDS)[number];
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type ValidationProblem = {
  path: string;
  code: string;
  message: string;
};

export type ValidationResult =
  | { success: true; data: DesignDocument; problems: [] }
  | { success: false; problems: ValidationProblem[] };

export type CreateDesignDocumentInput = Omit<
  z.input<typeof DesignDocumentSchema>,
  "schemaVersion" | "id"
> & {
  schemaVersion?: typeof DESIGN_DOCUMENT_VERSION;
  id?: string;
};

export function validateDesignDocument(input: unknown): ValidationResult {
  const resourceProblems = getDesignInputResourceProblems(input);
  if (resourceProblems.length > 0) {
    return { success: false, problems: resourceProblems };
  }
  const result = DesignDocumentSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, problems: [] };
  }
  return {
    success: false,
    problems: result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      code: issue.code,
      message: issue.message,
    })),
  };
}

export function createDesignDocument(input: CreateDesignDocumentInput): DesignDocument {
  assertDesignInputResources(input);
  const id = input.id ?? `gk_${hashCanonical(input).slice(0, 20)}`;
  return DesignDocumentSchema.parse({
    ...input,
    id,
    schemaVersion: input.schemaVersion ?? DESIGN_DOCUMENT_VERSION,
  });
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "$";
  }
  return path.reduce<string>((output, part) => {
    if (typeof part === "number") {
      return `${output}[${part}]`;
    }
    const segment = String(part);
    return output.length === 0 ? segment : `${output}.${segment}`;
  }, "");
}
