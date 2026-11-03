import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  DESIGN_DOCUMENT_RUNTIME_REFINEMENTS,
  FontRegistry,
  GlyphkilnError,
  getDesignDocumentJsonSchema,
  renderGraphic,
  validateDesignDocument,
  type DesignDocument,
  type DesignLayer,
  type QualityIssue,
} from "../src/index.js";
import { rasterizeSvg } from "../src/renderer/png.js";
import { prepareGraphicScene, renderSceneToSvg } from "../src/renderer/index.js";
import type { TemplateCanvas } from "../src/templates/shared.js";
import { enforceAccentBudget } from "../src/templates/typeset.js";
import { accentCoverage, pathEdges } from "../src/templates/accent-budget.js";
import { copyRegion, localScrim } from "../src/templates/image-led-campaign-local.js";
import {
  requestedOpenTypeFeatures,
  resolveOpenTypeFeatures,
} from "../src/typography/opentype.js";
import {
  createEmphasisMeasurer,
  emphasisFace,
  splitEmphasisRuns,
} from "../src/typography/rich-text.js";
import {
  SIZE_SETTING_CURVES,
  SIZE_SETTING_POLICY_VERSION,
  sizeSetting,
} from "../src/typography/size-setting.js";
import { loadExampleAssets } from "./helpers.js";

const ROLES = {
  light: {
    ground: "#F9FAFB",
    figure: "#111827",
    text: "#4B5563",
    accent: "#7C3AED",
    signal: "#111827",
  },
  dark: {
    ground: "#111827",
    figure: "#F9FAFB",
    text: "#D1D5DB",
    accent: "#FBBF24",
    signal: "#F9FAFB",
  },
};

async function baseline(name: string): Promise<DesignDocument> {
  return JSON.parse(
    await readFile(resolve(`tests/visual/baselines/${name}.design.json`), "utf8"),
  ) as DesignDocument;
}

type LooseLayer = Record<string, unknown> & {
  emphasis?: { phrase: string; style: string }[];
  openType?: Record<string, unknown>;
};

function layer(document: DesignDocument, type: DesignLayer["type"]): LooseLayer {
  return document.layers.find(
    (candidate) => candidate.type === type,
  ) as unknown as LooseLayer;
}

async function render(document: DesignDocument, formats: ("svg" | "png")[] = ["svg"]) {
  return renderGraphic(document, {
    formats,
    assets: await loadExampleAssets(document),
  });
}

async function blockedIssues(document: DesignDocument): Promise<QualityIssue[]> {
  try {
    await render(document);
  } catch (error) {
    if (error instanceof GlyphkilnError && error.code === "QUALITY_VALIDATION_FAILED") {
      return (error.details?.["issues"] ?? []) as QualityIssue[];
    }
    throw error;
  }
  throw new Error("Expected rendering to be blocked.");
}

function svgText(result: Awaited<ReturnType<typeof render>>): string {
  return new TextDecoder().decode(result.outputs[0]!.bytes);
}

describe("DesignDocument 1.7.0 schema", () => {
  it("accepts every B2 field and rejects each one in schema 1.6.0", async () => {
    const quote = await baseline("quote-card-roles");
    const campaign = await baseline("image-led-campaign-local-square");
    const statistic = await baseline("statistic-card-roles");
    for (const document of [quote, campaign, statistic]) {
      expect(validateDesignDocument(document).success).toBe(true);
      const legacy = { ...structuredClone(document), schemaVersion: "1.6.0" };
      expect(validateDesignDocument(legacy).success).toBe(false);
    }
  });

  it("publishes the new fields in JSON Schema and the runtime refinements", () => {
    const schema = JSON.stringify(getDesignDocumentJsonSchema());
    for (const field of [
      "emphasis",
      "openType",
      "subjectRegion",
      "colorRoles",
      "accentAreaBudget",
      "local-dark-scrim",
      "atmosphere",
    ]) {
      expect(schema).toContain(field);
    }
    expect(DESIGN_DOCUMENT_RUNTIME_REFINEMENTS.map((rule) => rule.code)).toEqual(
      expect.arrayContaining([
        "EMPHASIS_PHRASE_IN_TEXT",
        "UNIQUE_EMPHASIS_PHRASES",
        "SUBJECT_REGION_HORIZONTAL_BOUNDS",
        "SUBJECT_REGION_VERTICAL_BOUNDS",
      ]),
    );
  });

  it("requires emphasis phrases to occur once-declared in the layer text", async () => {
    const document = await baseline("quote-card-roles");
    layer(document, "headline").emphasis = [
      { phrase: "not in the quote", style: "accent" },
    ];
    const missing = validateDesignDocument(document);
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.problems[0]?.path).toBe("layers[2].emphasis[0].phrase");
    }
    layer(document, "headline").emphasis = [
      { phrase: "repeatable", style: "accent" },
      { phrase: "repeatable", style: "strong" },
    ];
    expect(validateDesignDocument(document).success).toBe(false);
    layer(document, "headline").emphasis = [
      { phrase: "Good   systems", style: "strong" },
    ];
    expect(validateDesignDocument(document).success).toBe(true);
  });

  it("bounds color roles, the accent budget, and the subject region", async () => {
    const document = await baseline("statistic-card-roles");
    const brand = document.brand as DesignDocument["brand"] & {
      colorRoles: { accentAreaBudget: number };
    };
    brand.colorRoles.accentAreaBudget = 0.5;
    expect(validateDesignDocument(document).success).toBe(false);
    const campaign = await baseline("image-led-campaign-local-square");
    const image = layer(campaign, "image") as Extract<
      DesignLayer,
      { type: "image" }
    > & {
      subjectRegion: { x: number; width: number };
    };
    image.subjectRegion.x = 0.9;
    expect(validateDesignDocument(campaign).success).toBe(false);
  });
});

describe("explicit template capabilities", () => {
  it("rejects 1.7.0 fields on template versions that do not implement them", async () => {
    const quote = await baseline("quote-card-roles");
    quote.template.version = "1.2.0";
    const issues = await blockedIssues(quote);
    expect(
      issues.filter((issue) => issue.code === "TEMPLATE_FEATURE_UNSUPPORTED"),
    ).toEqual([
      expect.objectContaining({
        layerId: "quote",
        details: expect.objectContaining({ feature: "emphasis" }) as unknown,
      }),
      expect.objectContaining({
        layerId: "attribution",
        details: expect.objectContaining({ feature: "openType" }) as unknown,
      }),
    ]);

    for (const version of ["1.0.1", "1.1.1"]) {
      const campaign = await baseline("image-led-campaign-local-square");
      campaign.template.version = version;
      const features = (await blockedIssues(campaign))
        .filter((issue) => issue.code === "TEMPLATE_FEATURE_UNSUPPORTED")
        .map((issue) => issue.details?.["feature"]);
      expect(features).toEqual([
        "treatment:local-dark-scrim",
        "subjectRegion",
        "emphasis",
      ]);
    }
  });
});

describe("OpenType feature control", () => {
  it("maps closed settings to a sorted, frozen tag map", () => {
    expect(resolveOpenTypeFeatures(undefined)).toBeUndefined();
    expect(resolveOpenTypeFeatures({})).toBeUndefined();
    expect(
      resolveOpenTypeFeatures({
        kerning: false,
        ligatures: false,
        numerals: "tabular-oldstyle",
        caseSensitiveForms: true,
        smallCaps: true,
      }),
    ).toEqual({
      case: true,
      clig: false,
      kern: false,
      liga: false,
      onum: true,
      smcp: true,
      tnum: true,
    });
    expect(resolveOpenTypeFeatures({ numerals: "proportional-lining" })).toEqual({
      lnum: true,
      pnum: true,
    });
    expect(resolveOpenTypeFeatures({}, { numerals: "tabular-lining" })).toEqual({
      lnum: true,
      tnum: true,
    });
    expect(
      resolveOpenTypeFeatures(
        { numerals: "proportional-oldstyle" },
        { numerals: "tabular-lining" },
      ),
    ).toEqual({ onum: true, pnum: true });
    expect(
      requestedOpenTypeFeatures({
        ligatures: true,
        numerals: "tabular-oldstyle",
        caseSensitiveForms: true,
        smallCaps: true,
        kerning: false,
      }).map((request) => request.tag),
    ).toEqual(["liga", "tnum", "onum", "case", "smcp"]);
  });

  it("shapes through fontkit with the requested features and leaves the default path unchanged", () => {
    const fonts = new FontRegistry();
    const text = "Office 1,111 (H-x)";
    const plain = fonts.measure(text, "Inter", 700, "normal", 100);
    expect(fonts.measure(text, "Inter", 700, "normal", 100, 0, undefined)).toBe(plain);
    expect(
      fonts.measure(text, "Inter", 700, "normal", 100, 0, { tnum: true }),
    ).not.toBe(plain);
    expect(
      fonts.measure(text, "Inter", 700, "normal", 100, 0, { kern: false }),
    ).not.toBe(plain);
    const outlined = (features?: Record<string, boolean>) =>
      fonts.outlineText({
        lines: ["(H-x)"],
        family: "Inter",
        weight: 700,
        style: "normal",
        fontSize: 80,
        lineHeight: 1,
        x: 0,
        y: 0,
        align: "left",
        ...(features === undefined ? {} : { features }),
      })[0];
    expect(outlined({ case: true })).not.toBe(outlined());
    expect(fonts.hasFeature("Inter", 400, "normal", "tnum")).toBe(true);
    expect(fonts.hasFeature("Inter", 400, "normal", "smcp")).toBe(false);
  });

  it("reports requested features the face does not have instead of faking them", async () => {
    const document = await baseline("quote-card-roles");
    layer(document, "attribution").openType = {
      smallCaps: true,
      numerals: "tabular-oldstyle",
    };
    const result = await render(document);
    expect(
      result.qualityIssues
        .filter((issue) => issue.code === "OPENTYPE_FEATURE_UNAVAILABLE")
        .map((issue) => issue.details?.["tag"]),
    ).toEqual(["onum", "smcp"]);
  });
});

describe("size-dependent tracking and leading", () => {
  it("interpolates fixed, versioned curves keyed by size on a 1080 px short side", () => {
    expect(SIZE_SETTING_POLICY_VERSION).toBe("size-setting@1.0.0");
    expect(sizeSetting("text", 10, 1080)).toEqual({ tracking: 0.01, lineHeight: 1.42 });
    expect(sizeSetting("text", 400, 1080)).toEqual({
      tracking: -0.035,
      lineHeight: 0.94,
    });
    expect(sizeSetting("text", 30, 1080)).toEqual({ tracking: 0, lineHeight: 1.29 });
    // The same relative size gives the same setting on any canvas.
    expect(sizeSetting("text", 56 * 2, 2160)).toEqual(sizeSetting("text", 56, 1080));
    expect(sizeSetting("label", 14, 1080).tracking).toBeGreaterThan(
      sizeSetting("label", 64, 1080).tracking,
    );
    for (const stops of Object.values(SIZE_SETTING_CURVES)) {
      for (let index = 1; index < stops.length; index += 1) {
        expect(stops[index]![0]).toBeGreaterThan(stops[index - 1]![0]);
        expect(stops[index]![1]).toBeLessThan(stops[index - 1]![1]);
        expect(stops[index]![2]).toBeLessThan(stops[index - 1]![2]);
      }
    }
  });

  it("sets display type tighter than supporting copy in the rendered scene", async () => {
    const result = await render(await baseline("quote-card-roles"));
    const svg = svgText(result);
    expect(svg).toContain('id="quote"');
    const evidence = result.evidence.text;
    const quote = evidence.find((entry) => entry.layerId === "quote")!;
    const attribution = evidence.find((entry) => entry.layerId === "attribution")!;
    expect(quote.fontSize).toBeGreaterThan(attribution.fontSize * 2);
  });
});

describe("rich-text emphasis", () => {
  const spans = [
    { phrase: "art", style: "accent" as const },
    { phrase: "the glow", style: "strong" as const },
    { phrase: "the glow.", style: "muted" as const },
  ];

  it("matches whole words, earliest first and longest at the same start", () => {
    expect(splitEmphasisRuns("start the art of the glow.", spans)).toEqual([
      { text: "start the " },
      { text: "art", style: "accent" },
      { text: " of " },
      { text: "the glow.", style: "muted" },
    ]);
    expect(splitEmphasisRuns("nothing here", spans)).toEqual([
      { text: "nothing here" },
    ]);
    expect(splitEmphasisRuns("", spans)).toEqual([{ text: "" }]);
    expect(splitEmphasisRuns("แสงไฟ", [{ phrase: "ไฟ", style: "accent" }])).toEqual([
      { text: "แสง" },
      { text: "ไฟ", style: "accent" },
    ]);
  });

  it("chooses closed faces from the base weight", () => {
    expect(emphasisFace("strong", 400)).toEqual({ weight: 700, style: "normal" });
    expect(emphasisFace("strong-accent", 800)).toEqual({
      weight: 900,
      style: "normal",
    });
    expect(emphasisFace("italic", 500)).toEqual({ weight: 500, style: "italic" });
    expect(emphasisFace("accent", 600)).toEqual({ weight: 600, style: "normal" });
    expect(emphasisFace(undefined, 600)).toEqual({ weight: 600, style: "normal" });
  });

  it("measures emphasized runs in their own faces", () => {
    const fonts = new FontRegistry();
    const measurer = createEmphasisMeasurer(
      fonts,
      [{ phrase: "lamp", style: "strong" }],
      undefined,
    );
    const plain = fonts.measure("one lamp", "Inter", 400, "normal", 50, 2);
    const rich = measurer.measure("one lamp", "Inter", 400, "normal", 50, 2);
    expect(rich).toBeCloseTo(
      fonts.measure("one ", "Inter", 400, "normal", 50, 2) +
        2 +
        fonts.measure("lamp", "Inter", 700, "normal", 50, 2),
      9,
    );
    expect(rich).toBeGreaterThan(plain);
    expect(measurer.measure("no match", "Inter", 400, "normal", 50, 2)).toBe(
      fonts.measure("no match", "Inter", 400, "normal", 50, 2),
    );
  });

  it("renders emphasis as accessible-hidden runs over one labelled text element", async () => {
    const result = await render(await baseline("quote-card-roles"));
    const svg = svgText(result);
    expect(svg).toMatch(
      /<g id="quote" role="group" aria-label="Good systems make the right thing repeatable without making the result feel repetitive\.">/,
    );
    expect(svg).toMatch(
      /<path id="quote-emphasis-\d+-0" d="[^"]+" fill="#FBBF24" data-semantic-role="decoration" aria-hidden="true"\/>/,
    );
    expect(svg).toContain('fill="#FBBF24"');
    // Accent once: the hanging mark gives the accent to the emphasis phrase.
    expect(svg).toMatch(/<path id="quote-mark" d="[^"]+" fill="#D1D5DB"\/>/);
  });

  it("keeps emphasis phrases on one line", async () => {
    const document = await baseline("quote-card-roles");
    layer(document, "headline").emphasis = [
      { phrase: "without making the result", style: "strong" },
    ];
    document.fonts.push({ ...document.fonts[0]!, weight: 900 });
    const result = await render(document);
    expect(svgText(result)).toMatch(/aria-hidden="true"/);
    const runs = [...svgText(result).matchAll(/id="quote-emphasis-(\d+)-(\d+)"/g)];
    expect(runs).toHaveLength(1);
    // The emphasis face is recorded in manifest font provenance.
    const manifest = result.outputs[0]!.manifest as unknown as {
      fonts: { family: string; weight: number; style: string }[];
    };
    expect(manifest.fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "Inter", weight: 900, style: "normal" }),
        expect.objectContaining({ family: "Inter", weight: 700, style: "normal" }),
      ]),
    );
  });

  it("blocks emphasis whose face is not declared and supplied", async () => {
    const document = await baseline("quote-card-roles");
    layer(document, "headline").emphasis = [{ phrase: "repeatable", style: "italic" }];
    const issues = await blockedIssues(document);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "TEXT_EMPHASIS_FACE_UNAVAILABLE",
        details: expect.objectContaining({
          faceStyle: "italic",
          faceWeight: 700,
        }) as unknown,
      }),
    );
    layer(document, "headline").emphasis = [{ phrase: "repeatable", style: "strong" }];
    expect((await blockedIssues(document)).map((issue) => issue.code)).toContain(
      "TEXT_EMPHASIS_FACE_UNAVAILABLE",
    );
  });
});

describe("brand color roles and the accent budget", () => {
  it("measures union ink coverage on a deterministic grid", () => {
    const canvas = { width: 1080, height: 1080 };
    expect(accentCoverage([], canvas)).toBe(0);
    expect(
      accentCoverage(
        [{ kind: "rect", bounds: { x: 0, y: 0, width: 540, height: 1080 } }],
        canvas,
      ),
    ).toBe(0.5);
    // Overlapping shapes count once (nonzero winding).
    expect(
      accentCoverage(
        [
          { kind: "rect", bounds: { x: 0, y: 0, width: 540, height: 540 } },
          { kind: "rect", bounds: { x: 0, y: 0, width: 540, height: 540 } },
        ],
        canvas,
      ),
    ).toBe(0.25);
    // A ring: outer clockwise, inner counter-clockwise.
    const ring =
      "M 0 0 L 1080 0 L 1080 1080 L 0 1080 Z M 270 270 L 270 810 L 810 810 L 810 270 Z";
    expect(accentCoverage([{ kind: "path", data: ring }], canvas)).toBe(0.75);
    expect(pathEdges("M 0 0 Q 10 10 20 0 C 30 10 40 10 50 0 Z")).toHaveLength(17);
    expect(pathEdges("M 0 0 L 10 0 X 5 5")).toHaveLength(1);
  });

  it("uses declared roles for ground, figure, text, accent, and signal", async () => {
    const svg = svgText(await render(await baseline("statistic-card-roles")));
    expect(svg).toContain('<rect width="1080" height="1080" fill="#F9FAFB"/>');
    expect(svg).toMatch(
      /<g id="retention-value"[^>]*><path id="retention-value-line-0" d="[^"]+" fill="#111827"/,
    );
    expect(svg).toMatch(/<path id="retention-trend-line-0" d="[^"]+" fill="#0E7490"/);
    expect(svg).toMatch(/<path id="headline-emphasis-1-0" d="[^"]+" fill="#4B5563"/);
    // The 87% is too large to carry the accent inside 8%, so it becomes a rule.
    expect(svg).toMatch(/<rect id="retention-accent-rule" [^>]*fill="#7C3AED"\/>/);
  });

  it("keeps a small value in the accent and demotes emphasis that would exceed the budget", async () => {
    const small = await baseline("statistic-card-roles");
    const brand = small.brand as DesignDocument["brand"] & {
      colorRoles: { accentAreaBudget: number };
    };
    brand.colorRoles.accentAreaBudget = 0.3;
    const roomy = svgText(await render(small));
    expect(roomy).not.toContain("retention-accent-rule");
    expect(roomy).toMatch(/id="retention-value-line-0" d="[^"]+" fill="#7C3AED"/);

    const tight = await baseline("quote-card-roles");
    layer(tight, "headline").emphasis = [
      { phrase: "making the result", style: "accent" },
    ];
    (tight.brand as unknown as { colorRoles: unknown }).colorRoles = {
      light: ROLES.light,
      dark: ROLES.dark,
      accentAreaBudget: 0.01,
    };
    const result = await render(tight);
    const applied = result.qualityIssues.find(
      (issue) => issue.code === "ACCENT_BUDGET_APPLIED",
    );
    expect(applied?.details?.["demoted"]).toEqual([
      expect.stringMatching(/^quote-emphasis-/),
    ]);
    const demoted = (applied!.details!["demoted"] as string[])[0]!;
    expect(svgText(result)).toMatch(
      new RegExp(`id="${demoted}" d="[^"]+" fill="#F9FAFB"`),
    );
  });

  it("reports a fixed accent that is still over budget", () => {
    const canvas = {
      scene: { dimensions: { width: 100, height: 100 } },
      qualityIssues: [] as QualityIssue[],
    } as unknown as TemplateCanvas;
    const coverage = enforceAccentBudget(
      canvas,
      { ...ROLES.dark, accentAreaBudget: 0.08, source: "brand" },
      [{ kind: "rect", bounds: { x: 0, y: 0, width: 50, height: 50 } }],
      [],
    );
    expect(coverage).toBe(0.25);
    expect(canvas.qualityIssues).toEqual([
      expect.objectContaining({
        code: "ACCENT_AREA_BUDGET_EXCEEDED",
        details: { budget: 0.08, coverage: 0.25 },
      }),
    ]);
  });

  it("checks role colors against prohibited brand colors", async () => {
    const document = await baseline("statistic-card-roles");
    document.brand.prohibitedColors = ["#0E7490"];
    expect((await blockedIssues(document)).map((issue) => issue.code)).toContain(
      "PROHIBITED_COLOR",
    );
  });
});

describe("procedural decoration off by default", () => {
  it("draws decoration only when the layer declares a job", async () => {
    const withJob = svgText(await render(await baseline("quote-card-roles")));
    expect(withJob).toContain('id="brand-surface"');

    const document = await baseline("quote-card-roles");
    delete (layer(document, "procedural-decoration") as { job?: unknown }).job;
    const result = await render(document);
    const svg = svgText(result);
    expect(svg).not.toContain('id="brand-surface"');
    expect(result.qualityIssues).toContainEqual(
      expect.objectContaining({ code: "DECORATION_WITHOUT_JOB", layerId: "contours" }),
    );
    expect(result.qualityIssues.map((issue) => issue.code)).not.toContain(
      "QUIET_REGION_MISALIGNED",
    );

    const statistic = await baseline("statistic-card-roles");
    (statistic.layers as DesignLayer[]).splice(1, 0, {
      id: "grid",
      type: "procedural-decoration",
      visible: true,
      style: "recursive-subdivision",
      intensity: 0.4,
      density: 0.4,
      complexity: 0.4,
      contrast: 0.3,
      quietRegion: { x: 0.04, y: 0.31, width: 0.92, height: 0.54 },
      job: "identity",
    } as DesignLayer);
    const drawn = await render(statistic);
    expect(svgText(drawn)).toContain('id="brand-surface"');
    expect(drawn.qualityIssues.map((issue) => issue.code)).not.toContain(
      "DECORATION_WITHOUT_JOB",
    );
  });
});

describe("local image darkening", () => {
  it("places the copy column on the largest free side outside the subject", () => {
    const safe = { x: 100, y: 100, width: 880, height: 880 };
    expect(copyRegion(safe, undefined, false, 1)).toEqual({
      bounds: { x: 100, y: 100, width: 880 * 0.82, height: 880 },
      side: "default",
      overlapsSubject: false,
    });
    const right = copyRegion(
      safe,
      { x: 100, y: 100, width: 300, height: 880 },
      false,
      1,
    );
    expect(right.side).toBe("right");
    expect(right.bounds.x + right.bounds.width).toBe(980);
    const bottom = copyRegion(
      safe,
      { x: 100, y: 100, width: 880, height: 300 },
      true,
      1,
    );
    expect(bottom.side).toBe("bottom");
    const none = copyRegion(
      safe,
      { x: 200, y: 200, width: 700, height: 700 },
      false,
      1,
    );
    expect(none).toMatchObject({ side: "default", overlapsSubject: true });
  });

  it("builds a feathered scrim that stops before the subject and is masked out of it", () => {
    const canvas = { x: 0, y: 0, width: 1080, height: 1080 };
    const subject = { x: 600, y: 100, width: 400, height: 800 };
    const layers = localScrim(
      "scrim",
      "local-dark-scrim",
      { x: 80, y: 100, width: 400, height: 300 },
      subject,
      canvas,
      1,
    );
    expect(layers).toHaveLength(24);
    const combined = 1 - (1 - layers[0]!.opacity!) ** layers.length;
    expect(combined).toBeCloseTo(0.6, 3);
    for (const element of layers) {
      expect(element.x + element.width).toBeLessThanOrEqual(subject.x - 12 + 1e-9);
      expect(element.exclusion?.bounds).toEqual(subject);
    }
    const open = localScrim(
      "scrim",
      "local-light-scrim",
      { x: 80, y: 100, width: 400, height: 300 },
      undefined,
      canvas,
      1,
    );
    expect(open[0]!.fill).toBe("#FFFFFF");
    expect(open[0]!.exclusion).toBeUndefined();
  });

  it("darkens behind copy but leaves product pixels exactly as with no treatment", async () => {
    const local = await baseline("image-led-campaign-local-square");
    const assets = await loadExampleAssets(local);
    const rendered = await renderGraphic(local, { formats: ["png"], assets });
    // The same scene without its scrim layers is the untreated photograph.
    const validated = validateDesignDocument(local);
    if (!validated.success) throw new Error("invalid baseline");
    const { templateResult, fonts } = prepareGraphicScene(validated.data, { assets });
    const scene = {
      ...templateResult.scene,
      elements: templateResult.scene.elements.filter(
        (element) => !element.id.startsWith("campaign-image-treatment"),
      ),
    };
    expect(scene.elements.length).toBe(templateResult.scene.elements.length - 48);
    const untreated = await rasterizeSvg(renderSceneToSvg(scene), fonts.list());
    const a = PNG.sync.read(Buffer.from(rendered.outputs[0]!.bytes));
    const b = PNG.sync.read(Buffer.from(untreated));
    const pixel = (png: PNG, x: number, y: number) =>
      Array.from(
        png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3),
      );
    // Cobalt glaze and shade of the lamp, inside the declared subject region.
    for (const [x, y] of [
      [760, 640],
      [700, 300],
      [560, 420],
    ] as const) {
      expect(pixel(a, x, y)).toEqual(pixel(b, x, y));
    }
    // Wall behind the copy is darker with the local scrim.
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    expect(sum(pixel(a, 60, 560))).toBeLessThan(sum(pixel(b, 60, 560)) * 0.6);
    expect(rendered.qualityIssues).toEqual([]);
    expect(rendered.evidence.crops[0]).toMatchObject({ treatment: "local-dark-scrim" });
  });

  it("warns when no side leaves room and still protects the subject", async () => {
    const document = await baseline("image-led-campaign-local-square");
    (layer(document, "image") as { subjectRegion?: unknown }).subjectRegion = {
      x: 0.05,
      y: 0.05,
      width: 0.9,
      height: 0.9,
    };
    const result = await render(document).catch(async () => ({
      qualityIssues: await blockedIssues(document),
    }));
    expect(result.qualityIssues.map((issue) => issue.code)).toContain(
      "COPY_OVER_SUBJECT",
    );
  });

  it("keeps the global scrims of earlier versions and renders deterministically", async () => {
    const document = await baseline("image-led-campaign-local-landscape");
    (layer(document, "image") as { treatment?: string }).treatment = "dark-scrim";
    const first = svgText(await render(document));
    expect(first).toMatch(
      /<rect id="campaign-image-treatment" x="0" y="0" width="1200" height="627" fill="#000000" opacity="0.56"\/>/,
    );
    expect(svgText(await render(document))).toBe(first);
  });
});
