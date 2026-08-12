const CAMPAIGN_WORKFLOW_QUALIFICATION = "product-qualified";
const AI_PROPOSAL_APPROVAL = "production-approved";

export type ProductFeaturePolicy = {
  campaignWorkflow: boolean;
};

export function readProductFeaturePolicy(
  environment: NodeJS.ProcessEnv,
): ProductFeaturePolicy {
  const configuredCampaignWorkflow = environment.GLYPHKILN_CAMPAIGN_WORKFLOW?.trim();
  const campaignWorkflow =
    configuredCampaignWorkflow === CAMPAIGN_WORKFLOW_QUALIFICATION;
  if (
    configuredCampaignWorkflow !== undefined &&
    configuredCampaignWorkflow !== "" &&
    configuredCampaignWorkflow !== "disabled" &&
    !campaignWorkflow
  ) {
    throw new Error(
      `GLYPHKILN_CAMPAIGN_WORKFLOW must be disabled or ${CAMPAIGN_WORKFLOW_QUALIFICATION}.`,
    );
  }
  if (
    environment.GLYPHKILN_AI_PROPOSALS?.trim() === AI_PROPOSAL_APPROVAL &&
    !campaignWorkflow
  ) {
    throw new Error(
      "GLYPHKILN_AI_PROPOSALS requires GLYPHKILN_CAMPAIGN_WORKFLOW=product-qualified.",
    );
  }
  return { campaignWorkflow };
}
