import { hashCanonical } from "./canonical.js";
import {
  createRenderFingerprintPayload,
  type RenderFingerprintInput,
} from "./fingerprint-contract.js";

export {
  RENDER_CONFIGURATION,
  createRenderFingerprintPayload,
} from "./fingerprint-contract.js";
export type {
  RenderFingerprintFont,
  RenderFingerprintInput,
} from "./fingerprint-contract.js";

export function createRenderFingerprint(input: RenderFingerprintInput): string {
  return hashCanonical(createRenderFingerprintPayload(input));
}
