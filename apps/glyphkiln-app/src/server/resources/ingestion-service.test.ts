import { createDevelopmentFont, RENDER_RESOURCE_LIMITS, sha256 } from "@glyphkiln/core";
import { describe, expect, it, vi } from "vitest";

import { ResourceIngestionError } from "./errors";
import { ResourceIngestionService } from "./ingestion-service";
import type {
  MalwareScanner,
  MalwareScanRequest,
  MalwareScanResult,
} from "./malware-scanner";
import type { ResourceStore } from "./resource-store";
import type {
  AdmittedResource,
  ResourceAdmission,
  ResourceVersion,
  ResourceWithBytes,
} from "./types";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    "base64",
  ),
);

const CLEAN_RECEIPT = {
  status: "clean",
  scannerName: "fixture-scanner",
  scannerVersion: "1.2.3",
  scannedAt: new Date("2026-07-31T00:00:00.000Z"),
} as const;

function mapAdmittedResource(resource: AdmittedResource): ResourceVersion {
  const common = {
    id: resource.id,
    workspaceId: resource.workspaceId,
    contentHash: resource.contentHash,
    storageKey: "test/immutable",
    byteSize: resource.bytes.byteLength,
    origin: resource.origin,
    license: resource.license,
    scan: resource.scan,
    createdBy: resource.actorUserId,
    createdAt: new Date("2026-07-31T00:00:01.000Z"),
  };
  return resource.kind === "raster-asset"
    ? {
        ...common,
        kind: resource.kind,
        mediaType: resource.mediaType,
        width: resource.width,
        height: resource.height,
      }
    : {
        ...common,
        kind: resource.kind,
        mediaType: resource.mediaType,
        family: resource.family,
        weight: resource.weight,
        style: resource.style,
      };
}

class CapturingResourceStore implements ResourceStore {
  public admitted: AdmittedResource | undefined;

  public admit(resource: AdmittedResource): Promise<ResourceAdmission> {
    this.admitted = resource;
    return Promise.resolve({
      resource: mapAdmittedResource(resource),
      duplicate: false,
      ingestionId: resource.ingestionId,
    });
  }

  public findById(): Promise<ResourceVersion | null> {
    return Promise.resolve(null);
  }

  public readById(): Promise<ResourceWithBytes | null> {
    return Promise.resolve(null);
  }

  public findFontVersion(): Promise<ResourceVersion | null> {
    return Promise.resolve(null);
  }

  public readFontVersion(): Promise<ResourceWithBytes | null> {
    return Promise.resolve(null);
  }
}

function cleanScanner(
  scan: MalwareScanner["scan"] = () => Promise.resolve(CLEAN_RECEIPT),
): MalwareScanner {
  return { scan };
}

function createIds(): () => string {
  const ids = ["resource-a", "ingestion-a"];
  return () => ids.shift() ?? "unexpected-id";
}

function rasterInput(bytes: Uint8Array = PNG): Record<string, unknown> {
  return {
    workspaceId: "workspace-a",
    actorUserId: "user-a",
    declaredMediaType: "image/png",
    bytes,
    originalFilename: "mark.png",
    origin: {
      kind: "licensed-library",
      sourceName: "Fixture Library",
      sourceReference: "fixture:asset-1",
    },
    license: {
      status: "licensed",
      identifier: "LicenseRef-1",
      notes: "Redistribution permitted for rendered outputs.",
    },
  };
}

describe("safe resource ingestion", () => {
  it("fails closed when no host malware scanner is configured", async () => {
    const store = new CapturingResourceStore();
    const service = new ResourceIngestionService({
      store,
      createId: createIds(),
    });

    await expect(service.ingestRaster(rasterInput())).rejects.toMatchObject({
      code: "SCANNER_UNAVAILABLE",
    });
    expect(store.admitted).toBeUndefined();
  });

  it("rejects uploaded SVG and mismatched raster signatures before scanning", async () => {
    const store = new CapturingResourceStore();
    const scan = vi.fn<MalwareScanner["scan"]>().mockResolvedValue(CLEAN_RECEIPT);
    const service = new ResourceIngestionService({
      store,
      scanner: cleanScanner(scan),
      createId: createIds(),
    });

    await expect(
      service.ingestRaster({
        ...rasterInput(),
        declaredMediaType: "image/svg+xml",
        bytes: Uint8Array.from(Buffer.from("<svg></svg>")),
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE_INPUT" });
    await expect(
      service.ingestRaster({
        ...rasterInput(),
        bytes: Uint8Array.from(Buffer.from("<svg></svg>")),
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_BYTES_INVALID" });
    expect(scan).not.toHaveBeenCalled();
    expect(store.admitted).toBeUndefined();
  });

  it("requires a clean scan and a complete raster decode before persistence", async () => {
    const store = new CapturingResourceStore();
    const rejected = new ResourceIngestionService({
      store,
      scanner: cleanScanner(() =>
        Promise.resolve<MalwareScanResult>({ status: "rejected" }),
      ),
      createId: createIds(),
    });
    await expect(rejected.ingestRaster(rasterInput())).rejects.toMatchObject({
      code: "SCANNER_REJECTED",
    });

    const corrupt = PNG.slice();
    corrupt[45] = corrupt[45] ^ 0xff;
    const service = new ResourceIngestionService({
      store,
      scanner: cleanScanner(),
      createId: createIds(),
    });
    await expect(service.ingestRaster(rasterInput(corrupt))).rejects.toMatchObject({
      code: "RESOURCE_BYTES_INVALID",
      details: { validationCode: "ASSET_DECODE_FAILED" },
    });
    expect(store.admitted).toBeUndefined();
  });

  it("rejects raster byte, dimension, and pixel limits before scanning", async () => {
    const store = new CapturingResourceStore();
    const scan = vi.fn<MalwareScanner["scan"]>().mockResolvedValue(CLEAN_RECEIPT);
    const service = new ResourceIngestionService({
      store,
      scanner: cleanScanner(scan),
      createId: createIds(),
    });
    const oversizedBytes = new Uint8Array(RENDER_RESOURCE_LIMITS.maxAssetBytes + 1);
    oversizedBytes.set(PNG.subarray(0, 24));
    await expect(
      service.ingestRaster(rasterInput(oversizedBytes)),
    ).rejects.toMatchObject({ code: "RESOURCE_BYTES_INVALID" });

    const oversizedDimensions = PNG.slice();
    const width = RENDER_RESOURCE_LIMITS.maxAssetDimension + 1;
    oversizedDimensions[16] = (width >>> 24) & 0xff;
    oversizedDimensions[17] = (width >>> 16) & 0xff;
    oversizedDimensions[18] = (width >>> 8) & 0xff;
    oversizedDimensions[19] = width & 0xff;
    await expect(
      service.ingestRaster(rasterInput(oversizedDimensions)),
    ).rejects.toMatchObject({ code: "RESOURCE_BYTES_INVALID" });
    expect(scan).not.toHaveBeenCalled();
  });

  it("copies scanner input and admits immutable PNG identity and dimensions", async () => {
    const store = new CapturingResourceStore();
    const scan = vi.fn((request: MalwareScanRequest) => {
      request.bytes.fill(0);
      return Promise.resolve<MalwareScanResult>(CLEAN_RECEIPT);
    });
    const service = new ResourceIngestionService({
      store,
      scanner: cleanScanner(scan),
      createId: createIds(),
    });

    const result = await service.ingestRaster(rasterInput());

    expect(result.resource).toMatchObject({
      id: "resource-a",
      workspaceId: "workspace-a",
      kind: "raster-asset",
      contentHash: sha256(PNG),
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
    expect(result.ingestionId).toBe("ingestion-a");
    expect(store.admitted?.bytes).toEqual(PNG);
    expect(scan).toHaveBeenCalledOnce();
  });

  it("holds one workspace admission across body loading, scan, decode, and store", async () => {
    const events: string[] = [];
    const store = new CapturingResourceStore();
    const originalAdmit = store.admit.bind(store);
    vi.spyOn(store, "admit").mockImplementation(async (resource) => {
      events.push("store");
      return originalAdmit(resource);
    });
    const service = new ResourceIngestionService({
      store,
      scanner: cleanScanner(() => {
        events.push("scan");
        return Promise.resolve(CLEAN_RECEIPT);
      }),
      createId: createIds(),
      admissionController: {
        async run(workspaceId, operation) {
          events.push(`enter:${workspaceId}`);
          try {
            return await operation();
          } finally {
            events.push("exit");
          }
        },
      },
    });

    await expect(
      service.runAdmitted("workspace-a", async (ingestion) => {
        events.push("body");
        return ingestion.ingestRaster(rasterInput());
      }),
    ).resolves.toMatchObject({
      resource: { id: "resource-a", workspaceId: "workspace-a" },
    });
    expect(events).toEqual(["enter:workspace-a", "body", "scan", "store", "exit"]);

    await expect(
      service.runAdmitted("workspace-a", (ingestion) =>
        ingestion.ingestRaster({
          ...rasterInput(),
          workspaceId: "workspace-b",
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE_INPUT" });
  });

  it("admits a fully parsed immutable TrueType font and rejects MIME mismatch", async () => {
    const store = new CapturingResourceStore();
    const scan = vi.fn<MalwareScanner["scan"]>().mockResolvedValue(CLEAN_RECEIPT);
    const service = new ResourceIngestionService({
      store,
      scanner: cleanScanner(scan),
      createId: createIds(),
    });
    const developmentFont = createDevelopmentFont();
    const input = {
      workspaceId: "workspace-a",
      actorUserId: "user-a",
      declaredMediaType: "font/ttf",
      bytes: developmentFont.bytes,
      originalFilename: "Inter-Variable.ttf",
      origin: {
        kind: "licensed-library",
        sourceName: "Google Fonts",
        sourceReference: "commit:7ff85c87",
      },
      license: {
        status: "licensed",
        identifier: "OFL-1.1",
      },
      family: "Uploaded Inter",
      weight: 400,
      style: "normal",
    };

    await expect(service.ingestFont(input)).resolves.toMatchObject({
      resource: {
        id: "resource-a",
        kind: "font",
        contentHash: developmentFont.sha256,
        family: "Uploaded Inter",
        weight: 400,
        style: "normal",
      },
    });

    const mismatchService = new ResourceIngestionService({
      store: new CapturingResourceStore(),
      scanner: cleanScanner(scan),
      createId: createIds(),
    });
    await expect(
      mismatchService.ingestFont({
        ...input,
        declaredMediaType: "font/otf",
      }),
    ).rejects.toBeInstanceOf(ResourceIngestionError);
    expect(scan).toHaveBeenCalledOnce();

    const oversizedFont = new Uint8Array(RENDER_RESOURCE_LIMITS.maxFontBytes + 1);
    oversizedFont.set(developmentFont.bytes.subarray(0, 12));
    await expect(
      mismatchService.ingestFont({
        ...input,
        bytes: oversizedFont,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_BYTES_INVALID" });
    expect(scan).toHaveBeenCalledOnce();
  });
});
