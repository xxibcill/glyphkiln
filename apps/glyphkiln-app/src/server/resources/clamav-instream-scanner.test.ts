import { createServer, type AddressInfo, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { ClamAvInstreamScanner } from "./clamav-instream-scanner";
import type { MalwareScanRequest } from "./malware-scanner";

const REQUEST: MalwareScanRequest = {
  kind: "raster-asset",
  mediaType: "image/png",
  contentHash: "a".repeat(64),
  bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
};

const servers: Server[] = [];

async function listen(
  onUpload: (bytes: Uint8Array, socket: Socket) => void,
  versionResponse = "ClamAV 1.4.3/27654/2026-07-31T00:00:00.000Z",
): Promise<number> {
  const server = createServer((socket) => {
    let received = Buffer.alloc(0);
    let commandRead = false;
    const payload: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      if (!commandRead) {
        if (
          received.byteLength >= 9 &&
          received.subarray(0, 9).toString("ascii") === "zVERSION\0"
        ) {
          socket.end(`${versionResponse}\0`);
          return;
        }
        if (received.byteLength < 10) {
          return;
        }
        expect(received.subarray(0, 10).toString("ascii")).toBe("zINSTREAM\0");
        received = received.subarray(10);
        commandRead = true;
      }
      while (received.byteLength >= 4) {
        const chunkLength = received.readUInt32BE(0);
        if (received.byteLength < 4 + chunkLength) {
          return;
        }
        received = received.subarray(4);
        if (chunkLength === 0) {
          onUpload(Uint8Array.from(Buffer.concat(payload)), socket);
          return;
        }
        payload.push(received.subarray(0, chunkLength));
        received = received.subarray(chunkLength);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return (server.address() as AddressInfo).port;
}

function scanner(port: number, overrides = {}): ClamAvInstreamScanner {
  return new ClamAvInstreamScanner({
    endpoint: { kind: "tcp", host: "127.0.0.1", port },
    scannerVersion: "1.4.3",
    connectTimeoutMilliseconds: 100,
    scanTimeoutMilliseconds: 100,
    now: () => new Date("2026-07-31T00:00:00.000Z"),
    ...overrides,
  });
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

describe("ClamAV INSTREAM scanner", () => {
  it("sends bounded length-prefixed bytes and records a clean receipt", async () => {
    const port = await listen((bytes, socket) => {
      expect(bytes).toEqual(REQUEST.bytes);
      socket.end("stream: OK\0");
    });

    await expect(scanner(port).scan(REQUEST)).resolves.toEqual({
      status: "clean",
      scannerName: "ClamAV INSTREAM",
      scannerVersion: "1.4.3",
      scannedAt: new Date("2026-07-31T00:00:00.000Z"),
      reference: "clamav:INSTREAM;db=27654",
    });
  });

  it("maps malware findings to rejection without exposing the signature", async () => {
    const port = await listen((_bytes, socket) => {
      socket.end("stream: Eicar-Test-Signature FOUND\0");
    });

    await expect(scanner(port).scan(REQUEST)).resolves.toEqual({
      status: "rejected",
    });
  });

  it("fails closed on timeout, oversized requests, and oversized responses", async () => {
    const timeoutPort = await listen(() => undefined);
    await expect(
      scanner(timeoutPort, { scanTimeoutMilliseconds: 10 }).scan(REQUEST),
    ).resolves.toEqual({ status: "unavailable" });

    const oversizedRequestPort = await listen(() => {
      throw new Error("Oversized requests must not connect.");
    });
    await expect(
      scanner(oversizedRequestPort, { maximumBytes: 3 }).scan(REQUEST),
    ).resolves.toEqual({ status: "unavailable" });

    const oversizedResponsePort = await listen((_bytes, socket) => {
      socket.end(`${"x".repeat(65)}\0`);
    });
    await expect(
      scanner(oversizedResponsePort, { maximumResponseBytes: 64 }).scan(REQUEST),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("fails closed before upload when the signature database is stale", async () => {
    const port = await listen(() => {
      throw new Error("Stale signatures must stop before INSTREAM.");
    }, "ClamAV 1.4.3/27000/2026-07-28T00:00:00.000Z");

    await expect(scanner(port).scan(REQUEST)).resolves.toEqual({
      status: "unavailable",
    });
  });
});
