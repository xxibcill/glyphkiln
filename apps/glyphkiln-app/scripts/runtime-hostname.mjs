import { BlockList, isIP } from "node:net";

const DEFAULT_HOSTNAME = "127.0.0.1";
const DNS_LABEL = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;
const HTTPS_ORIGIN = /^https:\/\/[^/?#\\\s]+$/i;
const POSTGRESQL_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOOPBACK_ADDRESSES = new BlockList();
LOOPBACK_ADDRESSES.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK_ADDRESSES.addAddress("::1", "ipv6");
const WILDCARD_ADDRESSES = new BlockList();
WILDCARD_ADDRESSES.addAddress("0.0.0.0", "ipv4");
WILDCARD_ADDRESSES.addAddress("::", "ipv6");

/**
 * Validate the complete network exposure configuration without performing I/O.
 *
 * Loopback operation is intentionally dependency-free. A concrete non-loopback
 * bind requires every production control so an isolated configuration mistake
 * cannot silently expose the application.
 */
export function validateGlyphkilnRuntimeConfiguration(environment = process.env) {
  const hostname =
    readTrimmedEnvironmentValue(environment, "GLYPHKILN_HOSTNAME") || DEFAULT_HOSTNAME;

  validateBindHostname(hostname);

  const isLoopback = isLoopbackHostname(hostname);
  if (isLoopback) {
    return Object.freeze({ hostname, isLoopback });
  }

  const invalidRequirements = [];
  if (environment.NODE_ENV !== "production") {
    invalidRequirements.push('NODE_ENV (must equal "production")');
  }
  if (
    !isValidPublicOrigin(
      readTrimmedEnvironmentValue(environment, "GLYPHKILN_PUBLIC_ORIGIN"),
    )
  ) {
    invalidRequirements.push(
      "GLYPHKILN_PUBLIC_ORIGIN (must be a non-loopback HTTPS origin with no credentials, path, query, or fragment)",
    );
  }
  if (environment.GLYPHKILN_TRUST_PROXY !== "true") {
    invalidRequirements.push('GLYPHKILN_TRUST_PROXY (must equal "true")');
  }
  if (!isValidPostgresqlUrl(readTrimmedEnvironmentValue(environment, "DATABASE_URL"))) {
    invalidRequirements.push(
      "DATABASE_URL (must be a nonempty postgres:// or postgresql:// URL)",
    );
  }
  if (environment.GLYPHKILN_SECURE_COOKIES !== "true") {
    invalidRequirements.push('GLYPHKILN_SECURE_COOKIES (must equal "true")');
  }

  if (invalidRequirements.length > 0) {
    throw new Error(
      `Refusing non-loopback GLYPHKILN_HOSTNAME. Invalid or missing configuration: ${invalidRequirements.join(
        "; ",
      )}.`,
    );
  }

  return Object.freeze({ hostname, isLoopback });
}

export function readGlyphkilnHostname(environment = process.env) {
  return validateGlyphkilnRuntimeConfiguration(environment).hostname;
}

function readTrimmedEnvironmentValue(environment, name) {
  const value = environment[name];
  return typeof value === "string" ? value.trim() : "";
}

function validateBindHostname(hostname) {
  if (isWildcardHostname(hostname)) {
    throw new Error(
      "Invalid GLYPHKILN_HOSTNAME: wildcard bind addresses are not allowed; use a concrete IP address or DNS hostname.",
    );
  }

  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) return;

  if (
    hostname.includes(":") ||
    !isValidDnsHostname(hostname) ||
    isNoncanonicalIpAddress(hostname)
  ) {
    throw new Error(
      "Invalid GLYPHKILN_HOSTNAME: expected localhost, a canonical IP address, or a valid DNS hostname.",
    );
  }
}

function isWildcardHostname(hostname) {
  if (hostname.includes("*")) return true;
  return isAddressInBlockList(WILDCARD_ADDRESSES, hostname);
}

function isLoopbackHostname(hostname) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");
  if (normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost")) {
    return true;
  }

  return isAddressInBlockList(LOOPBACK_ADDRESSES, hostname);
}

function isAddressInBlockList(blockList, hostname) {
  const ipVersion = isIP(hostname);
  if (ipVersion === 0) return false;
  return blockList.check(hostname, ipVersion === 4 ? "ipv4" : "ipv6");
}

function isValidDnsHostname(hostname) {
  const withoutRootLabel = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (
    withoutRootLabel.length === 0 ||
    withoutRootLabel.length > 253 ||
    /^\d+(?:\.\d+)*$/.test(withoutRootLabel)
  ) {
    return false;
  }
  return withoutRootLabel.split(".").every((label) => DNS_LABEL.test(label));
}

function isNoncanonicalIpAddress(hostname) {
  try {
    return isIP(new URL(`http://${hostname}/`).hostname) !== 0;
  } catch {
    return false;
  }
}

function isValidPublicOrigin(value) {
  if (!value || !HTTPS_ORIGIN.test(value)) return false;

  try {
    const origin = new URL(value);
    const hostname = unbracketIpv6Hostname(origin.hostname);
    return (
      origin.protocol === "https:" &&
      origin.username === "" &&
      origin.password === "" &&
      origin.pathname === "/" &&
      origin.search === "" &&
      origin.hash === "" &&
      isValidNetworkHostname(hostname) &&
      !isWildcardHostname(hostname) &&
      !isLoopbackHostname(hostname)
    );
  } catch {
    return false;
  }
}

function unbracketIpv6Hostname(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isValidNetworkHostname(hostname) {
  if (isIP(hostname) !== 0) return true;
  return isValidDnsHostname(hostname) && !isNoncanonicalIpAddress(hostname);
}

function isValidPostgresqlUrl(value) {
  if (!value || /\s/.test(value)) return false;

  try {
    const databaseUrl = new URL(value);
    return (
      POSTGRESQL_PROTOCOLS.has(databaseUrl.protocol) && databaseUrl.hostname.length > 0
    );
  } catch {
    return false;
  }
}
