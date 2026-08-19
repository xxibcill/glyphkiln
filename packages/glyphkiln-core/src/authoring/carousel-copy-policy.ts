export const CAROUSEL_COPY_ADVISORY_VERSION = "1.0.0" as const;

export type CarouselCopyAdvisoryRange = {
  readonly minimum: number;
  readonly maximum: number;
  readonly evidence: "glyphkiln-advisory";
};

const advisoryRange = (minimum: number, maximum: number): CarouselCopyAdvisoryRange =>
  Object.freeze({ minimum, maximum, evidence: "glyphkiln-advisory" });

export const CAROUSEL_COPY_ADVISORY = Object.freeze({
  badge: advisoryRange(1, 12),
  eyebrow: advisoryRange(1, 36),
  headline: advisoryRange(12, 72),
  subtitle: advisoryRange(12, 120),
  statistic: Object.freeze({
    value: advisoryRange(1, 12),
    label: advisoryRange(4, 72),
    trend: advisoryRange(1, 20),
  }),
  cta: advisoryRange(2, 32),
  footer: advisoryRange(1, 90),
  attribution: advisoryRange(1, 80),
} as const);
