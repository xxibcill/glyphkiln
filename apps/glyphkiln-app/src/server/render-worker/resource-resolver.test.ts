import {
  DEVELOPMENT_FONT_SHA256,
  RENDER_RESOURCE_LIMITS,
  createDevelopmentFont,
  sha256,
  type DesignDocument,
} from "@glyphkiln/core";
import { describe, expect, it } from "vitest";

import type {
  ResourceAdmission,
  ResourceStore,
  ResourceVersion,
  ResourceWithBytes,
} from "../resources";
import { createPreviewDesign } from "../../test/preview-design";
import {
  AdmittedRenderResourceResolver,
  BuiltInRenderResourceResolver,
} from "./resource-resolver";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    "base64",
  ),
);

describe("render resource resolvers", () => {
  it("resolves admitted assets and fonts using only workspace-qualified reads", async () => {
    const store = new MemoryResourceStore();
    const fontBytes = createDevelopmentFont().bytes;
    store.add(rasterResource("workspace-a", "asset-a", PNG), PNG);
    store.add(fontResource("workspace-a", "font-a", fontBytes), fontBytes);
    const resolver = new AdmittedRenderResourceResolver(store);
    const document = documentWithResources();

    await expect(
      resolver.resolve({ workspaceId: "workspace-a", document }),
    ).resolves.toMatchObject({
      assets: [
        {
          id: "asset-a",
          mimeType: "image/png",
          sha256: sha256(PNG),
          width: 1,
          height: 1,
        },
      ],
      fonts: [
        {
          family: "Inter",
          sha256: DEVELOPMENT_FONT_SHA256,
        },
        {
          family: "Workspace Inter",
          weight: 700,
          sha256: DEVELOPMENT_FONT_SHA256,
        },
      ],
    });
    expect(store.reads).toEqual([
      ["asset", "workspace-a", "asset-a"],
      ["asset", "workspace-a", "font-a"],
    ]);
  });

  it("resolves the exact font admission selected by document provenance", async () => {
    const store = new MemoryResourceStore();
    const fontBytes = createDevelopmentFont().bytes;
    store.add(fontResource("workspace-a", "font-earlier", fontBytes), fontBytes);
    store.add(fontResource("workspace-a", "font-selected", fontBytes), fontBytes);
    const document = documentWithResources({ customFont: true });
    document.metadata = {
      ...document.metadata,
      resourceVersions: {
        assets: [],
        fonts: [
          {
            id: "font-selected",
            family: "Workspace Inter",
            weight: 700,
            style: "normal",
            sha256: DEVELOPMENT_FONT_SHA256,
            origin: { kind: "user-upload" },
            license: { status: "owned" },
          },
        ],
      },
    };

    await new AdmittedRenderResourceResolver(store).resolve({
      workspaceId: "workspace-a",
      document: { ...document, assets: [] },
    });

    expect(store.reads).toContainEqual(["asset", "workspace-a", "font-selected"]);
    expect(store.reads).not.toContainEqual([
      "font",
      "workspace-a",
      "Workspace Inter",
      "700",
      "normal",
      DEVELOPMENT_FONT_SHA256,
    ]);
  });

  it("resolves a selected admission even when it matches the development font", async () => {
    const store = new MemoryResourceStore();
    const fontBytes = createDevelopmentFont().bytes;
    store.add(
      {
        ...fontResource("workspace-a", "font-selected-inter", fontBytes),
        family: "Inter",
      },
      fontBytes,
    );
    const document = createPreviewDesign();
    document.metadata = {
      resourceVersions: {
        assets: [],
        fonts: [
          {
            id: "font-selected-inter",
            family: "Inter",
            weight: 700,
            style: "normal",
            sha256: DEVELOPMENT_FONT_SHA256,
            origin: { kind: "user-upload" },
            license: { status: "owned" },
          },
        ],
      },
    };

    await new AdmittedRenderResourceResolver(store).resolve({
      workspaceId: "workspace-a",
      document,
    });

    expect(store.reads).toContainEqual(["asset", "workspace-a", "font-selected-inter"]);
  });

  it("does not resolve a same-id resource from another workspace", async () => {
    const store = new MemoryResourceStore();
    store.add(rasterResource("workspace-b", "asset-a", PNG), PNG);
    const resolver = new AdmittedRenderResourceResolver(store);
    await expect(
      resolver.resolve({
        workspaceId: "workspace-a",
        document: documentWithResources({ customFont: false }),
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_ADMITTED" });
  });

  it("rejects any declaration that differs from immutable admitted metadata", async () => {
    const store = new MemoryResourceStore();
    const resource = rasterResource("workspace-a", "asset-a", PNG);
    store.add({ ...resource, width: 2 }, PNG);
    const resolver = new AdmittedRenderResourceResolver(store);
    await expect(
      resolver.resolve({
        workspaceId: "workspace-a",
        document: documentWithResources({ customFont: false }),
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_DECLARATION_MISMATCH" });
  });

  it("rejects aggregate asset bytes from metadata before reading any blob", async () => {
    const store = new MemoryResourceStore();
    const declarations = Array.from({ length: 4 }, (_, index) =>
      addDeclaredRaster(store, `asset-${index.toString()}`, {
        byteSize: RENDER_RESOURCE_LIMITS.maxAssetBytes,
      }),
    );
    const resolver = new AdmittedRenderResourceResolver(store);

    await expect(
      resolver.resolve({
        workspaceId: "workspace-a",
        document: { ...createPreviewDesign(), assets: declarations },
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    expect(store.reads).toEqual([]);
  });

  it("rejects aggregate decoded pixels from metadata before reading any blob", async () => {
    const store = new MemoryResourceStore();
    const declarations = Array.from({ length: 3 }, (_, index) =>
      addDeclaredRaster(store, `asset-${index.toString()}`, {
        width: 8_000,
        height: 5_000,
      }),
    );
    const resolver = new AdmittedRenderResourceResolver(store);

    await expect(
      resolver.resolve({
        workspaceId: "workspace-a",
        document: { ...createPreviewDesign(), assets: declarations },
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    expect(store.reads).toEqual([]);
  });

  it("rejects declaration counts before querying resource metadata", async () => {
    const store = new MemoryResourceStore();
    const declaration = addDeclaredRaster(store, "asset-template");
    const resolver = new AdmittedRenderResourceResolver(store);
    const assets = Array.from(
      { length: RENDER_RESOURCE_LIMITS.maxAssets + 1 },
      (_, index) => ({ ...declaration, id: `asset-${index.toString()}` }),
    );

    await expect(
      resolver.resolve({
        workspaceId: "workspace-a",
        document: { ...createPreviewDesign(), assets },
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    expect(store.metadataReads).toEqual([]);
    expect(store.reads).toEqual([]);
  });

  it("preflights aggregate font bytes and duplicate faces before blob reads", async () => {
    const store = new MemoryResourceStore();
    const fontBytes = createDevelopmentFont().bytes;
    const declarations = Array.from({ length: 4 }, (_, index) => {
      const family = `Workspace Font ${index.toString()}`;
      store.add(
        {
          ...fontResource("workspace-a", `font-${index.toString()}`, fontBytes),
          byteSize: RENDER_RESOURCE_LIMITS.maxFontBytes,
          family,
        },
        fontBytes,
      );
      return {
        family,
        weight: 700,
        style: "normal" as const,
        sha256: DEVELOPMENT_FONT_SHA256,
      };
    });
    const resolver = new AdmittedRenderResourceResolver(store);

    await expect(
      resolver.resolve({
        workspaceId: "workspace-a",
        document: { ...createPreviewDesign(), assets: [], fonts: declarations },
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    expect(store.reads).toEqual([]);

    const duplicateStore = new MemoryResourceStore();
    duplicateStore.add(fontResource("workspace-a", "font-a", fontBytes), fontBytes);
    const duplicate = {
      family: "Workspace Inter",
      weight: 700,
      style: "normal" as const,
      sha256: DEVELOPMENT_FONT_SHA256,
    };
    await expect(
      new AdmittedRenderResourceResolver(duplicateStore).resolve({
        workspaceId: "workspace-a",
        document: {
          ...createPreviewDesign(),
          assets: [],
          fonts: [duplicate, duplicate],
        },
      }),
    ).resolves.toMatchObject({ fonts: [{ family: "Workspace Inter" }] });
    expect(duplicateStore.metadataReads).toHaveLength(1);
    expect(duplicateStore.reads).toHaveLength(1);
  });

  it("keeps the built-in resolver fail-closed for documents with uploads", async () => {
    const resolver = new BuiltInRenderResourceResolver();
    await expect(
      resolver.resolve({
        workspaceId: "workspace-a",
        document: documentWithResources({ customFont: false }),
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_RESOLVER_REQUIRED" });
  });
});

class MemoryResourceStore implements ResourceStore {
  readonly #resources = new Map<string, ResourceWithBytes>();
  readonly metadataReads: string[][] = [];
  readonly reads: string[][] = [];

  add(resource: ResourceVersion, bytes: Uint8Array): void {
    this.#resources.set(`${resource.workspaceId}\u0000${resource.id}`, {
      resource,
      bytes: new Uint8Array(bytes),
    });
  }

  admit(): Promise<ResourceAdmission> {
    return Promise.reject(new Error("not used by resolver tests"));
  }

  findById(workspaceId: string, resourceId: string): Promise<ResourceVersion | null> {
    this.metadataReads.push(["asset", workspaceId, resourceId]);
    return Promise.resolve(
      this.#resources.get(`${workspaceId}\u0000${resourceId}`)?.resource ?? null,
    );
  }

  listByWorkspace(workspaceId: string, maximum: number): Promise<ResourceVersion[]> {
    return Promise.resolve(
      [...this.#resources.values()]
        .map((stored) => stored.resource)
        .filter((resource) => resource.workspaceId === workspaceId)
        .slice(0, maximum),
    );
  }

  readById(workspaceId: string, resourceId: string): Promise<ResourceWithBytes | null> {
    this.reads.push(["asset", workspaceId, resourceId]);
    return Promise.resolve(
      this.#resources.get(`${workspaceId}\u0000${resourceId}`) ?? null,
    );
  }

  findFontVersion(
    workspaceId: string,
    reference: {
      family: string;
      weight: number;
      style: "normal" | "italic";
      contentHash: string;
    },
  ): Promise<ResourceVersion | null> {
    this.metadataReads.push([
      "font",
      workspaceId,
      reference.family,
      String(reference.weight),
      reference.style,
      reference.contentHash,
    ]);
    return Promise.resolve(this.#findFont(workspaceId, reference)?.resource ?? null);
  }

  readFontVersion(
    workspaceId: string,
    reference: {
      family: string;
      weight: number;
      style: "normal" | "italic";
      contentHash: string;
    },
  ): Promise<ResourceWithBytes | null> {
    this.reads.push([
      "font",
      workspaceId,
      reference.family,
      String(reference.weight),
      reference.style,
      reference.contentHash,
    ]);
    return Promise.resolve(this.#findFont(workspaceId, reference) ?? null);
  }

  #findFont(
    workspaceId: string,
    reference: {
      family: string;
      weight: number;
      style: "normal" | "italic";
      contentHash: string;
    },
  ): ResourceWithBytes | undefined {
    return [...this.#resources.values()].find(
      (candidate) =>
        candidate.resource.workspaceId === workspaceId &&
        candidate.resource.kind === "font" &&
        candidate.resource.family === reference.family &&
        candidate.resource.weight === reference.weight &&
        candidate.resource.style === reference.style &&
        candidate.resource.contentHash === reference.contentHash,
    );
  }
}

function documentWithResources(options: { customFont?: boolean } = {}): DesignDocument {
  const base = createPreviewDesign();
  return {
    ...base,
    assets: [
      {
        id: "asset-a",
        mimeType: "image/png",
        sha256: sha256(PNG),
        width: 1,
        height: 1,
        origin: {
          kind: "user-upload",
          sourceName: "Resolver fixture",
        },
      },
    ],
    fonts:
      options.customFont === false
        ? base.fonts
        : [
            ...base.fonts,
            {
              family: "Workspace Inter",
              weight: 700,
              style: "normal",
              sha256: DEVELOPMENT_FONT_SHA256,
            },
          ],
  };
}

function rasterResource(
  workspaceId: string,
  id: string,
  bytes: Uint8Array,
): Extract<ResourceVersion, { kind: "raster-asset" }> {
  return {
    ...resourceBase(workspaceId, id, bytes),
    kind: "raster-asset",
    mediaType: "image/png",
    width: 1,
    height: 1,
  };
}

function fontResource(
  workspaceId: string,
  id: string,
  bytes: Uint8Array,
): Extract<ResourceVersion, { kind: "font" }> {
  return {
    ...resourceBase(workspaceId, id, bytes),
    kind: "font",
    mediaType: "font/ttf",
    family: "Workspace Inter",
    weight: 700,
    style: "normal",
  };
}

function addDeclaredRaster(
  store: MemoryResourceStore,
  id: string,
  overrides: {
    readonly byteSize?: number;
    readonly width?: number;
    readonly height?: number;
  } = {},
): DesignDocument["assets"][number] {
  const resource = {
    ...rasterResource("workspace-a", id, PNG),
    byteSize: overrides.byteSize ?? PNG.byteLength,
    width: overrides.width ?? 1,
    height: overrides.height ?? 1,
  };
  store.add(resource, PNG);
  return {
    id,
    mimeType: resource.mediaType,
    sha256: resource.contentHash,
    width: resource.width,
    height: resource.height,
    origin: { ...resource.origin },
  };
}

function resourceBase(workspaceId: string, id: string, bytes: Uint8Array) {
  return {
    id,
    workspaceId,
    contentHash: sha256(bytes),
    storageKey: `resource/${id}`,
    byteSize: bytes.byteLength,
    origin: {
      kind: "user-upload" as const,
      sourceName: "Resolver fixture",
    },
    license: { status: "owned" as const },
    scan: {
      status: "clean" as const,
      scannerName: "test",
      scannerVersion: "1",
      scannedAt: new Date("2026-07-31T00:00:00.000Z"),
    },
    createdBy: "user-a",
    createdAt: new Date("2026-07-31T00:00:00.000Z"),
  };
}
