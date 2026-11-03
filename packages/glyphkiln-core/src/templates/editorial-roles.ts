import type { Bounds } from "../domain/types.js";
import { contrastRatio } from "../layout/index.js";
import type { PathElement } from "../renderer/scene.js";
import type { AccentShape } from "./accent-budget.js";
import { accentCoverage } from "./accent-budget.js";
import {
  COMMON_FORMATS,
  addHangingQuoteMark,
  syntheticLayer,
  unitFor,
} from "./editorial-fill.js";
import {
  addQuietRegionIssue,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
  type TemplateCanvas,
  type TextLayer,
} from "./shared.js";
import {
  addTypesetText,
  decorationJobIssue,
  enforceAccentBudget,
  measureTypesetText,
  typesetWithoutOrphan,
  resolveColorRoles,
  type ResolvedColorRoles,
  type TypesetOptions,
} from "./typeset.js";
import type { TemplateDefinition, TemplateRenderContext } from "./types.js";

/**
 * Editorial fill compositions with B2 type and color craft (1.3.0). Same
 * fill-the-field geometry as 1.2.0, plus: brand color roles with an accent
 * area budget, size-dependent tracking and leading, explicit OpenType
 * settings, rich-text emphasis in display copy, and procedural decoration
 * that renders only when it declares a job.
 */

type CopyField = { bounds: Bounds; ground: string };

function rolesCanvas(context: TemplateRenderContext): {
  canvas: TemplateCanvas;
  roles: ResolvedColorRoles;
  field: CopyField;
  decorationDrawn: boolean;
} {
  const roles = resolveColorRoles(context);
  const canvas = createTemplateCanvas(context, {
    decoration: "declared-job",
    ground: roles.ground,
  });
  const jobIssue = decorationJobIssue(context);
  if (jobIssue !== undefined) canvas.qualityIssues.push(jobIssue);
  const procedural = findLayer(context.document.layers, "procedural-decoration");
  const drawn =
    procedural !== undefined && "job" in procedural && procedural.job !== undefined;
  const safe = canvas.safeArea;
  if (!drawn) {
    return {
      canvas,
      roles,
      field: { bounds: { ...safe }, ground: canvas.backgroundColor },
      decorationDrawn: false,
    };
  }
  const { width, height } = canvas.scene.dimensions;
  const panel = {
    x: procedural.quietRegion.x * width,
    y: procedural.quietRegion.y * height,
    width: procedural.quietRegion.width * width,
    height: procedural.quietRegion.height * height,
  };
  const inset = Math.min(panel.width, panel.height) * 0.08;
  const x = Math.max(safe.x, panel.x + inset);
  const y = Math.max(safe.y, panel.y + inset);
  const right = Math.min(safe.x + safe.width, panel.x + panel.width - inset);
  const bottom = Math.min(safe.y + safe.height, panel.y + panel.height - inset);
  return {
    canvas,
    roles,
    field: {
      bounds: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) },
      ground: context.document.brand.themes[context.document.mode].surface,
    },
    decorationDrawn: true,
  };
}

function hasAccentEmphasis(layer: TextLayer): boolean {
  return (
    "emphasis" in layer &&
    (layer.emphasis ?? []).some(
      (span) => span.style === "accent" || span.style === "strong-accent",
    )
  );
}

/** The accent when it is legible on the ground, otherwise the figure color. */
function legibleAccent(
  roles: ResolvedColorRoles,
  ground: string,
  minimum: number,
): string {
  return contrastRatio(roles.accent, ground) >= minimum ? roles.accent : roles.figure;
}

function typeset(
  roles: ResolvedColorRoles,
  ground: string,
  options: Omit<TypesetOptions, "palette" | "contrastBackgroundColor">,
): TypesetOptions {
  return {
    ...options,
    palette: { accent: legibleAccent(roles, ground, 4.5), muted: roles.text },
    contrastBackgroundColor: ground,
  };
}

/** Accent coverage the layer would have if set in the given box. */
function predictedCoverage(
  context: TemplateRenderContext,
  canvas: TemplateCanvas,
  layer: TextLayer,
  box: Bounds,
  options: TypesetOptions,
): number {
  const fitted = measureTypesetText(context, canvas, layer, box, options);
  const setting = fitted.setting!;
  const outlines = context.fonts.outlineText({
    lines: fitted.lines,
    family:
      layer.fontFamily ??
      options.family ??
      context.document.brand.typography.headlineFamily,
    weight: layer.fontWeight ?? options.weight,
    style: "normal",
    fontSize: fitted.fontSize,
    lineHeight: setting.lineHeight,
    x: box.x,
    y: box.y,
    align: "left",
    letterSpacing: setting.letterSpacingEm * fitted.fontSize,
  });
  return accentCoverage(
    outlines.map((data) => ({ kind: "path" as const, data })),
    canvas.scene.dimensions,
  );
}

export const quoteCardRolesTemplate: TemplateDefinition = {
  id: "quote-card",
  version: "1.3.0",
  requiredLayers: ["headline", "attribution"],
  supportedLayers: ["background", "procedural-decoration", "headline", "attribution"],
  supportedFormats: COMMON_FORMATS,
  capabilities: {
    textEmphasis: ["headline"],
    openTypeFeatures: ["headline", "attribution"],
  },
  constraints: {
    headlineMaximumLines: 6,
    safeAreaBehavior:
      "Quote, hanging mark, and attribution stay inside the copy field and the brand safe area.",
    layout:
      "Typographic quote with color roles: the figure-colored quotation fills its field under a hanging accent mark; emphasis phrases carry weight or accent within the accent budget; decoration draws only with a declared job.",
  },
  render(context) {
    const { canvas, roles, field, decorationDrawn } = rolesCanvas(context);
    const unit = unitFor(canvas);
    const inner = field.bounds;
    const quote = findLayer(context.document.layers, "headline")!;
    const attribution = findLayer(context.document.layers, "attribution")!;

    const markBand = Math.min(inner.height * 0.16, 190 * unit);
    const attributionOptions = typeset(roles, field.ground, {
      preferredFontSize: 34 * unit,
      minimumFontSize: 16,
      maximumLines: 2,
      weight: 600,
      family: context.document.brand.typography.bodyFamily,
      role: "label",
      color: roles.text,
    });
    const attributionBox = {
      x: inner.x,
      y: inner.y,
      width: inner.width,
      height: 90 * unit,
    };
    const attributionFit = measureTypesetText(
      context,
      canvas,
      attribution,
      attributionBox,
      attributionOptions,
    );
    const gap = Math.max(36 * unit, inner.height * 0.04);
    const quoteBox = {
      x: inner.x,
      y: inner.y + markBand,
      width: inner.width,
      height: Math.max(1, inner.height - markBand - gap - attributionFit.height),
    };
    const quoteOptions = typesetWithoutOrphan(
      context,
      canvas,
      quote,
      quoteBox,
      typeset(roles, field.ground, {
        preferredFontSize: 168 * unit,
        minimumFontSize: 30,
        maximumLines: 6,
        weight: 700,
        role: "text",
        color: roles.figure,
      }),
    );
    const quoteFit = measureTypesetText(context, canvas, quote, quoteBox, quoteOptions);
    const blockHeight = markBand + quoteFit.height + gap + attributionFit.height;
    const top = inner.y + Math.max(0, (inner.height - blockHeight) / 2);

    const markId = `${quote.id}-mark`;
    addHangingQuoteMark(canvas, context, {
      id: markId,
      x: inner.x,
      bottom: top + markBand - Math.min(markBand * 0.18, quoteFit.fontSize * 0.2),
      inkHeight: Math.min(markBand * 0.72, quoteFit.fontSize * 0.62),
      // Accent once: an accent emphasis phrase takes the accent from the mark.
      color: hasAccentEmphasis(quote)
        ? roles.text
        : legibleAccent(roles, field.ground, 3),
    });
    const quoteText = addTypesetText(
      canvas,
      context,
      quote,
      { ...quoteBox, y: top + markBand },
      quoteOptions,
    );
    if (decorationDrawn) addQuietRegionIssue(canvas, context, quoteText.element.bounds);
    addTypesetText(
      canvas,
      context,
      attribution,
      {
        ...attributionBox,
        y: quoteText.element.bounds.y + quoteText.element.bounds.height + gap,
      },
      attributionOptions,
    );
    const mark = canvas.scene.elements.find(
      (element): element is PathElement =>
        element.id === markId && element.type === "path",
    );
    enforceAccentBudget(
      canvas,
      roles,
      mark?.fill === roles.accent ? [{ kind: "path", data: mark.data }] : [],
      quoteText.emphasis.filter((element) => element.fill === roles.accent),
    );
    return finishTemplate(canvas);
  },
};

export const statisticCardRolesTemplate: TemplateDefinition = {
  id: "statistic-card",
  version: "1.3.0",
  requiredLayers: ["statistic"],
  supportedLayers: ["background", "procedural-decoration", "headline", "statistic"],
  supportedFormats: COMMON_FORMATS,
  capabilities: {
    textEmphasis: ["headline"],
    openTypeFeatures: ["headline"],
  },
  constraints: {
    headlineMaximumLines: 2,
    safeAreaBehavior:
      "Headline, value, label, and trend stay inside the copy field and the brand safe area.",
    layout:
      "Hero statistic with color roles: the value fills the field and carries the accent when it fits the accent budget, otherwise it is set in the figure color over an accent rule; the trend uses the signal role and tabular numerals.",
  },
  render(context) {
    const { canvas, roles, field, decorationDrawn } = rolesCanvas(context);
    const unit = unitFor(canvas);
    const inner = field.bounds;
    const headline = findLayer(context.document.layers, "headline");
    const statistic = findLayer(context.document.layers, "statistic")!;
    const gap = Math.max(28 * unit, inner.height * 0.035);
    const accentShapes: AccentShape[] = [];
    const demotable: ReturnType<typeof addTypesetText>["emphasis"] = [];

    let cursor = inner.y;
    if (headline !== undefined) {
      const headlineBox = {
        x: inner.x,
        y: cursor,
        width: inner.width,
        height: inner.height * 0.24,
      };
      const headlineOptions = typesetWithoutOrphan(
        context,
        canvas,
        headline,
        headlineBox,
        typeset(roles, field.ground, {
          preferredFontSize: 64 * unit,
          minimumFontSize: 24,
          maximumLines: 2,
          weight: 700,
          role: "text",
          color: roles.figure,
        }),
      );
      const text = addTypesetText(
        canvas,
        context,
        headline,
        headlineBox,
        headlineOptions,
      );
      demotable.push(
        ...text.emphasis.filter((element) => element.fill === roles.accent),
      );
      cursor = text.element.bounds.y + text.element.bounds.height + gap * 1.5;
    }

    let bottom = inner.y + inner.height;
    if (statistic.trend !== undefined) {
      const trendLayer = syntheticLayer(
        `${statistic.id}-trend`,
        "footer",
        statistic.trend,
      );
      const trendOptions = typeset(roles, field.ground, {
        preferredFontSize: 36 * unit,
        minimumFontSize: 16,
        maximumLines: 1,
        weight: 600,
        family:
          context.document.brand.typography.monospaceFamily ??
          context.document.brand.typography.bodyFamily,
        role: "label",
        color: roles.signal,
        openTypeDefaults: { numerals: "tabular-lining" },
      });
      const trendBox = {
        x: inner.x,
        y: inner.y,
        width: inner.width,
        height: 60 * unit,
      };
      const trendFit = measureTypesetText(
        context,
        canvas,
        trendLayer,
        trendBox,
        trendOptions,
      );
      bottom -= trendFit.height;
      addTypesetText(
        canvas,
        context,
        trendLayer,
        { ...trendBox, y: bottom },
        trendOptions,
      );
      bottom -= gap;
    }

    const labelLayer = syntheticLayer(
      `${statistic.id}-label`,
      "subtitle",
      statistic.label,
    );
    const labelBox = {
      x: inner.x,
      y: cursor,
      width: inner.width,
      height: inner.height * 0.2,
    };
    const labelOptions = typesetWithoutOrphan(
      context,
      canvas,
      labelLayer,
      labelBox,
      typeset(roles, field.ground, {
        preferredFontSize: 54 * unit,
        minimumFontSize: 19,
        maximumLines: 2,
        weight: 500,
        family: context.document.brand.typography.bodyFamily,
        role: "text",
        color: roles.figure,
      }),
    );
    const labelFit = measureTypesetText(
      context,
      canvas,
      labelLayer,
      labelBox,
      labelOptions,
    );

    const valueLayer = syntheticLayer(
      `${statistic.id}-value`,
      "headline",
      statistic.value,
    );
    const accent = legibleAccent(roles, field.ground, 4.5);
    const fullValueBox = {
      x: inner.x,
      y: cursor,
      width: inner.width,
      height: Math.max(1, bottom - cursor - gap - labelFit.height),
    };
    const valueOptions = (color: string): TypesetOptions =>
      typeset(roles, field.ground, {
        preferredFontSize: 720 * unit,
        minimumFontSize: 56,
        maximumLines: 1,
        weight: 800,
        role: "text",
        color,
      });
    // Accent once, within budget. A headline accent phrase already carries
    // it; otherwise the value carries it when its ink fits the budget, and a
    // dominant too large for that is set in the figure color under an accent
    // kicker rule.
    let valueColor = demotable.length > 0 ? roles.figure : accent;
    let valueBox = fullValueBox;
    if (
      valueColor === roles.accent &&
      predictedCoverage(
        context,
        canvas,
        valueLayer,
        fullValueBox,
        valueOptions(accent),
      ) > roles.accentAreaBudget
    ) {
      valueColor = roles.figure;
      const ruleHeight = Math.max(6 * unit, gap * 0.3);
      const rule = {
        x: inner.x,
        y: cursor - gap * 0.5,
        width: Math.min(inner.width * 0.3, 240 * unit),
        height: ruleHeight,
      };
      canvas.scene.elements.push({
        id: `${statistic.id}-accent-rule`,
        type: "rect",
        ...rule,
        fill: roles.accent,
      });
      accentShapes.push({ kind: "rect", bounds: rule });
      const shift = ruleHeight + gap * 0.5;
      valueBox = {
        ...fullValueBox,
        y: fullValueBox.y + shift,
        height: Math.max(1, fullValueBox.height - shift),
      };
    }
    // Display leading is shorter than the figures' ink, so the overhang below
    // the line box is reserved inside the value box before the final fit.
    const overhang = (box: Bounds): number => {
      const fit = measureTypesetText(
        context,
        canvas,
        valueLayer,
        box,
        valueOptions(valueColor),
      );
      const ascent = context.fonts.ascent(
        context.document.brand.typography.headlineFamily,
        800,
        "normal",
      );
      return Math.max(0, ascent - fit.setting!.lineHeight) * fit.fontSize;
    };
    valueBox = {
      ...valueBox,
      height: Math.max(1, valueBox.height - overhang(valueBox)),
    };
    const valueOverhang = overhang(valueBox);
    const value = addTypesetText(
      canvas,
      context,
      valueLayer,
      valueBox,
      valueOptions(valueColor),
    );
    if (decorationDrawn) addQuietRegionIssue(canvas, context, value.element.bounds);
    if (valueColor === roles.accent) {
      accentShapes.push(
        ...value.element.outlines.map((data) => ({ kind: "path" as const, data })),
      );
    }
    addTypesetText(
      canvas,
      context,
      labelLayer,
      {
        ...labelBox,
        y: value.element.bounds.y + value.element.bounds.height + valueOverhang + gap,
      },
      labelOptions,
    );
    enforceAccentBudget(canvas, roles, accentShapes, demotable);
    return finishTemplate(canvas);
  },
};
