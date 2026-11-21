import { LOCAL_IMAGE_TREATMENT_POLICY_VERSION } from "../assets/image-policy.js";
import {
  ACCENT_COVERAGE_POLICY_VERSION,
  COLOR_ROLE_POLICY_VERSION,
} from "../templates/accent-budget.js";
import { OPENTYPE_FEATURE_POLICY_VERSION } from "../typography/opentype.js";
import { RICH_TEXT_POLICY_VERSION } from "../typography/rich-text.js";
import { SIZE_SETTING_POLICY_VERSION } from "../typography/size-setting.js";

const B2_POLICIES = Object.freeze({
  emphasis: RICH_TEXT_POLICY_VERSION,
  openType: OPENTYPE_FEATURE_POLICY_VERSION,
  sizeSetting: SIZE_SETTING_POLICY_VERSION,
  colorRoles: COLOR_ROLE_POLICY_VERSION,
  accentCoverage: ACCENT_COVERAGE_POLICY_VERSION,
});

/**
 * Policy versions an exact template version pins beyond the shared renderer
 * configuration. They are fingerprint inputs for that template only, so
 * changing one changes those fingerprints while every other template's
 * fingerprint stays byte-identical. Keys are `id@version`.
 */
export const TEMPLATE_POLICY_VERSIONS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  "quote-card@1.3.0": B2_POLICIES,
  "statistic-card@1.3.0": B2_POLICIES,
  "image-led-campaign@1.2.0": Object.freeze({
    ...B2_POLICIES,
    localImageTreatment: LOCAL_IMAGE_TREATMENT_POLICY_VERSION,
  }),
});

export function templatePolicyVersions(template: {
  id: string;
  version: string;
}): Readonly<Record<string, string>> | undefined {
  return TEMPLATE_POLICY_VERSIONS[`${template.id}@${template.version}`];
}
