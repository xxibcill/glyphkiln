import { hashCanonical } from "../cache/canonical.js";
import { GlyphkilnError } from "../domain/types.js";
import type { FormatId } from "../formats/index.js";
import type { TemplateId } from "../schema/index.js";

import {
  CAMPAIGN_FAMILY_REGISTRY,
  type CampaignCompositionVariantId,
  type CampaignFamilyId,
  type CampaignFamilyMember,
} from "./metadata.js";

export const CAMPAIGN_SEED_DERIVATION_VERSION = "sha256/canonical-scope-v1" as const;

export type CampaignSeedDerivationInput = {
  readonly campaignSeed: string;
  readonly familyId: CampaignFamilyId;
  readonly directionKey: string;
  readonly canvasKey: string;
  readonly template: {
    readonly id: TemplateId;
    readonly version: CampaignFamilyMember["template"]["version"];
  };
  readonly format: FormatId;
  readonly compositionVariantId: CampaignCompositionVariantId;
};

export type DerivedCampaignSeeds = {
  readonly version: typeof CAMPAIGN_SEED_DERIVATION_VERSION;
  readonly directionSeed: string;
  readonly canvasSeed: string;
};

type SeedScopeProblem = {
  readonly path: string;
  readonly code: string;
  readonly message: string;
};

const MAXIMUM_CAMPAIGN_SEED_LENGTH = 256;
const MAXIMUM_SCOPE_KEY_LENGTH = 128;
const SCOPE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const SEED_SCOPE_KEYS = new Set([
  "campaignSeed",
  "familyId",
  "directionKey",
  "canvasKey",
  "template",
  "format",
  "compositionVariantId",
]);
const TEMPLATE_KEYS = new Set(["id", "version"]);

export function deriveCampaignSeeds(
  input: CampaignSeedDerivationInput,
): DerivedCampaignSeeds {
  const problems = validateCampaignSeedScope(input);
  if (problems.length > 0) {
    throw new GlyphkilnError(
      "Campaign seed scope is invalid.",
      "INVALID_CAMPAIGN_SEED_SCOPE",
      { problems },
    );
  }

  const directionSeed = hashCanonical({
    version: CAMPAIGN_SEED_DERIVATION_VERSION,
    scope: "direction",
    campaignSeed: input.campaignSeed,
    familyId: input.familyId,
    directionKey: input.directionKey,
  });
  const canvasSeed = hashCanonical({
    version: CAMPAIGN_SEED_DERIVATION_VERSION,
    scope: "canvas",
    directionSeed,
    canvasKey: input.canvasKey,
    template: input.template,
    format: input.format,
    compositionVariantId: input.compositionVariantId,
  });

  return {
    version: CAMPAIGN_SEED_DERIVATION_VERSION,
    directionSeed,
    canvasSeed,
  };
}

function validateCampaignSeedScope(input: unknown): SeedScopeProblem[] {
  const problems: SeedScopeProblem[] = [];
  if (!isPlainRecord(input)) {
    return [problem("$", "invalid_type", "Campaign seed scope must be an object.")];
  }
  validateExactKeys(input, SEED_SCOPE_KEYS, "$", problems);
  const template = input["template"];
  if (isPlainRecord(template)) {
    validateExactKeys(template, TEMPLATE_KEYS, "template", problems);
  }
  validateCampaignSeed(input["campaignSeed"], problems);
  validateScopeKey("directionKey", input["directionKey"], problems);
  validateScopeKey("canvasKey", input["canvasKey"], problems);

  const familyId = input["familyId"];
  const family =
    typeof familyId === "string" && Object.hasOwn(CAMPAIGN_FAMILY_REGISTRY, familyId)
      ? CAMPAIGN_FAMILY_REGISTRY[familyId as CampaignFamilyId]
      : undefined;
  if (family === undefined) {
    problems.push(
      problem("familyId", "unsupported", "Campaign family is unsupported."),
    );
    return problems;
  }
  const member = family.members.find(
    (candidate) =>
      isPlainRecord(template) &&
      candidate.template.id === template["id"] &&
      candidate.template.version === template["version"],
  );
  if (member === undefined) {
    problems.push(
      problem(
        "template",
        "unsupported",
        "Template identity is not a member of the campaign family.",
      ),
    );
    return problems;
  }
  if (!member.formats.some((format) => format === input["format"])) {
    problems.push(
      problem("format", "unsupported", "Format is unsupported by the family member."),
    );
  }
  if (
    !member.compositionVariants.some(
      (variant) => variant.id === input["compositionVariantId"],
    )
  ) {
    problems.push(
      problem(
        "compositionVariantId",
        "unsupported",
        "Composition variant is unsupported by the family member.",
      ),
    );
  }
  return problems;
}

function validateCampaignSeed(seed: unknown, problems: SeedScopeProblem[]): void {
  if (
    typeof seed !== "string" ||
    seed.length === 0 ||
    seed.length > MAXIMUM_CAMPAIGN_SEED_LENGTH
  ) {
    problems.push(
      problem(
        "campaignSeed",
        "invalid_length",
        "Campaign seed must contain between 1 and 256 characters.",
      ),
    );
  }
}

function validateScopeKey(
  path: "directionKey" | "canvasKey",
  value: unknown,
  problems: SeedScopeProblem[],
): void {
  if (
    typeof value !== "string" ||
    value.length > MAXIMUM_SCOPE_KEY_LENGTH ||
    !SCOPE_KEY_PATTERN.test(value)
  ) {
    problems.push(
      problem(
        path,
        "invalid_identifier",
        "Campaign scope key must be a bounded identifier.",
      ),
    );
  }
}

function validateExactKeys(
  input: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  path: string,
  problems: SeedScopeProblem[],
): void {
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    problems.push(
      problem(path, "unrecognized_key", "Campaign seed scope has an unknown field."),
    );
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function problem(path: string, code: string, message: string): SeedScopeProblem {
  return { path, code, message };
}
