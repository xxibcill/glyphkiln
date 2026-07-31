import { BlockList, isIP } from "node:net";

const JSON_MEDIA_TYPE = "application/json";
export const APP_REQUEST_BYTE_LIMIT = 1_048_576;
const LOOPBACK_ADDRESSES = new BlockList();
LOOPBACK_ADDRESSES.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK_ADDRESSES.addAddress("::1", "ipv6");

export type RequestReadFailure = {
  status: 400 | 403 | 413 | 415;
  code:
    | "CSRF_ORIGIN_REJECTED"
    | "INVALID_REQUEST_BODY"
    | "MALFORMED_JSON"
    | "REQUEST_BYTES_LIMIT_EXCEEDED"
    | "UNSUPPORTED_MEDIA_TYPE";
  title: string;
  detail: string;
};

export type RequestReadResult =
  { ok: true; value: unknown } | { ok: false; failure: RequestReadFailure };

export async function readBoundedJsonRequest(
  request: Request,
  maximumBytes = APP_REQUEST_BYTE_LIMIT,
): Promise<RequestReadResult> {
  if (!hasJsonMediaType(request)) {
    return requestFailure(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "JSON request required",
      "Send the request as application/json.",
    );
  }
  if (declaredBodyIsTooLarge(request, maximumBytes)) {
    return bodyTooLarge(maximumBytes);
  }

  let body: string | undefined;
  try {
    body = await readBoundedBody(request, maximumBytes);
  } catch {
    return requestFailure(
      400,
      "INVALID_REQUEST_BODY",
      "Request body could not be read",
      "Send valid UTF-8 JSON and try again.",
    );
  }
  if (body === undefined) return bodyTooLarge(maximumBytes);

  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return requestFailure(
      400,
      "MALFORMED_JSON",
      "JSON could not be read",
      "Check the JSON syntax and try again.",
    );
  }
}

export function verifySameOriginRequest(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
): RequestReadFailure | undefined {
  const expectedOrigin = readExpectedOrigin(request, environment);
  const presentedOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    presentedOrigin !== expectedOrigin ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    return {
      status: 403,
      code: "CSRF_ORIGIN_REJECTED",
      title: "Request origin rejected",
      detail: "Send this request from the configured Glyphkiln application origin.",
    };
  }
  return undefined;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (header === null) return undefined;
  const matches = header
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${name}=`))
    .map((cookie) => cookie.slice(name.length + 1));
  const match = matches.at(0);
  if (matches.length !== 1 || match === undefined || match === "") {
    return undefined;
  }
  try {
    return decodeURIComponent(match);
  } catch {
    return undefined;
  }
}

function hasJsonMediaType(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    JSON_MEDIA_TYPE
  );
}

function declaredBodyIsTooLarge(request: Request, maximumBytes: number): boolean {
  const header = request.headers.get("content-length");
  if (header === null) return false;
  const declaredBytes = Number(header);
  return Number.isFinite(declaredBytes) && declaredBytes > maximumBytes;
}

async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<string | undefined> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for (let result = await reader.read(); !result.done; result = await reader.read()) {
    byteLength += result.value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function readExpectedOrigin(
  request: Request,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const configured = environment.GLYPHKILN_PUBLIC_ORIGIN?.trim();
  if (configured !== undefined && configured !== "") {
    return new URL(configured).origin;
  }
  const requestUrl = new URL(request.url);
  return isLoopbackHostname(requestUrl.hostname) ? requestUrl.origin : undefined;
}

function isLoopbackHostname(input: string): boolean {
  const hostname = input
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, "$1")
    .replace(/\.$/u, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  const ipVersion = isIP(hostname);
  return (
    ipVersion !== 0 &&
    LOOPBACK_ADDRESSES.check(hostname, ipVersion === 4 ? "ipv4" : "ipv6")
  );
}

function bodyTooLarge(maximumBytes: number): RequestReadResult {
  return requestFailure(
    413,
    "REQUEST_BYTES_LIMIT_EXCEEDED",
    "Request is too large",
    `Application requests must be ${maximumBytes.toString()} bytes or smaller.`,
  );
}

function requestFailure(
  status: RequestReadFailure["status"],
  code: RequestReadFailure["code"],
  title: string,
  detail: string,
): RequestReadResult {
  return { ok: false, failure: { status, code, title, detail } };
}
