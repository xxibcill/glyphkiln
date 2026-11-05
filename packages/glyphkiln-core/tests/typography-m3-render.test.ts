import { describe, expect, it } from "vitest";

import {
  GlyphkilnError,
  M3_MANIFEST_VERSION,
  MANIFEST_VERSION,
  RENDERER_VERSION,
  renderGraphic,
  type DesignDocument,
} from "../src/index.js";
import { thaiSegmentationHybridPolicy } from "../src/typography/thai-segmentation-hybrid.js";
import { thaiQuote } from "./visual/m3/documents.js";

const TIMESTAMP = "2026-11-05T00:00:00.000Z";
async function svgManifest(document: DesignDocument) {
  const result = await renderGraphic(document, {
    formats: ["svg"],
    creationTimestamp: TIMESTAMP,
  });
  return { output: result.outputs[0]!, issues: result.qualityIssues };
}

describe("M3 template versions (new versions only)", () => {
  it("records manifest 1.4.0 with the M3 policy and leaves 1.4.0 on manifest 1.3.0", async () => {
    const m1 = await svgManifest(thaiQuote("1.4.0"));
    const m3 = await svgManifest(thaiQuote("1.5.0"));
    expect(m1.output.manifest.manifestVersion).toBe(MANIFEST_VERSION);
    expect("m3" in m1.output.manifest.typographyPolicy).toBe(false);
    expect(m3.output.manifest.manifestVersion).toBe(M3_MANIFEST_VERSION);
    expect(m3.output.manifest.renderer.version).toBe(RENDERER_VERSION);
    const policy = m3.output.manifest.typographyPolicy as unknown as {
      m3: { thaiSegmentation: unknown; tailoring: { version: string } };
    };
    expect(policy.m3.tailoring.version).toBe("1.1.0");
    expect(policy.m3.thaiSegmentation).toEqual(thaiSegmentationHybridPolicy([]));
    expect(Object.keys(m3.output.manifest)).toEqual(Object.keys(m1.output.manifest));
    expect(m3.output.fingerprint).not.toBe(m1.output.fingerprint);
  });

  it("breaks the Thai quote on M3 opportunities only for 1.5.0", async () => {
    const m1 = new TextDecoder().decode(
      (await svgManifest(thaiQuote("1.4.0"))).output.bytes,
    );
    const m3 = new TextDecoder().decode(
      (await svgManifest(thaiQuote("1.5.0"))).output.bytes,
    );
    expect(m3).not.toBe(m1);
  });

  it("hashes the document and brand lexicon into the manifest and fingerprint", async () => {
    const plain = await svgManifest(thaiQuote("1.5.0"));
    const document = thaiQuote("1.5.0", { lexicon: ["เพื่อนไร่เพื่อนสวน"] });
    const withLexicon = await svgManifest(document);
    const policy = withLexicon.output.manifest.typographyPolicy as unknown as {
      m3: { thaiSegmentation: { lexicon: { entries: number; sha256: string } } };
    };
    expect(policy.m3.thaiSegmentation.lexicon).toEqual(
      thaiSegmentationHybridPolicy(["เพื่อนไร่เพื่อนสวน"]).lexicon,
    );
    expect(withLexicon.output.fingerprint).not.toBe(plain.output.fingerprint);
  });

  it("rejects preferBreakAfter on a version without the capability", async () => {
    const quote = (version: "1.4.0" | "1.5.0") => {
      const document = thaiQuote(version);
      return {
        ...document,
        layers: document.layers.map((layer) =>
          layer.id === "quote"
            ? { ...layer, keepTogether: { preferBreakAfter: ["ชอบมาก"] } }
            : layer,
        ),
      } as DesignDocument;
    };
    const error: unknown = await renderGraphic(quote("1.4.0")).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(GlyphkilnError);
    const issues = (error as GlyphkilnError).details?.["issues"] as {
      code: string;
      details?: { feature?: string };
    }[];
    expect(
      issues.some(
        (issue) =>
          issue.code === "TEMPLATE_FEATURE_UNSUPPORTED" &&
          issue.details?.feature === "preferBreakAfter",
      ),
    ).toBe(true);
    await expect(svgManifest(quote("1.5.0"))).resolves.toBeDefined();
  });
});
