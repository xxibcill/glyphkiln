const AI_PROPOSAL_APPROVAL = "production-approved";

export type CampaignWorkflowQualificationStatus = "pending" | "pass";

export const CAMPAIGN_WORKFLOW_QUALIFICATION: Readonly<{
  assertion: string;
  record: string;
  status: CampaignWorkflowQualificationStatus;
}> = Object.freeze({
  assertion: "product-qualified",
  record: "docs/qualification/campaign-workflow-2026-08-13.md",
  status: "pass",
});

export type ProductFeaturePolicy = {
  campaignWorkflow: boolean;
};

export function readProductFeaturePolicy(
  environment: NodeJS.ProcessEnv,
): ProductFeaturePolicy {
  const configuredCampaignWorkflow = environment.GLYPHKILN_CAMPAIGN_WORKFLOW?.trim();
  const campaignWorkflow =
    configuredCampaignWorkflow === CAMPAIGN_WORKFLOW_QUALIFICATION.assertion;
  if (
    configuredCampaignWorkflow !== undefined &&
    configuredCampaignWorkflow !== "" &&
    configuredCampaignWorkflow !== "disabled" &&
    !campaignWorkflow
  ) {
    throw new Error(
      `GLYPHKILN_CAMPAIGN_WORKFLOW must be disabled or ${CAMPAIGN_WORKFLOW_QUALIFICATION.assertion}.`,
    );
  }
  if (campaignWorkflow && CAMPAIGN_WORKFLOW_QUALIFICATION.status !== "pass") {
    throw new Error(
      `GLYPHKILN_CAMPAIGN_WORKFLOW=${CAMPAIGN_WORKFLOW_QUALIFICATION.assertion} cannot enable the campaign workflow while the checked-in qualification record is ${CAMPAIGN_WORKFLOW_QUALIFICATION.status.toUpperCase()}.`,
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
