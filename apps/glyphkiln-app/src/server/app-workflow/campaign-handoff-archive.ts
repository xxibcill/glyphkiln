import { canonicalJson } from "@glyphkiln/core";

import {
  encodeCampaignHandoff,
  type CampaignHandoffFile,
} from "./campaign-handoff-format.mjs";

export {
  campaignHandoffCanvasPrefix,
  campaignHandoffSequencePrefix,
} from "./campaign-handoff-format.mjs";
export type { CampaignHandoffFile } from "./campaign-handoff-format.mjs";

export const MAXIMUM_CAMPAIGN_HANDOFF_ARCHIVE_BYTES = 64 * 1024 * 1024;

type CampaignHandoffSummary = {
  readonly approvedCanvasCount: number;
  readonly unapprovedCanvasCount: number;
};

export class CampaignHandoffArchiveLimitError extends Error {
  constructor(public readonly maximumBytes: number) {
    super(`The canonical campaign handoff exceeds ${maximumBytes.toString()} bytes.`);
    this.name = "CampaignHandoffArchiveLimitError";
  }
}

export class CampaignHandoffArchive {
  readonly #files: CampaignHandoffFile[] = [];
  readonly #maximumBytes: number;
  #fileArrayBytes = 2;

  constructor(maximumBytes = MAXIMUM_CAMPAIGN_HANDOFF_ARCHIVE_BYTES) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
      throw new RangeError("maximumBytes must be a positive safe integer.");
    }
    this.#maximumBytes = maximumBytes;
  }

  add(...incoming: readonly CampaignHandoffFile[]): void {
    let nextFileArrayBytes = this.#fileArrayBytes;
    let nextFileCount = this.#files.length;
    for (const file of incoming) {
      nextFileArrayBytes +=
        (nextFileCount === 0 ? 0 : 1) +
        new TextEncoder().encode(canonicalJson(file)).byteLength;
      nextFileCount += 1;
      if (nextFileArrayBytes > this.#maximumBytes) {
        throw new CampaignHandoffArchiveLimitError(this.#maximumBytes);
      }
    }
    this.#files.push(...incoming);
    this.#fileArrayBytes = nextFileArrayBytes;
  }

  encode(input: {
    readonly campaign: unknown;
    readonly directionId: string;
    readonly summary: CampaignHandoffSummary;
  }): { readonly files: CampaignHandoffFile[]; readonly bytes: Uint8Array } {
    const { files, bytes } = encodeCampaignHandoff({
      ...input,
      files: this.#files,
    });
    if (bytes.byteLength > this.#maximumBytes) {
      throw new CampaignHandoffArchiveLimitError(this.#maximumBytes);
    }
    return { files, bytes };
  }
}
