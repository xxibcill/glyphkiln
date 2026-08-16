import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_WORKFLOW_QUALIFICATION,
  readProductFeaturePolicy,
} from "./product-feature-policy";

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

  it("rejects the enabling assertion while qualification remains pending", () => {
    expect(CAMPAIGN_WORKFLOW_QUALIFICATION).toEqual({
      assertion: "product-qualified",
      record: "docs/qualification/campaign-workflow-2026-08-13.md",
      status: "pending",
    });
    expect(() =>
      readProductFeaturePolicy(
        environment({
          GLYPHKILN_CAMPAIGN_WORKFLOW: "product-qualified",
        }),
      ),
    ).toThrow("checked-in qualification record is PENDING");
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
