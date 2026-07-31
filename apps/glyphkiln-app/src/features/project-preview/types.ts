import type {
  DESIGN_DOCUMENT_VERSION,
  DesignDocument,
  FormatId,
  OutputFormat,
  ProceduralStyleId,
  QualityIssue,
  RenderManifest,
  TemplateId,
} from "@glyphkiln/core";

export type PreviewCatalogFormat = {
  id: FormatId;
  label: string;
  width: number;
  height: number;
};

export type PreviewCatalogTemplate = {
  id: TemplateId;
  label: string;
  version: string;
  supportedFormats: readonly FormatId[];
  requiredLayers?: readonly string[];
  description?: string;
};

export type PreviewCatalogProceduralStyle = {
  id: ProceduralStyleId;
  label: string;
  version: string;
};

export type PreviewCatalog = {
  schemaVersion: typeof DESIGN_DOCUMENT_VERSION;
  manifestVersion: string;
  coreVersion: string;
  renderer: {
    name: string;
    version: string;
  };
  productClaim: string;
  rendererConfiguration: Readonly<Record<string, string | number | boolean>>;
  developmentFontSha256: string;
  formats: readonly PreviewCatalogFormat[];
  templates: readonly PreviewCatalogTemplate[];
  proceduralStyles: readonly PreviewCatalogProceduralStyle[];
};

export type PreviewProblem = {
  path: string;
  code: string;
  message: string;
};

export type PreviewOutput = {
  format: OutputFormat;
  mimeType: "image/svg+xml" | "image/png";
  base64: string;
  byteSize: number;
  fingerprint: string;
  filename: string;
  manifest: RenderManifest;
};

export type PreviewSuccess = {
  ok: true;
  document: DesignDocument;
  qualityIssues: QualityIssue[];
  outputs: PreviewOutput[];
};

export type PreviewFailure = {
  ok: false;
  status: number;
  title: string;
  code: string;
  detail: string;
  problems?: PreviewProblem[];
  qualityIssues?: QualityIssue[];
};

export type PreviewResponse = PreviewSuccess | PreviewFailure;

export type BrandFormState = {
  name: string;
  snapshotId: string;
  version: string;
  mode: "light" | "dark";
  visualDensity: "quiet" | "balanced" | "dense";
  primary: string;
  secondary: string;
  accent: string;
  paper: string;
  surface: string;
  ink: string;
  mutedInk: string;
  darkBackground: string;
  darkSurface: string;
  darkText: string;
  darkMutedText: string;
  safeArea: number;
};

export type CompositionFormState = {
  templateId: TemplateId;
  formatId: FormatId;
  proceduralStyle: ProceduralStyleId;
  seed: string;
  intensity: number;
  density: number;
  complexity: number;
  contrast: number;
  quietRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type CopyFormState = {
  productAnnouncement: {
    eyebrow: string;
    headline: string;
    subtitle: string;
    cta: string;
  };
  statisticCard: {
    headline: string;
    value: string;
    label: string;
    trend: string;
  };
  quoteCard: {
    quote: string;
    attribution: string;
  };
  articleCover: {
    eyebrow: string;
    headline: string;
    attribution: string;
  };
  tiktokCarouselSlide: {
    mode: "narrative" | "metric";
    slideNumber: string;
    eyebrow: string;
    headline: string;
    subtitle: string;
    value: string;
    label: string;
    trend: string;
    cta: string;
    footer: string;
  };
};

export type PreviewFormState = {
  brand: BrandFormState;
  composition: CompositionFormState;
  copy: CopyFormState;
  resources: {
    assetIds: string[];
    fontIds: string[];
  };
};
