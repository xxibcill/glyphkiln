import { createConnection, type Socket } from "node:net";

import { RENDER_RESOURCE_LIMITS } from "@glyphkiln/core";

import { containsControlCharacter } from "./inert-text";
import type {
  MalwareScanner,
  MalwareScanRequest,
  MalwareScanResult,
} from "./malware-scanner";

const INSTREAM_COMMAND = Buffer.from("zINSTREAM\0", "ascii");
const VERSION_COMMAND = Buffer.from("zVERSION\0", "ascii");
const FINAL_CHUNK = Buffer.alloc(4);
const DEFAULT_CHUNK_BYTES = 64 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024;
const DEFAULT_CONNECT_TIMEOUT_MS = 2_000;
const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_SIGNATURE_AGE_MS = 48 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export type ClamAvEndpoint =
  | {
      kind: "tcp";
      host: string;
      port: number;
    }
  | {
      kind: "unix";
      socketPath: string;
    };

export type ClamAvInstreamScannerOptions = {
  endpoint: ClamAvEndpoint;
  scannerVersion: string;
  connectTimeoutMilliseconds?: number | undefined;
  scanTimeoutMilliseconds?: number | undefined;
  chunkBytes?: number | undefined;
  maximumBytes?: number | undefined;
  maximumResponseBytes?: number | undefined;
  maximumSignatureAgeMilliseconds?: number | undefined;
  now?: (() => Date) | undefined;
};

type ValidatedOptions = {
  endpoint: ClamAvEndpoint;
  scannerVersion: string;
  connectTimeoutMilliseconds: number;
  scanTimeoutMilliseconds: number;
  chunkBytes: number;
  maximumBytes: number;
  maximumResponseBytes: number;
  maximumSignatureAgeMilliseconds: number;
  now: () => Date;
};

function boundedInteger(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return value;
}

function boundedConfigurationText(
  value: string,
  name: string,
  maximum: number,
): string {
  if (
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    !value.isWellFormed() ||
    containsControlCharacter(value)
  ) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function validateEndpoint(endpoint: ClamAvEndpoint): ClamAvEndpoint {
  return endpoint.kind === "tcp"
    ? {
        kind: endpoint.kind,
        host: boundedConfigurationText(endpoint.host, "ClamAV host", 253),
        port: boundedInteger(endpoint.port, "ClamAV port", 1, 65_535),
      }
    : {
        kind: endpoint.kind,
        socketPath: boundedConfigurationText(
          endpoint.socketPath,
          "ClamAV socket path",
          1_024,
        ),
      };
}

function validateOptions(options: ClamAvInstreamScannerOptions): ValidatedOptions {
  return {
    endpoint: validateEndpoint(options.endpoint),
    scannerVersion: boundedConfigurationText(
      options.scannerVersion,
      "ClamAV scanner version",
      120,
    ),
    connectTimeoutMilliseconds: boundedInteger(
      options.connectTimeoutMilliseconds ?? DEFAULT_CONNECT_TIMEOUT_MS,
      "ClamAV connect timeout",
      10,
      30_000,
    ),
    scanTimeoutMilliseconds: boundedInteger(
      options.scanTimeoutMilliseconds ?? DEFAULT_SCAN_TIMEOUT_MS,
      "ClamAV scan timeout",
      10,
      120_000,
    ),
    chunkBytes: boundedInteger(
      options.chunkBytes ?? DEFAULT_CHUNK_BYTES,
      "ClamAV INSTREAM chunk size",
      1_024,
      1024 * 1024,
    ),
    maximumBytes: boundedInteger(
      options.maximumBytes ?? RENDER_RESOURCE_LIMITS.maxAssetBytes,
      "ClamAV maximum request size",
      1,
      RENDER_RESOURCE_LIMITS.maxAssetBytes,
    ),
    maximumResponseBytes: boundedInteger(
      options.maximumResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "ClamAV maximum response size",
      64,
      64 * 1024,
    ),
    maximumSignatureAgeMilliseconds: boundedInteger(
      options.maximumSignatureAgeMilliseconds ?? DEFAULT_MAX_SIGNATURE_AGE_MS,
      "ClamAV maximum signature age",
      60_000,
      7 * 24 * 60 * 60 * 1_000,
    ),
    now: options.now ?? (() => new Date()),
  };
}

function encodeChunk(bytes: Uint8Array): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.byteLength);
  return Buffer.concat([header, bytes]);
}

function write(socket: Socket, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(bytes, (error) => {
      if (error === undefined || error === null) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function parseResponse(response: string): "clean" | "rejected" | "unavailable" {
  if (response === "stream: OK") {
    return "clean";
  }
  if (/^stream: .+ FOUND$/u.test(response)) {
    return "rejected";
  }
  return "unavailable";
}

async function sendInstream(
  socket: Socket,
  request: MalwareScanRequest,
  chunkBytes: number,
): Promise<void> {
  await write(socket, INSTREAM_COMMAND);
  for (let offset = 0; offset < request.bytes.byteLength; offset += chunkBytes) {
    await write(
      socket,
      encodeChunk(request.bytes.subarray(offset, offset + chunkBytes)),
    );
  }
  await write(socket, FINAL_CHUNK);
}

function exchangeWithSocket(
  options: ValidatedOptions,
  send: (socket: Socket) => Promise<void>,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket =
      options.endpoint.kind === "tcp"
        ? createConnection({
            host: options.endpoint.host,
            port: options.endpoint.port,
          })
        : createConnection(options.endpoint.socketPath);
    let settled = false;
    let response = Buffer.alloc(0);
    let scanTimer: ReturnType<typeof setTimeout> | undefined;
    const connectTimer = setTimeout(() => {
      settle(undefined);
    }, options.connectTimeoutMilliseconds);

    function settle(result: string | undefined): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(connectTimer);
      if (scanTimer !== undefined) {
        clearTimeout(scanTimer);
      }
      socket.destroy();
      resolve(result);
    }

    socket.once("connect", () => {
      clearTimeout(connectTimer);
      socket.setNoDelay(true);
      scanTimer = setTimeout(() => {
        settle(undefined);
      }, options.scanTimeoutMilliseconds);
      void send(socket).catch(() => {
        settle(undefined);
      });
    });
    socket.on("data", (chunk: Buffer) => {
      if (
        settled ||
        chunk.byteLength > options.maximumResponseBytes - response.byteLength
      ) {
        settle(undefined);
        return;
      }
      response = Buffer.concat([response, chunk]);
      const terminator = response.indexOf(0);
      if (terminator !== -1) {
        settle(
          terminator === response.byteLength - 1
            ? response.subarray(0, terminator).toString("utf8")
            : undefined,
        );
      }
    });
    socket.once("error", () => {
      settle(undefined);
    });
    socket.once("close", () => {
      settle(undefined);
    });
  });
}

async function scanWithSocket(
  request: MalwareScanRequest,
  options: ValidatedOptions,
): Promise<"clean" | "rejected" | "unavailable"> {
  const response = await exchangeWithSocket(options, (socket) =>
    sendInstream(socket, request, options.chunkBytes),
  );
  return response === undefined ? "unavailable" : parseResponse(response);
}

async function readSignatureVersion(
  options: ValidatedOptions,
  now: Date,
): Promise<string | undefined> {
  const response = await exchangeWithSocket(options, (socket) =>
    write(socket, VERSION_COMMAND),
  );
  if (response === undefined) return undefined;
  const match = /^ClamAV [^/]{1,120}\/([0-9]{1,10})\/(.{1,200})$/u.exec(response);
  if (match === null) return undefined;
  const signatureVersion = match[1];
  const signatureTimestamp = Date.parse(match[2]);
  if (
    !Number.isFinite(signatureTimestamp) ||
    signatureTimestamp > now.getTime() + MAX_CLOCK_SKEW_MS ||
    now.getTime() - signatureTimestamp > options.maximumSignatureAgeMilliseconds
  ) {
    return undefined;
  }
  return signatureVersion;
}

/**
 * Production ClamAV adapter using the daemon's length-prefixed INSTREAM
 * protocol. The endpoint is operator configuration; upload metadata cannot
 * choose a host, socket, command, or filesystem path.
 */
export class ClamAvInstreamScanner implements MalwareScanner {
  readonly #options: ValidatedOptions;

  public constructor(options: ClamAvInstreamScannerOptions) {
    this.#options = validateOptions(options);
  }

  public async scan(request: MalwareScanRequest): Promise<MalwareScanResult> {
    if (
      !(request.bytes instanceof Uint8Array) ||
      request.bytes.byteLength < 1 ||
      request.bytes.byteLength > this.#options.maximumBytes
    ) {
      return { status: "unavailable" };
    }

    const scannedAt = this.#options.now();
    if (!Number.isFinite(scannedAt.getTime())) {
      return { status: "unavailable" };
    }
    const signatureVersion = await readSignatureVersion(this.#options, scannedAt);
    if (signatureVersion === undefined) {
      return { status: "unavailable" };
    }
    const status = await scanWithSocket(request, this.#options);
    if (status !== "clean") {
      return { status };
    }
    return {
      status: "clean",
      scannerName: "ClamAV INSTREAM",
      scannerVersion: this.#options.scannerVersion,
      scannedAt,
      reference: `clamav:INSTREAM;db=${signatureVersion}`,
    };
  }
}
