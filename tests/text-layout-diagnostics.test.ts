import { describe, expect, it } from "vitest";

import {
  GlyphkilnError,
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  analyzeTextLayoutSupport,
  inspectDesignDocument,
  renderGraphic,
  type DesignLayer,
} from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

const unsupportedText = "\u200F\u05D0\u1820";

describe("text-layout support analyzer", () => {
  it.each([
    ["ASCII", "Deterministic text"],
    ["accented LTR", "Crème brûlée"],
    ["emoji", "Launch 🚀"],
    ["horizontal CJK", "中文"],
    ["Arabic-Indic digits", "١٢٣"],
    ["empty input", ""],
  ])("accepts %s", (_label, text) => {
    expect(analyzeTextLayoutSupport(text)).toEqual({
      version: TEXT_LAYOUT_DIAGNOSTICS_VERSION,
      supported: true,
      diagnostics: [],
    });
  });

  it.each([
    ["BIDI_CONTROL_UNSUPPORTED", "\u200E", "Bidi_Control"],
    ["BIDI_LAYOUT_UNSUPPORTED", "\u05D0", "Bidi_Class=R"],
    ["BIDI_LAYOUT_UNSUPPORTED", "\u0627", "Bidi_Class=AL"],
    ["VERTICAL_LAYOUT_UNSUPPORTED", "\u1820", "Script=Mongolian"],
    ["VERTICAL_LAYOUT_UNSUPPORTED", "\uA840", "Script=Phags_Pa"],
    ["VERTICAL_LAYOUT_UNSUPPORTED", "\uFE10", "Decomposition_Type=Vertical"],
  ] as const)("classifies %s with exact evidence", (code, text, property) => {
    const analysis = analyzeTextLayoutSupport(text);
    expect(analysis.supported).toBe(false);
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        code,
        totalMatches: 1,
        matches: [{ codePoint: text.codePointAt(0), scalarIndex: 0, property }],
        truncated: false,
      }),
    ]);
  });

  it("orders diagnostic codes, keeps source order, and prioritizes controls", () => {
    const analysis = analyzeTextLayoutSupport("\u05D1\u200F\u05D0\u1820");
    expect(analysis.diagnostics.map(({ code }) => code)).toEqual([
      "BIDI_CONTROL_UNSUPPORTED",
      "BIDI_LAYOUT_UNSUPPORTED",
      "VERTICAL_LAYOUT_UNSUPPORTED",
    ]);
    expect(analysis.diagnostics[0]?.matches).toEqual([
      {
        codePoint: 0x200f,
        scalarIndex: 1,
        property: "Bidi_Control",
      },
    ]);
    expect(
      analysis.diagnostics[1]?.matches.map(({ scalarIndex }) => scalarIndex),
    ).toEqual([0, 2]);
  });

  it("counts Unicode scalars after astral characters", () => {
    const analysis = analyzeTextLayoutSupport("🚀\u05D0");
    expect(analysis.diagnostics[0]?.matches[0]?.scalarIndex).toBe(1);
  });

  it("accepts lone surrogates and advances their scalar positions once", () => {
    const analysis = analyzeTextLayoutSupport("\uD800\u05D0\uDC00");
    expect(analysis.diagnostics[0]?.matches[0]?.scalarIndex).toBe(1);
    expect(analysis.diagnostics[0]?.totalMatches).toBe(1);
  });

  it("caps retained evidence without losing the total count", () => {
    const analysis = analyzeTextLayoutSupport("\u05D0".repeat(20));
    expect(analysis.diagnostics[0]).toMatchObject({
      totalMatches: 20,
      truncated: true,
    });
    expect(analysis.diagnostics[0]?.matches).toHaveLength(16);
  });

  it("rejects non-string runtime input with a stable error", () => {
    expect(() => analyzeTextLayoutSupport(42 as never)).toThrow(
      expect.objectContaining({
        name: "GlyphkilnError",
        code: "INVALID_TEXT_INPUT",
      }),
    );
  });

  it("never places raw user text in diagnostic messages", () => {
    const marker = "PRIVATE_MARKER";
    const analysis = analyzeTextLayoutSupport(`${marker}\u200F`);
    expect(JSON.stringify(analysis.diagnostics)).not.toContain(marker);
    expect(analysis.diagnostics[0]?.message).not.toContain("\u200F");
  });
});

describe("design text-layout inspection", () => {
  it("collects every rendered semantic field with document-rooted paths", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers = textBearingLayers("\u05D0");
    const inspection = inspectDesignDocument(document);

    expect(inspection.textLayout.renderable).toBe(false);
    expect(inspection.textLayout.totalDiagnostics).toBe(12);
    expect(
      inspection.textLayout.diagnostics.map(
        ({ fieldPath, layerType, visible, blocksRender }) => ({
          fieldPath,
          layerType,
          visible,
          blocksRender,
        }),
      ),
    ).toEqual([
      field("/layers/0/text", "headline", true),
      field("/layers/1/text", "subtitle", false),
      field("/layers/2/text", "eyebrow", false),
      field("/layers/3/text", "cta", false),
      field("/layers/4/text", "footer", false),
      field("/layers/5/text", "attribution", false),
      field("/layers/6/text", "badge", false),
      field("/layers/7/value", "statistic", false),
      field("/layers/7/label", "statistic", false),
      field("/layers/7/trend", "statistic", false),
      field("/layers/8/values/0/label", "chart", false),
      field("/layers/8/values/1/label", "chart", false),
    ]);
  });

  it("does not inspect asset alt text", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers = [
      {
        id: "image",
        type: "image",
        assetId: "missing",
        alt: "\u05D0",
        fit: "cover",
        visible: false,
      },
    ];
    expect(inspectDesignDocument(document).textLayout).toMatchObject({
      renderable: true,
      totalDiagnostics: 0,
      diagnostics: [],
    });
  });

  it("caps retained document diagnostics while preserving totals", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers = Array.from({ length: 50 }, (_, index) => ({
      id: `stat-${index}`,
      type: "statistic" as const,
      value: unsupportedText,
      label: unsupportedText,
      trend: unsupportedText,
      visible: false,
    }));
    const textLayout = inspectDesignDocument(document).textLayout;
    expect(textLayout).toMatchObject({
      renderable: true,
      totalDiagnostics: 450,
      truncated: true,
    });
    expect(textLayout.diagnostics).toHaveLength(128);
  });
});

describe("text-layout render quality", () => {
  it("blocks unsupported visible text before font resolution", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    const headline = document.layers.find((layer) => layer.type === "headline");
    if (headline?.type !== "headline") throw new Error("Missing headline.");
    headline.text = "\u05D0";
    headline.fontFamily = "Unavailable";
    document.fonts.push({
      family: "Unavailable",
      weight: 800,
      style: "normal",
    });

    try {
      await renderGraphic(document);
      expect.fail("Expected text layout to block rendering.");
    } catch (error) {
      expect(error).toBeInstanceOf(GlyphkilnError);
      expect(error).toMatchObject({ code: "QUALITY_VALIDATION_FAILED" });
      const issues =
        error instanceof GlyphkilnError ? error.details?.["issues"] : undefined;
      expect(Array.isArray(issues)).toBe(true);
      if (!Array.isArray(issues)) return;
      const issue = (issues as unknown[]).find(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          (value as Record<string, unknown>)["code"] === "BIDI_LAYOUT_UNSUPPORTED",
      );
      expect(issue).toBeDefined();
      if (typeof issue !== "object" || issue === null) return;
      const record = issue as Record<string, unknown>;
      expect(record["layerId"]).toBe("headline");
      expect(record["severity"]).toBe("error");
      const details = record["details"];
      expect(
        typeof details === "object" &&
          details !== null &&
          (details as Record<string, unknown>)["fieldPath"],
      ).toBe("/layers/3/text");
    }
  });

  it("does not block unsupported text in hidden layers", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers.push({
      id: "hidden-footer",
      type: "footer",
      text: "\u05D0",
      visible: false,
    });
    await expect(renderGraphic(document)).resolves.toBeDefined();
  });

  it("reports when visible render diagnostics exceed the retained-record cap", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers = Array.from({ length: 50 }, (_, index) => ({
      id: `stat-${index}`,
      type: "statistic" as const,
      value: unsupportedText,
      label: unsupportedText,
      trend: unsupportedText,
      visible: true,
    }));

    try {
      await renderGraphic(document);
      expect.fail("Expected text layout to block rendering.");
    } catch (error) {
      expect(error).toBeInstanceOf(GlyphkilnError);
      if (!(error instanceof GlyphkilnError)) return;
      expect(error.code).toBe("QUALITY_VALIDATION_FAILED");
      expect(error.details?.["textLayout"]).toEqual({
        totalDiagnostics: 450,
        retainedDiagnostics: 128,
        truncated: true,
      });
      expect(error.message).toContain(
        "322 additional text-layout diagnostics were omitted",
      );

      const issues = error.details?.["issues"];
      expect(Array.isArray(issues)).toBe(true);
      if (!Array.isArray(issues)) return;
      const textLayoutIssues = issues.filter(
        (issue) =>
          typeof issue === "object" &&
          issue !== null &&
          typeof (issue as Record<string, unknown>)["code"] === "string" &&
          ((issue as Record<string, string>)["code"] ?? "").endsWith("_UNSUPPORTED"),
      );
      expect(textLayoutIssues).toHaveLength(128);
    }
  });
});

function field(fieldPath: string, layerType: DesignLayer["type"], visible: boolean) {
  return {
    fieldPath,
    layerType,
    visible,
    blocksRender: visible,
  };
}

function textBearingLayers(text: string): DesignLayer[] {
  return [
    textLayer("headline", "headline", text, true),
    textLayer("subtitle", "subtitle", text),
    textLayer("eyebrow", "eyebrow", text),
    textLayer("cta", "cta", text),
    textLayer("footer", "footer", text),
    textLayer("attribution", "attribution", text),
    { id: "badge", type: "badge", text, visible: false },
    {
      id: "statistic",
      type: "statistic",
      value: text,
      label: text,
      trend: text,
      visible: false,
    },
    {
      id: "chart",
      type: "chart",
      chart: "bar",
      values: [
        { label: text, value: 1 },
        { label: text, value: 2 },
      ],
      visible: false,
    },
  ];
}

function textLayer(
  id: string,
  type: "headline" | "subtitle" | "eyebrow" | "cta" | "footer" | "attribution",
  text: string,
  visible = false,
): DesignLayer {
  return { id, type, text, visible };
}
