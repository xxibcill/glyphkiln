import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_FAMILY_REGISTRY,
  STATIC_AD_FORMATS,
  STATIC_AD_TEMPLATE_IDS,
  deriveCampaignSeeds,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  reviewStaticAdPlacement,
  isStaticAdFormat,
} from "../src/index.js";
import { reviewStaticAdPlacement as browserReview } from "../src/browser.js";
import type { RenderEvidence } from "../src/index.js";
const evidence: RenderEvidence = {
  version: "1.1.0",
  safeArea: { x: 0, y: 0, width: 1080, height: 1920 },
  text: [
    {
      layerId: "headline",
      bounds: { x: 100, y: 300, width: 600, height: 100 },
      fontSize: 60,
      lineCount: 1,
      maximumLines: 3,
      overflow: false,
    },
  ],
  crops: [],
  contrast: [],
};
describe("static ad placement reviews", () => {
  it("registers six exact families with reproducible distinct seeds for all 24 combinations", () => {
    const members = CAMPAIGN_FAMILY_REGISTRY["static-ads"].members;
    expect(members.map((member) => member.template.id)).toEqual(STATIC_AD_TEMPLATE_IDS);
    const seeds = members.flatMap((member) =>
      STATIC_AD_FORMATS.map((format) => {
        const input = {
          familyId: "static-ads" as const,
          campaignSeed: "launch",
          directionKey: createCampaignDirectionKey("ads"),
          canvasKey: createCampaignCanvasKey(`${member.template.id}-${format}`),
          template: member.template,
          format,
          compositionVariantId: "static-ad" as const,
        };
        expect(deriveCampaignSeeds(input)).toEqual(deriveCampaignSeeds(input));
        return deriveCampaignSeeds(input).canvasSeed;
      }),
    );
    expect(new Set(seeds).size).toBe(24);
  });
  it("shares review policy with the browser without changing input evidence", () => {
    const original = structuredClone(evidence);
    expect(browserReview("instagram-story", evidence)).toEqual(
      reviewStaticAdPlacement("instagram-story", evidence),
    );
    expect(reviewStaticAdPlacement("instagram-story", evidence).issues).toEqual([]);
    expect(evidence).toEqual(original);
    expect(isStaticAdFormat("tiktok-carousel")).toBe(false);
    for (const format of STATIC_AD_FORMATS) expect(isStaticAdFormat(format)).toBe(true);
  });
  it("reports overlays, small copy, overflow, quality issues and unavailable evidence", () => {
    const bad = structuredClone(evidence);
    bad.text[0] = {
      ...bad.text[0]!,
      bounds: { x: 0, y: 1800, width: 1080, height: 200 },
      fontSize: 20,
      overflow: true,
    };
    const result = reviewStaticAdPlacement("instagram-story", bad, [
      {
        code: "LOW_CONTRAST",
        severity: "warning",
        message: "Low contrast",
        layerId: "headline",
      },
    ]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "SAFE_ZONE",
      "SMALL_TEXT",
      "OVERFLOW",
      "QUALITY",
    ]);
    expect(
      reviewStaticAdPlacement("linkedin-landscape", { ...evidence, text: [] }).issues[0]
        ?.code,
    ).toBe("MISSING_EVIDENCE");
    expect(
      reviewStaticAdPlacement("instagram-square", evidence, [
        { code: "CUSTOM", severity: "warning", message: "Review" },
      ]).issues.at(-1),
    ).toEqual({ code: "QUALITY", message: "Review" });
  });
});
