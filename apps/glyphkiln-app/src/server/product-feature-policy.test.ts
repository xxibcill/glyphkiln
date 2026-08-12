import { describe, expect, it } from "vitest";

import { readProductFeaturePolicy } from "./product-feature-policy";

describe("product feature policy", () => {
  it("keeps campaign persistence disabled by default", () => {
    expect(readProductFeaturePolicy(environment())).toEqual({
      campaignWorkflow: false,
    });
    expect(
      readProductFeaturePolicy(
        environment({ GLYPHKILN_CAMPAIGN_WORKFLOW: "disabled" }),
      ),
    ).toEqual({ campaignWorkflow: false });
  });

  it("requires the exact campaign qualification value", () => {
    expect(
      readProductFeaturePolicy(
        environment({
          GLYPHKILN_CAMPAIGN_WORKFLOW: "product-qualified",
        }),
      ),
    ).toEqual({ campaignWorkflow: true });
    expect(() =>
      readProductFeaturePolicy(environment({ GLYPHKILN_CAMPAIGN_WORKFLOW: "enabled" })),
    ).toThrow("GLYPHKILN_CAMPAIGN_WORKFLOW");
  });

  it("does not permit AI proposals while the campaign workflow is gated", () => {
    expect(() =>
      readProductFeaturePolicy(
        environment({ GLYPHKILN_AI_PROPOSALS: "production-approved" }),
      ),
    ).toThrow(
      "GLYPHKILN_AI_PROPOSALS requires GLYPHKILN_CAMPAIGN_WORKFLOW=product-qualified",
    );
  });
});

function environment(
  values: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}
