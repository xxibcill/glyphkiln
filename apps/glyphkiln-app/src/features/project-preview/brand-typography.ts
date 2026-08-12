import type { BrandSnapshot, BrandTypographyRole } from "@glyphkiln/core";

import type { BrandTypographyFormState } from "./types";

const DEFAULT_TYPOGRAPHY = Object.freeze({
  headlineFamily: "Inter",
  bodyFamily: "Inter",
  monospaceFamily: "Inter",
  rolesEnabled: false,
  display: Object.freeze({ weight: 800, lineHeight: 0.94, tracking: -0.02 }),
  body: Object.freeze({ weight: 400, lineHeight: 1.35, tracking: 0 }),
  label: Object.freeze({ weight: 700, lineHeight: 1.1, tracking: 0.05 }),
} as const satisfies BrandTypographyFormState);

export function createInitialBrandTypography(): BrandTypographyFormState {
  return {
    headlineFamily: DEFAULT_TYPOGRAPHY.headlineFamily,
    bodyFamily: DEFAULT_TYPOGRAPHY.bodyFamily,
    monospaceFamily: DEFAULT_TYPOGRAPHY.monospaceFamily,
    rolesEnabled: false,
    display: { ...DEFAULT_TYPOGRAPHY.display },
    body: { ...DEFAULT_TYPOGRAPHY.body },
    label: { ...DEFAULT_TYPOGRAPHY.label },
  };
}

export function buildBrandTypography(
  input: BrandTypographyFormState,
): BrandSnapshot["typography"] {
  return {
    headlineFamily: input.headlineFamily.trim(),
    bodyFamily: input.bodyFamily.trim(),
    monospaceFamily: input.monospaceFamily.trim(),
    ...(input.rolesEnabled
      ? {
          roles: {
            display: {
              family: input.headlineFamily.trim(),
              ...input.display,
            },
            body: { family: input.bodyFamily.trim(), ...input.body },
            label: { family: input.bodyFamily.trim(), ...input.label },
          },
        }
      : {}),
  };
}

export function brandTypographyFromSnapshot(
  input: BrandSnapshot["typography"],
): BrandTypographyFormState {
  const fallback = createInitialBrandTypography();
  const roles = "roles" in input ? input.roles : undefined;
  return {
    headlineFamily: input.headlineFamily,
    bodyFamily: input.bodyFamily,
    monospaceFamily: input.monospaceFamily ?? input.bodyFamily,
    rolesEnabled: roles !== undefined,
    display: roleValues(roles?.display, fallback.display),
    body: roleValues(roles?.body, fallback.body),
    label: roleValues(roles?.label, fallback.label),
  };
}

function roleValues(
  input: BrandTypographyRole | undefined,
  fallback: BrandTypographyFormState["display"],
): BrandTypographyFormState["display"] {
  if (input === undefined) return { ...fallback };
  return {
    weight: input.weight,
    lineHeight: input.lineHeight,
    tracking: input.tracking,
  };
}
