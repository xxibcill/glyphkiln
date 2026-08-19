import type { CarouselSequenceKey } from "@glyphkiln/core";

export const CAMPAIGN_HANDOFF_FORMAT_VERSION: "1.0.0";

export type CampaignHandoffFile = {
  path: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  base64: string;
  approvalStatus: "approved" | "unapproved";
};

export type CampaignHandoffOutput = {
  format: string;
  mimeType: string;
  bytes: Uint8Array;
  manifest: unknown;
};

export function campaignHandoffCanvasPrefix(input: {
  campaignPrefix: string;
  directionKey: string;
  canvasOrdinal: number;
  canvasKey: string;
}): string;

export function campaignHandoffSequencePrefix(input: {
  campaignPrefix: string;
  directionKey: string;
  sequenceKey: CarouselSequenceKey;
}): string;

export function createCampaignHandoffCanvasFiles(input: {
  canvasPrefix: string;
  document: unknown;
  resources: unknown;
  approval: unknown;
  delivery?: unknown;
  outputs: readonly CampaignHandoffOutput[];
  approvalStatus: CampaignHandoffFile["approvalStatus"];
}): CampaignHandoffFile[];

export function campaignHandoffJsonFile(
  path: string,
  value: unknown,
  approvalStatus: CampaignHandoffFile["approvalStatus"],
): CampaignHandoffFile;

export function campaignHandoffBinaryFile(
  path: string,
  mediaType: string,
  bytes: Uint8Array,
  approvalStatus: CampaignHandoffFile["approvalStatus"],
): CampaignHandoffFile;

export function encodeCampaignHandoff(input: {
  campaign: unknown;
  directionId: string;
  files: readonly CampaignHandoffFile[];
  summary: {
    approvedCanvasCount: number;
    unapprovedCanvasCount: number;
  };
}): { files: CampaignHandoffFile[]; bytes: Uint8Array };
