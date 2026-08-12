import { describe, expect, it, vi } from "vitest";

import type {
  AppResult,
  WorkspaceAuthorizationGrant,
  WorkspaceAuthorizationRequest,
} from "@/server/app-workflow";
import {
  ResourceIngestionError,
  type AdmittedResourceIngestion,
  type ResourceIngestionService,
} from "@/server/resources";

import { createResourceRoute } from "./route";

const ENDPOINT = "http://localhost/api/app/resources";

describe("POST /api/app/resources", () => {
  it("rejects a cross-origin upload before resolving authorization", async () => {
    const authorize =
      vi.fn<
        (
          input: WorkspaceAuthorizationRequest,
        ) => Promise<AppResult<WorkspaceAuthorizationGrant>>
      >();
    const route = createResourceRoute({
      authorize,
      getIngestion: vi.fn(),
      environment: { NODE_ENV: "test" },
    });

    const response = await route(
      uploadRequest({
        metadata: rasterMetadata(),
        origin: "https://attacker.example",
      }),
    );

    expect(response.status).toBe(403);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("authenticates and authorizes the workspace before reading or scanning bytes", async () => {
    const authorize = vi.fn(() =>
      Promise.resolve<AppResult<WorkspaceAuthorizationGrant>>({
        ok: false,
        status: 404,
        error: {
          code: "RESOURCE_NOT_FOUND",
          title: "Resource not found",
          detail: "Not found.",
        },
      }),
    );
    const getIngestion = vi.fn();
    const route = createResourceRoute({
      authorize,
      getIngestion,
      environment: { NODE_ENV: "test" },
    });

    const response = await route(uploadRequest({ metadata: rasterMetadata() }));

    expect(response.status).toBe(404);
    expect(authorize).toHaveBeenCalledWith({
      evidence: { sessionToken: "session", csrfToken: "csrf" },
      workspaceId: "workspace-one",
      action: "ingest_resources",
      requireMutationProof: true,
    });
    expect(getIngestion).not.toHaveBeenCalled();
  });

  it("admits an authorized raster without exposing its storage key or scan internals", async () => {
    let admissionActive = false;
    const ingestRaster = vi.fn(
      (input: unknown): ReturnType<ResourceIngestionService["ingestRaster"]> => {
        void input;
        return Promise.resolve({
          duplicate: false,
          ingestionId: "ingestion-one",
          resource: {
            id: "resource-one",
            workspaceId: "workspace-one",
            kind: "raster-asset",
            contentHash: "a".repeat(64),
            storageKey: "private/object/key",
            mediaType: "image/png",
            byteSize: 8,
            width: 1,
            height: 1,
            colorNormalization: {
              policyVersion: "canonical-srgb-png-v1",
              sourceContentHash: "b".repeat(64),
              sourceMediaType: "image/png",
              outputContentHash: "a".repeat(64),
            },
            origin: { kind: "user-upload" },
            license: { status: "owned" },
            scan: {
              status: "clean",
              scannerName: "scanner",
              scannerVersion: "secret-topology",
              scannedAt: new Date("2026-07-31T01:00:00.000Z"),
            },
            createdBy: "actor-one",
            createdAt: new Date("2026-07-31T01:00:00.000Z"),
          },
        });
      },
    );
    const route = createResourceRoute({
      authorize: authorized,
      getIngestion: () =>
        Promise.resolve({
          async runAdmitted<Result>(
            workspaceId: string,
            operation: (ingestion: AdmittedResourceIngestion) => Promise<Result>,
          ): Promise<Result> {
            expect(workspaceId).toBe("workspace-one");
            admissionActive = true;
            try {
              return await operation({
                ingestRaster: async (input) => {
                  expect(admissionActive).toBe(true);
                  return ingestRaster(input);
                },
                ingestFont: vi.fn(),
              });
            } finally {
              admissionActive = false;
            }
          },
        }),
      environment: { NODE_ENV: "test" },
    });

    const request = uploadRequest({
      metadata: { ...rasterMetadata(), normalizeColor: true },
    });
    const requestBody = request.body;
    Object.defineProperty(request, "body", {
      configurable: true,
      get() {
        expect(admissionActive).toBe(true);
        return requestBody;
      },
    });
    const response = await route(request);
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(admissionActive).toBe(false);
    expect(ingestRaster).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-one",
        actorUserId: "actor-one",
        declaredMediaType: "image/png",
        normalizeColor: true,
        bytes: expect.any(Uint8Array) as unknown,
      }),
    );
    expect(text).not.toContain("private/object/key");
    expect(text).not.toContain("secret-topology");
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      value: {
        kind: "resource-admitted",
        resourceId: "resource-one",
        resourceKind: "raster-asset",
        width: 1,
        height: 1,
        colorNormalization: {
          policyVersion: "canonical-srgb-png-v1",
          sourceContentHash: "b".repeat(64),
          sourceMediaType: "image/png",
          outputContentHash: "a".repeat(64),
        },
      },
    });
  });

  it("rejects active SVG and kind/media mismatches", async () => {
    const route = createResourceRoute({
      authorize: authorized,
      getIngestion: () =>
        Promise.resolve(
          admittedService({
            ingestRaster: vi.fn(),
            ingestFont: vi.fn(),
          }),
        ),
      environment: { NODE_ENV: "test" },
    });
    const svg = await route(
      uploadRequest({
        metadata: rasterMetadata(),
        mediaType: "image/svg+xml",
      }),
    );
    const mismatch = await route(
      uploadRequest({
        metadata: rasterMetadata(),
        mediaType: "font/ttf",
      }),
    );

    expect(svg.status).toBe(415);
    await expect(svg.json()).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
    expect(mismatch.status).toBe(415);
    await expect(mismatch.json()).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_RESOURCE_MEDIA_TYPE" },
    });
  });

  it("rejects raster-only normalization intent on a font upload", async () => {
    const authorize = vi.fn<typeof authorized>();
    const route = createResourceRoute({
      authorize,
      getIngestion: vi.fn(),
      environment: { NODE_ENV: "test" },
    });

    const response = await route(
      uploadRequest({
        metadata: {
          kind: "font",
          workspaceId: "workspace-one",
          originalFilename: "font.ttf",
          origin: { kind: "user-upload" },
          license: { status: "owned" },
          family: "Fixture Sans",
          weight: 400,
          style: "normal",
          normalizeColor: true,
        },
        mediaType: "font/ttf",
      }),
    );

    expect(response.status).toBe(422);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("fails closed when the host scanner is unavailable", async () => {
    const route = createResourceRoute({
      authorize: authorized,
      getIngestion: () =>
        Promise.resolve(
          admittedService({
            ingestRaster: () =>
              Promise.reject(
                new ResourceIngestionError(
                  "scanner unavailable",
                  "SCANNER_UNAVAILABLE",
                ),
              ),
            ingestFont: vi.fn(),
          }),
        ),
      environment: { NODE_ENV: "test" },
    });

    const response = await route(uploadRequest({ metadata: rasterMetadata() }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SCANNER_UNAVAILABLE" },
    });
  });

  it("returns no-wait capacity before touching the request body", async () => {
    const runAdmitted = vi.fn(() =>
      Promise.reject(new ResourceIngestionError("busy", "RESOURCE_CAPACITY_REACHED")),
    );
    const route = createResourceRoute({
      authorize: authorized,
      getIngestion: () => Promise.resolve({ runAdmitted }),
      environment: { NODE_ENV: "test" },
    });
    const request = uploadRequest({ metadata: rasterMetadata() });
    const requestBody = request.body;
    let bodyAccesses = 0;
    Object.defineProperty(request, "body", {
      configurable: true,
      get() {
        bodyAccesses += 1;
        return requestBody;
      },
    });

    const response = await route(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(runAdmitted).toHaveBeenCalledWith("workspace-one", expect.any(Function));
    expect(bodyAccesses).toBe(0);
  });

  it.each([
    ["RESOURCE_CAPACITY_REACHED", 429, "1"],
    ["RESOURCE_QUOTA_EXCEEDED", 409, null],
  ] as const)(
    "maps %s without exposing scanner or storage details",
    async (code, expectedStatus, retryAfter) => {
      const route = createResourceRoute({
        authorize: authorized,
        getIngestion: () =>
          Promise.resolve(
            admittedService({
              ingestRaster: () =>
                Promise.reject(new ResourceIngestionError("internal", code)),
              ingestFont: vi.fn(),
            }),
          ),
        environment: { NODE_ENV: "test" },
      });

      const response = await route(uploadRequest({ metadata: rasterMetadata() }));
      const text = await response.text();

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("retry-after")).toBe(retryAfter);
      expect(text).not.toContain("internal");
      expect(JSON.parse(text)).toMatchObject({ error: { code } });
    },
  );
});

function authorized(
  input: WorkspaceAuthorizationRequest,
): Promise<AppResult<WorkspaceAuthorizationGrant>> {
  return Promise.resolve({
    ok: true,
    status: 200,
    value: {
      kind: "workspace-authorized",
      user: {
        id: "actor-one",
        email: "owner@example.com",
        displayName: "Owner",
      },
      workspace: {
        id: input.workspaceId,
        name: "Workspace",
        slug: "workspace",
        role: "owner",
      },
    },
  });
}

function rasterMetadata(): Record<string, unknown> {
  return {
    kind: "raster-asset",
    workspaceId: "workspace-one",
    originalFilename: "mark.png",
    origin: { kind: "user-upload" },
    license: { status: "owned" },
  };
}

function uploadRequest(input: {
  metadata: Record<string, unknown>;
  origin?: string;
  mediaType?: string;
}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      origin: input.origin ?? "http://localhost",
      "sec-fetch-site": "same-origin",
      "content-type": input.mediaType ?? "image/png",
      cookie: "gk_session=session; gk_csrf=csrf",
      "x-glyphkiln-csrf": "csrf",
      "x-glyphkiln-resource": Buffer.from(
        JSON.stringify(input.metadata),
        "utf8",
      ).toString("base64url"),
    },
    body: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
}

function admittedService(
  ingestion: AdmittedResourceIngestion,
): Pick<ResourceIngestionService, "runAdmitted"> {
  return {
    runAdmitted<Result>(
      _workspaceId: string,
      operation: (admitted: AdmittedResourceIngestion) => Promise<Result>,
    ): Promise<Result> {
      return operation(ingestion);
    },
  };
}
