import { Buffer } from "node:buffer";
import { TextEncoder } from "node:util";

import { canonicalJson, sha256 } from "@glyphkiln/core";

export const CAMPAIGN_HANDOFF_FORMAT_VERSION = "1.0.0";

export function campaignHandoffCanvasPrefix(input) {
  return [
    input.campaignPrefix,
    `direction-${input.directionKey}`,
    `${input.canvasOrdinal.toString().padStart(3, "0")}-${input.canvasKey}`,
  ].join("/");
}

export function createCampaignHandoffCanvasFiles(input) {
  const files = [
    campaignHandoffJsonFile(
      `${input.canvasPrefix}.design.json`,
      input.document,
      input.approvalStatus,
    ),
    campaignHandoffJsonFile(
      `${input.canvasPrefix}.resources.json`,
      input.resources,
      input.approvalStatus,
    ),
    campaignHandoffJsonFile(
      `${input.canvasPrefix}.approval.json`,
      input.approval,
      input.approvalStatus,
    ),
  ];
  if (input.delivery !== undefined) {
    files.push(
      campaignHandoffJsonFile(
        `${input.canvasPrefix}.delivery.json`,
        input.delivery,
        input.approvalStatus,
      ),
    );
  }
  for (const output of input.outputs) {
    files.push(
      campaignHandoffBinaryFile(
        `${input.canvasPrefix}.${output.format}`,
        output.mimeType,
        output.bytes,
        input.approvalStatus,
      ),
      campaignHandoffJsonFile(
        `${input.canvasPrefix}.${output.format}.manifest.json`,
        output.manifest,
        input.approvalStatus,
      ),
    );
  }
  return files;
}

export function campaignHandoffJsonFile(path, value, approvalStatus) {
  return campaignHandoffBinaryFile(
    path,
    "application/json",
    new TextEncoder().encode(`${canonicalJson(value)}\n`),
    approvalStatus,
  );
}

export function campaignHandoffBinaryFile(path, mediaType, bytes, approvalStatus) {
  return {
    path,
    mediaType,
    byteSize: bytes.byteLength,
    sha256: sha256(bytes),
    base64: Buffer.from(bytes).toString("base64"),
    approvalStatus,
  };
}

export function encodeCampaignHandoff(input) {
  const files = [...input.files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const bytes = new TextEncoder().encode(
    `${canonicalJson({
      version: CAMPAIGN_HANDOFF_FORMAT_VERSION,
      campaign: input.campaign,
      directionId: input.directionId,
      files,
      summary: input.summary,
    })}\n`,
  );
  return { files, bytes };
}
