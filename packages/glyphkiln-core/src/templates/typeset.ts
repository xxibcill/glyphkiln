import type { Bounds, QualityIssue } from "../domain/types.js";
import { contrastIssue, safeAreaIssue } from "../layout/index.js";
import type {
  BrandColorRoleSet,
  OpenTypeFeatureSettings,
  TextEmphasisSpan,
} from "../schema/index.js";
import type { PathElement, TextElement } from "../renderer/scene.js";
import type { FittedText } from "../typography/index.js";
import {
  layoutText,
  missingGlyphIssue,
  type TextLayout,
} from "../typography/layout-text.js";
import {
  requestedOpenTypeFeatures,
  resolveOpenTypeFeatures,
} from "../typography/opentype.js";
import { emphasisFace, normalizePhrase } from "../typography/rich-text.js";
import { sizeSetting, type SizeSettingRole } from "../typography/size-setting.js";
import { createTypesetter } from "../typography/engine.js";
import type { FontModel } from "../typography/font-model.js";
import type { M1Typesetter } from "../typography/typesetter.js";
import { accentCoverage, type AccentShape } from "./accent-budget.js";
import type { TemplateCanvas, TextLayer } from "./shared.js";
import type { TemplateRenderContext } from "./types.js";

/**
 * Shared typesetting for template versions built on DesignDocument 1.7.0
 * (quote-card and statistic-card 1.3.0, image-led-campaign 1.2.0). Each of
 * those versions pins: size-setting@1.0.0, opentype-settings@1.0.0,
 * emphasis-runs@1.0.0, color-roles@1.0.0 and accent-coverage-grid@1.0.0.
 */
export const COLOR_ROLE_POLICY_VERSION = "color-roles@1.0.0" as const;
export const DEFAULT_ACCENT_AREA_BUDGET = 0.08;

export type ResolvedColorRoles = BrandColorRoleSet & {
  accentAreaBudget: number;
  source: "brand" | "derived";
};

/**
 * Brand color roles for the document mode. Without declared roles they are
 * derived from the theme and palette: ground = background, figure = text,
 * text = muted text, accent = palette accent, signal = text.
 */
export function resolveColorRoles(context: TemplateRenderContext): ResolvedColorRoles {
  const { document } = context;
  const brand = document.brand;
  if ("colorRoles" in brand && brand.colorRoles !== undefined) {
    return {
      ...brand.colorRoles[document.mode],
      accentAreaBudget: brand.colorRoles.accentAreaBudget,
      source: "brand",
    };
  }
  const theme = brand.themes[document.mode];
  return {
    ground: theme.background,
    figure: theme.text,
    text: theme.mutedText,
    accent: brand.palette.accent,
    signal: theme.text,
    accentAreaBudget: DEFAULT_ACCENT_AREA_BUDGET,
    source: "derived",
  };
}

export type TypesetOptions = {
  preferredFontSize: number;
  minimumFontSize: number;
  maximumLines: number;
  weight: number;
  family?: string;
  /** Size-setting curve; tracking and leading follow the fitted size. */
  role: SizeSettingRole;
  color: string;
  /** Colors for emphasized runs. */
  palette: { accent: string; muted: string };
  contrastBackgroundColor: string;
  checkContrast?: boolean;
  align?: "left" | "center" | "right";
  /** Template defaults merged under the layer's own openType settings. */
  openTypeDefaults?: OpenTypeFeatureSettings;
  /**
   * Brand typography role whose 1.8.0 font model (family, axes, optical
   * sizing, fallback stack, script faces) applies under the M1 engine.
   * Defaults to `label` for the label size curve and `display` otherwise.
   */
  fontRole?: "display" | "body" | "label";
};

export type TypesetText = {
  element: TextElement;
  emphasis: PathElement[];
  fitted: FittedText;
  family: string;
  weight: number;
};

type Prepared = {
  engine: M1Typesetter | undefined;
  family: string;
  weight: number;
  spans: TextEmphasisSpan[];
  issues: QualityIssue[];
  layout: TextLayout;
  fitted: FittedText;
};

function prepare(
  context: TemplateRenderContext,
  canvas: TemplateCanvas,
  layer: TextLayer,
  box: Bounds,
  options: TypesetOptions,
  detail: "measure" | "glyphs",
): Prepared {
  const role =
    context.typography === "m1" ? fontRoleModel(context, options) : undefined;
  const family =
    layer.fontFamily ??
    options.family ??
    role?.family ??
    context.document.brand.typography.headlineFamily;
  const weight = layer.fontWeight ?? options.weight;
  const issues: QualityIssue[] = [];
  const layerOpenType = "openType" in layer ? layer.openType : undefined;
  const features = resolveOpenTypeFeatures(layerOpenType, options.openTypeDefaults);
  for (const request of requestedOpenTypeFeatures(layerOpenType)) {
    if (context.fonts.hasFeature(family, weight, "normal", request.tag)) continue;
    issues.push({
      code: "OPENTYPE_FEATURE_UNAVAILABLE",
      severity: "warning",
      message: `Font "${family}" (${weight}) has no "${request.tag}" feature; "${request.setting}" is not applied.`,
      layerId: layer.id,
      details: { family, weight, setting: request.setting, tag: request.tag },
    });
  }
  const declared = new Set(
    context.document.fonts.map(
      (font) => `${font.family}\u0000${font.weight}\u0000${font.style}`,
    ),
  );
  const requestedSpans = "emphasis" in layer ? (layer.emphasis ?? []) : [];
  const spans: TextEmphasisSpan[] = [];
  for (const span of requestedSpans) {
    const face = emphasisFace(span.style, weight);
    const available =
      context.fonts.has(family, face.weight, face.style) &&
      declared.has(`${family}\u0000${face.weight}\u0000${face.style}`);
    if (available) {
      spans.push(span);
      continue;
    }
    issues.push({
      code: "TEXT_EMPHASIS_FACE_UNAVAILABLE",
      severity: "error",
      message: `Emphasis "${span.style}" needs a declared and supplied "${family}" ${face.weight} ${face.style} face.`,
      layerId: layer.id,
      details: {
        phrase: span.phrase,
        style: span.style,
        family,
        faceWeight: face.weight,
        faceStyle: face.style,
      },
    });
  }
  const keepTogether = [
    ...new Set([
      ...("keepTogether" in layer ? (layer.keepTogether ?? []) : []),
      ...spans.map((span) => normalizePhrase(span.phrase)),
    ]),
  ];
  const shortSide = Math.min(
    canvas.scene.dimensions.width,
    canvas.scene.dimensions.height,
  );
  const engine =
    context.typography === "m1"
      ? createTypesetter({
          registry: context.fonts,
          model: fontModelFor(layer, role, family, weight),
          shortSidePx: shortSide,
          layerId: layer.id,
          ...(features === undefined ? {} : { requestedFeatures: features }),
        })
      : undefined;
  const layout = layoutText({
    text: layer.text,
    registry: context.fonts,
    ...(engine === undefined ? {} : { engine }),
    face: { family, weight, style: "normal" },
    box,
    layerId: layer.id,
    sizing: {
      mode: "fit",
      preferredFontSize: layer.fontSize ?? options.preferredFontSize,
      minimumFontSize: options.minimumFontSize,
      maximumLines: Math.min(
        layer.maxLines ?? options.maximumLines,
        options.maximumLines,
      ),
      ...(keepTogether.length === 0 ? {} : { keepTogether }),
    },
    setting: {
      kind: "at-size",
      atSize: (fontSize) => {
        const setting = sizeSetting(options.role, fontSize, shortSide);
        return { lineHeight: setting.lineHeight, letterSpacingEm: setting.tracking };
      },
    },
    align: layer.align ?? options.align ?? "left",
    ...(features === undefined ? {} : { features }),
    ...(spans.length === 0 ? {} : { emphasis: spans }),
    detail,
    renderedLineLimit: options.maximumLines,
    coverage: "rendered-lines",
  });
  if (engine !== undefined) issues.push(...engine.issues);
  return { engine, family, weight, spans, issues, layout, fitted: layout.fitted! };
}

type RoleFontModel = Partial<Omit<FontModel, "weight" | "style">>;

/** The 1.8.0 font-model fields of the brand role a typeset element uses. */
function fontRoleModel(
  context: TemplateRenderContext,
  options: TypesetOptions,
): RoleFontModel | undefined {
  const typography = context.document.brand.typography;
  if (!("roles" in typography) || typography.roles === undefined) return undefined;
  const name = options.fontRole ?? (options.role === "label" ? "label" : "display");
  const role = typography.roles[name];
  if (role === undefined) return undefined;
  const model: RoleFontModel = { family: role.family };
  if ("axes" in role && role.axes !== undefined) model.axes = role.axes;
  if ("namedInstance" in role && role.namedInstance !== undefined) {
    model.namedInstance = role.namedInstance;
  }
  if ("opticalSizing" in role && role.opticalSizing !== undefined) {
    model.opticalSizing = role.opticalSizing;
  }
  if ("opsz" in role && role.opsz !== undefined) model.opsz = role.opsz;
  if ("fallback" in role && role.fallback !== undefined) model.fallback = role.fallback;
  if ("scriptFaces" in role && role.scriptFaces !== undefined) {
    model.scriptFaces = role.scriptFaces;
  }
  return model;
}

/** Layer 1.8.0 font-model fields override the role's; the face is the layer's. */
function fontModelFor(
  layer: TextLayer,
  role: RoleFontModel | undefined,
  family: string,
  weight: number,
): FontModel {
  const model: FontModel = { ...role, family, weight, style: "normal" };
  if ("axes" in layer && layer.axes !== undefined) model.axes = layer.axes;
  if ("namedInstance" in layer && layer.namedInstance !== undefined) {
    model.namedInstance = layer.namedInstance;
  }
  if ("opticalSizing" in layer && layer.opticalSizing !== undefined) {
    model.opticalSizing = layer.opticalSizing;
  }
  if ("opsz" in layer && layer.opsz !== undefined) model.opsz = layer.opsz;
  return model;
}

/** Fit exactly as addTypesetText does, without adding anything to the scene. */
export function measureTypesetText(
  context: TemplateRenderContext,
  canvas: TemplateCanvas,
  layer: TextLayer,
  box: Bounds,
  options: TypesetOptions,
): FittedText {
  return prepare(context, canvas, layer, box, options, "measure").fitted;
}

export function addTypesetText(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  layer: TextLayer,
  box: Bounds,
  options: TypesetOptions,
): TypesetText {
  const prepared = prepare(context, canvas, layer, box, options, "glyphs");
  const { family, weight, fitted, layout, engine } = prepared;
  const lineHeight = layout.lineHeight;
  const letterSpacing = layout.letterSpacing!;
  const align = layer.align ?? options.align ?? "left";
  const x = layout.anchor.x;
  const bounds = layout.bounds;
  const fill = layer.color ?? options.color;
  const lines = layout.lines.map((line) => line.text);
  canvas.qualityIssues.push(...prepared.issues);
  if (layout.missingCodePoints.length > 0) {
    canvas.qualityIssues.push(
      missingGlyphIssue(
        layer.id,
        engine === undefined
          ? `Font "${family}" does not cover all text in layer "${layer.id}".`
          : `No face in the stack ${engine
              .stackFamilies()
              .map((name) => `"${name}"`)
              .join(", ")} covers all text in layer "${layer.id}".`,
        layout.missingCodePoints,
        engine?.stackFamilies(),
      ),
    );
  }
  canvas.qualityIssues.push(...layout.issues);
  const safe = safeAreaIssue(canvas.safeArea, bounds, layer.id);
  if (safe !== undefined) canvas.qualityIssues.push(safe);
  if (options.checkContrast !== false) {
    const contrast = contrastIssue(fill, options.contrastBackgroundColor, layer.id);
    if (contrast !== undefined) canvas.qualityIssues.push(contrast);
  }

  const outlines = layout.lines.map((line) => line.set!.outline);
  const emphasis: PathElement[] = [];
  if (prepared.spans.length > 0) {
    const checkedColors = new Set<string>();
    for (const [lineIndex, line] of layout.lines.entries()) {
      for (const [runIndex, run] of line.set!.emphasis.entries()) {
        const runFill =
          run.style === "accent" || run.style === "strong-accent"
            ? options.palette.accent
            : run.style === "muted"
              ? options.palette.muted
              : fill;
        if (options.checkContrast !== false && !checkedColors.has(runFill)) {
          checkedColors.add(runFill);
          const contrast = contrastIssue(
            runFill,
            options.contrastBackgroundColor,
            layer.id,
          );
          if (contrast !== undefined) canvas.qualityIssues.push(contrast);
        }
        const runBounds = {
          x: run.x,
          y: box.y + lineIndex * fitted.fontSize * lineHeight,
          width: run.width,
          height: fitted.fontSize * lineHeight,
        };
        emphasis.push({
          id: `${layer.id}-emphasis-${lineIndex}-${runIndex}`,
          type: "path",
          data: run.data,
          fill: runFill,
          // The base text element's accessible label already carries the
          // phrase; the run is drawn glyphs with face provenance.
          semantic: { role: "decoration" },
          glyphRun: {
            layerId: layer.id,
            text: run.text,
            fontFamily: family,
            fontWeight: run.face.weight,
            fontStyle: run.face.style,
            fontSize: fitted.fontSize,
            bounds: runBounds,
          },
        });
      }
    }
  }
  const element: TextElement = {
    id: layer.id,
    type: "text",
    x,
    y: box.y,
    lines,
    fill,
    fontFamily: family,
    fontWeight: weight,
    fontStyle: "normal",
    fontSize: fitted.fontSize,
    lineHeight,
    align,
    letterSpacing,
    bounds,
    outlines,
    ...(engine === undefined
      ? {}
      : { faces: engine.usedFaces(), fontStack: engine.stackFamilies() }),
  };
  canvas.scene.elements.push(element, ...emphasis);
  canvas.evidence.text.push({
    layerId: layer.id,
    bounds: { ...bounds },
    lineCount: lines.length,
    maximumLines: options.maximumLines,
    fontSize: fitted.fontSize,
    overflow: fitted.issues.some((issue) => issue.code === "TEXT_OVERFLOW"),
  });
  return { element, emphasis, fitted, family, weight };
}

/** Step display type down (to 80% of the first fit) to avoid an orphan line. */
export function typesetWithoutOrphan(
  context: TemplateRenderContext,
  canvas: TemplateCanvas,
  layer: TextLayer,
  box: Bounds,
  options: TypesetOptions,
): TypesetOptions {
  let fitted = measureTypesetText(context, canvas, layer, box, options);
  const floor = Math.max(options.minimumFontSize, fitted.fontSize * 0.8);
  let current = options;
  while (fitted.issues.some((issue) => issue.code === "ORPHAN_LINE")) {
    const next = fitted.fontSize - 1;
    if (next < floor) return options;
    current = { ...options, preferredFontSize: next };
    fitted = measureTypesetText(context, canvas, layer, box, current);
  }
  return current;
}

/**
 * Hold accent use to the brand's area budget. Accent-colored emphasis runs are
 * demoted to the figure color last-first until coverage fits; anything still
 * over budget is reported, not hidden.
 */
export function enforceAccentBudget(
  canvas: TemplateCanvas,
  roles: ResolvedColorRoles,
  fixed: readonly AccentShape[],
  demotable: readonly PathElement[],
): number {
  const dimensions = canvas.scene.dimensions;
  const active = [...demotable];
  const measure = (): number =>
    accentCoverage(
      [
        ...fixed,
        ...active.map((element) => ({ kind: "path" as const, data: element.data })),
      ],
      dimensions,
    );
  let coverage = measure();
  const demoted: string[] = [];
  while (coverage > roles.accentAreaBudget && active.length > 0) {
    const element = active.pop()!;
    element.fill = roles.figure;
    demoted.push(element.id);
    coverage = measure();
  }
  if (demoted.length > 0) {
    canvas.qualityIssues.push({
      code: "ACCENT_BUDGET_APPLIED",
      severity: "warning",
      message: `Accent emphasis was set in the figure color to keep accent area within ${formatPercent(roles.accentAreaBudget)}.`,
      details: { demoted, budget: roles.accentAreaBudget, coverage: round(coverage) },
    });
  }
  if (coverage > roles.accentAreaBudget) {
    canvas.qualityIssues.push({
      code: "ACCENT_AREA_BUDGET_EXCEEDED",
      severity: "warning",
      message: `Accent covers ${formatPercent(coverage)} of the canvas; the brand budget is ${formatPercent(roles.accentAreaBudget)}.`,
      details: { budget: roles.accentAreaBudget, coverage: round(coverage) },
    });
  }
  return coverage;
}

/**
 * Decoration-off rule for 1.7.0-era templates: a procedural layer renders only
 * when it declares a job. Without one it is reported and not drawn.
 */
export function decorationJobIssue(
  context: TemplateRenderContext,
): QualityIssue | undefined {
  const layer = context.document.layers.find(
    (candidate) => candidate.type === "procedural-decoration" && candidate.visible,
  );
  if (layer?.type !== "procedural-decoration") return undefined;
  if ("job" in layer && layer.job !== undefined) return undefined;
  return {
    code: "DECORATION_WITHOUT_JOB",
    severity: "warning",
    message:
      "Procedural decoration is off by default in this template version; declare a job (atmosphere or identity) to draw it.",
    layerId: layer.id,
    details: { style: layer.style },
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
