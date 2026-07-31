const MAXIMUM_EMAIL_LENGTH = 254;
const MAXIMUM_LOCAL_PART_LENGTH = 64;
const LOCAL_PART_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

declare const normalizedEmailBrand: unique symbol;

export type NormalizedEmail = string & {
  readonly [normalizedEmailBrand]: true;
};

export class InvalidEmailError extends Error {
  readonly code = "INVALID_EMAIL";

  constructor() {
    super("Email address is invalid.");
    this.name = "InvalidEmailError";
  }
}

export function normalizeEmail(input: string): NormalizedEmail {
  const normalized = input.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  const hasOneAtSign = atIndex > 0 && atIndex === normalized.lastIndexOf("@");

  if (
    normalized.length === 0 ||
    normalized.length > MAXIMUM_EMAIL_LENGTH ||
    !hasOneAtSign
  ) {
    throw new InvalidEmailError();
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const domainLabels = domain.split(".");
  const localPartIsValid =
    localPart.length <= MAXIMUM_LOCAL_PART_LENGTH &&
    LOCAL_PART_PATTERN.test(localPart) &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..");
  const domainIsValid =
    domainLabels.length >= 2 &&
    domainLabels.every((label) => DOMAIN_LABEL_PATTERN.test(label));

  if (!localPartIsValid || !domainIsValid) {
    throw new InvalidEmailError();
  }

  return normalized as NormalizedEmail;
}
