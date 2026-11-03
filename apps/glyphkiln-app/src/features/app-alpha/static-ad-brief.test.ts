import { describe, expect, it } from "vitest";
import { STATIC_AD_FORMATS, STATIC_AD_TEMPLATE_IDS } from "@glyphkiln/core/browser";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { createInitialPreviewForm } from "@/features/project-preview/document-builder";
import {
  buildStaticAdCampaignDrafts,
  staticAdBriefFromForm,
  type StaticAdBrief,
} from "./static-ad-brief";
import { campaignCompositionVariant } from "./campaign-studio-model";
import { zipCampaignHandoff } from "./static-ad-zip";
const catalog = createPreviewCatalog();
const state = createInitialPreviewForm(catalog);
const brief: StaticAdBrief = {
  headline: "A calmer workflow",
  eyebrow: "Product",
  subtitle: "Repeatable exports",
  cta: "Explore",
  offer: "20% off",
  terms: "Selected plans",
  source: "Customer survey",
  deadline: "Until 30 September",
  benefits: "Less rework\nClear review",
  quote: "This helps our team.",
  customer: "Verified customer",
  leftLabel: "Manual",
  rightLabel: "Product",
  comparisonLabel: "Inputs",
  leftValue: "Recreated",
  rightValue: "Saved",
  problem: "Rework",
  solution: "Reuse inputs",
};
describe("shared static ad brief", () => {
  it("builds all 24 variants without fabricating claims or carrying unused assets", () => {
    const selected = {
      ...state,
      resources: {
        ...state.resources,
        assetIds: ["product", "logo", "portrait", "unused"],
        imageAssetId: "product",
        imageAlt: "Product",
        logoAssetId: "logo",
        logoAlt: "Brand",
        portraitAssetId: "portrait",
        portraitAlt: "Customer",
      },
    };
    const drafts = buildStaticAdCampaignDrafts(
      brief,
      STATIC_AD_TEMPLATE_IDS,
      STATIC_AD_FORMATS,
      selected,
      catalog,
    );
    expect(drafts).toHaveLength(24);
    for (const template of STATIC_AD_TEMPLATE_IDS)
      expect(campaignCompositionVariant(template)).toBe("static-ad");
    expect(
      drafts.find((draft) => draft.templateId === "testimonial-evidence")?.layers,
    ).toContainEqual(expect.objectContaining({ type: "headline", text: brief.quote }));
    expect(
      drafts.find((draft) => draft.templateId === "comparison")?.resources?.assetIds,
    ).toEqual(["logo"]);
    expect(drafts.every((draft) => !draft.resources?.assetIds.includes("unused"))).toBe(
      true,
    );
    const noOffer = buildStaticAdCampaignDrafts(
      { ...brief, offer: "", deadline: "" },
      ["product-announcement"],
      ["instagram-square"],
      state,
      catalog,
    );
    expect(noOffer[0]?.layers.some((layer) => layer.type === "badge")).toBe(false);
  });
  it("requires evidence and family-specific copy before submitting", () => {
    for (const [family, key] of [
      ["testimonial-evidence", "quote"],
      ["testimonial-evidence", "source"],
      ["comparison", "leftValue"],
      ["problem-solution", "solution"],
      ["offer-urgency", "terms"],
      ["benefit-proof", "benefits"],
    ] as const) {
      expect(() =>
        buildStaticAdCampaignDrafts(
          { ...brief, [key]: "" },
          [family],
          ["instagram-square"],
          state,
          catalog,
        ),
      ).toThrow();
    }
    expect(() =>
      buildStaticAdCampaignDrafts(
        { ...brief, benefits: "a\nb\nc\nd" },
        ["benefit-proof"],
        ["instagram-square"],
        state,
        catalog,
      ),
    ).toThrow();
    expect(() =>
      buildStaticAdCampaignDrafts(brief, [], ["instagram-square"], state, catalog),
    ).toThrow();
    const form = new FormData();
    form.set("headline", "  Good input  ");
    expect(staticAdBriefFromForm(form)).toMatchObject({
      headline: "Good input",
      quote: "",
    });
  });
});
describe("approved ad ZIP", () => {
  const archive = (path: string, approvalStatus = "approved") =>
    new TextEncoder().encode(
      JSON.stringify({ files: [{ path, approvalStatus, base64: btoa("123456789") }] }),
    );
  it("preserves stored bytes, standard CRC32, names and deterministic archive offsets", () => {
    const input = archive("campaign/001-square.png");
    const zip = zipCampaignHandoff(input);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLength))).toBe(
      "campaign/001-square.png",
    );
    expect(new TextDecoder().decode(zip.slice(30 + nameLength, 39 + nameLength))).toBe(
      "123456789",
    );
    const directoryOffset = view.getUint32(zip.length - 6, true);
    expect(view.getUint32(directoryOffset, true)).toBe(0x02014b50);
    expect(zipCampaignHandoff(input)).toEqual(zip);
  });
  it("refuses unapproved files and unsafe paths", () => {
    expect(() => zipCampaignHandoff(archive("ad.png", "unapproved"))).toThrow(
      "approved",
    );
    for (const path of ["../ad.png", "/ad.png", "a//b.png", "a\\b.png"])
      expect(() => zipCampaignHandoff(archive(path))).toThrow("path");
  });
});
