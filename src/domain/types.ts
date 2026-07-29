export const DESIGN_DOCUMENT_VERSION = "1.0.0" as const;
export const MANIFEST_VERSION = "1.0.0" as const;
export const RENDERER_NAME = "glyphkiln-svg" as const;
export const RENDERER_VERSION = "0.1.1" as const;
export const PRODUCT_CLAIM =
  "Created without generative image models and rendered deterministically from code." as const;

export type QualityIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
  layerId?: string;
  details?: Record<string, unknown>;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedRect = Bounds;

export type Dimensions = {
  width: number;
  height: number;
};

export type OutputFormat = "svg" | "png";

export type AssetOrigin = {
  kind: "user-upload" | "licensed-library" | "generated" | "unknown";
  sourceName?: string | undefined;
  sourceReference?: string | undefined;
  generativeImageModel?: string | undefined;
};

export type ResolvedAsset = {
  id: string;
  mimeType: "image/png" | "image/jpeg";
  sha256: string;
  width: number;
  height: number;
  origin: AssetOrigin;
  bytes: Uint8Array;
};

export type FontStyle = "normal" | "italic";

export type ResolvedFont = {
  family: string;
  weight: number;
  style: FontStyle;
  sha256?: string;
  bytes: Uint8Array;
};

export type RenderingMethod =
  "deterministic-code-rendering/direct-svg" | "deterministic-code-rendering/resvg";

export class GlyphkilnError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GlyphkilnError";
  }
}
