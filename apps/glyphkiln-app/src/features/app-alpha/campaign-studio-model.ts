import { canonicalJson } from "@glyphkiln/core/browser";

import type {
  CampaignCanvas,
  CampaignCanvasSeed,
  CampaignCanvasSeedInput,
  CampaignProposalRun,
  DesignRevision,
} from "./api-client";

export const CAMPAIGN_LOCKS = [
  "copy",
  "image",
  "crop",
  "typography",
  "palette",
  "composition",
] as const;

export const CAMPAIGN_CANVAS_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

export type CampaignDraftCanvas = {
  templateId: CampaignCanvasSeedInput["templateId"];
  format: CampaignCanvasSeedInput["format"];
  seed: string;
};

export type CampaignCanvasSeedPlan = {
  scope: CampaignCanvasSeedInput;
  result: CampaignCanvasSeed;
};

export function campaignCompositionVariant(
  templateId: CampaignCanvasSeedInput["templateId"],
): CampaignCanvasSeedInput["compositionVariantId"] {
  return templateId === "tiktok-carousel-slide"
    ? "organic-photo-editorial"
    : "focal-editorial";
}

export function findCampaignCanvas(
  canvases: readonly { canvas: CampaignCanvas }[],
  canvasId: string,
): CampaignCanvas | undefined {
  return canvases.find((entry) => entry.canvas.id === canvasId)?.canvas;
}

export function sameCanvasSeedScope(
  left: CampaignCanvasSeedInput,
  right: CampaignCanvasSeedInput,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function draftMatchesSeedPlan(
  draft: CampaignDraftCanvas,
  plan: CampaignCanvasSeedPlan | undefined,
): boolean {
  return draft.seed === plan?.result.canvasSeed;
}

export function revisionMatchesSeedPlan(
  revision: DesignRevision | undefined,
  plan: CampaignCanvasSeedPlan | undefined,
): boolean {
  const document = revision?.document;
  const result = plan?.result;
  return (
    result !== undefined &&
    document?.seed === result.canvasSeed &&
    document.template.id === result.template.id &&
    document.template.version === result.template.version &&
    document.format === result.format
  );
}

export function requiredFormText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function downloadBytes(
  bytes: Uint8Array,
  mediaType: string,
  filename: string,
): void {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes).buffer], { type: mediaType }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function mergeProposalProofBytes(
  current: CampaignProposalRun,
  refreshed: CampaignProposalRun,
): CampaignProposalRun {
  if (current.id !== refreshed.id) return refreshed;
  return {
    ...refreshed,
    candidates: refreshed.candidates.map((candidate) => {
      const previous = current.candidates.find((entry) => entry.id === candidate.id);
      if (
        previous?.canonicalHash === undefined ||
        previous.canonicalHash !== candidate.canonicalHash ||
        previous.proof === undefined ||
        candidate.proof === undefined ||
        canonicalJson(proofMetadata(previous.proof)) !==
          canonicalJson(proofMetadata(candidate.proof))
      ) {
        return candidate;
      }
      return {
        ...candidate,
        proof: {
          ...candidate.proof,
          outputs: candidate.proof.outputs.map((output) => {
            const priorOutput = previous.proof?.outputs.find(
              (entry) => entry.format === output.format,
            );
            return priorOutput?.base64 === undefined
              ? output
              : { ...output, base64: priorOutput.base64 };
          }),
        },
      };
    }),
  };
}

function proofMetadata(
  proof: NonNullable<CampaignProposalRun["candidates"][number]["proof"]>,
) {
  return {
    qualityIssues: proof.qualityIssues,
    evidence: proof.evidence,
    outputs: proof.outputs.map((output) => {
      const metadata = { ...output };
      delete metadata.base64;
      return metadata;
    }),
  };
}
