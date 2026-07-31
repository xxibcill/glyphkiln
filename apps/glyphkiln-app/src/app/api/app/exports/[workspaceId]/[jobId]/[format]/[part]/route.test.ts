import { describe, expect, it, vi } from "vitest";

import type {
  AppResult,
  WorkspaceAuthorizationGrant,
  WorkspaceAuthorizationRequest,
} from "@/server/app-workflow";
import { InMemoryRenderQueue } from "@/server/render-queue";
import { InMemoryRenderBlobStorage } from "@/server/storage";

import { createExportDownloadRoute } from "./route";

const CREATED_AT = new Date("2026-07-31T01:00:00.000Z");

describe("GET /api/app/exports/:workspace/:job/:format/:part", () => {
  it("authorizes and streams only the workspace-qualified immutable blob", async () => {
    const queue = new InMemoryRenderQueue();
    const storage = new InMemoryRenderBlobStorage();
    const artifactBytes = new TextEncoder().encode("<svg/>");
    const manifestBytes = new TextEncoder().encode('{"manifest":"one"}\n');
    const artifact = await storage.put({
      workspaceId: "workspace-one",
      purpose: "render-output",
      mediaType: "image/svg+xml",
      bytes: artifactBytes,
    });
    const manifest = await storage.put({
      workspaceId: "workspace-one",
      purpose: "render-manifest",
      mediaType: "application/vnd.glyphkiln.manifest+json",
      bytes: manifestBytes,
    });
    await queue.enqueue({
      jobId: "job-one",
      workspaceId: "workspace-one",
      designId: "design-one",
      revisionId: "revision-one",
      requestedBy: "actor-one",
      idempotencyKey: "request-one",
      createdAt: CREATED_AT,
      manifestCreationTimestamp: CREATED_AT,
    });
    const claim = await queue.claim({
      workerId: "worker-one",
      now: CREATED_AT,
    });
    if (claim === undefined) throw new Error("Expected a render claim.");
    await queue.complete(
      claim,
      [
        {
          format: "svg",
          mimeType: "image/svg+xml",
          artifactKey: artifact.key,
          artifactSha256: artifact.sha256,
          artifactByteSize: artifact.byteSize,
          manifestKey: manifest.key,
          manifestSha256: manifest.sha256,
          manifestByteSize: manifest.byteSize,
          fingerprint: "svg-fingerprint",
        },
        {
          format: "png",
          mimeType: "image/png",
          artifactKey: `png-${artifact.key}`,
          artifactSha256: "a".repeat(64),
          artifactByteSize: 1,
          manifestKey: `png-${manifest.key}`,
          manifestSha256: "b".repeat(64),
          manifestByteSize: 1,
          fingerprint: "png-fingerprint",
        },
      ],
      CREATED_AT,
    );
    const route = createExportDownloadRoute({
      authorize: authorized,
      getQueue: () => Promise.resolve(queue),
      getStorage: () => Promise.resolve(storage),
    });

    const response = await route(
      request(),
      context({ format: "svg", part: "artifact" }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("<svg/>");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("content-disposition")).toContain(
      "glyphkiln-job-one.svg",
    );
    expect(response.headers.get("digest")).toMatch(/^sha-256=/);
  });

  it("does not inspect the queue when workspace authorization fails", async () => {
    const inspect = vi.fn();
    const route = createExportDownloadRoute({
      authorize: () =>
        Promise.resolve({
          ok: false,
          status: 404,
          error: {
            code: "RESOURCE_NOT_FOUND",
            title: "Unavailable",
            detail: "Unavailable",
          },
        }),
      getQueue: () =>
        Promise.resolve({
          inspect,
        } as never),
      getStorage: vi.fn(),
    });

    const response = await route(request(), context({}));

    expect(response.status).toBe(404);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("returns a conflict while an authorized immutable job is incomplete", async () => {
    const queue = new InMemoryRenderQueue();
    await queue.enqueue({
      jobId: "job-one",
      workspaceId: "workspace-one",
      designId: "design-one",
      revisionId: "revision-one",
      requestedBy: "actor-one",
      idempotencyKey: "request-one",
      createdAt: CREATED_AT,
      manifestCreationTimestamp: CREATED_AT,
    });
    const route = createExportDownloadRoute({
      authorize: authorized,
      getQueue: () => Promise.resolve(queue),
      getStorage: vi.fn(),
    });

    const response = await route(request(), context({}));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "EXPORT_NOT_READY" },
    });
  });
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

function request(): Request {
  return new Request(
    "http://localhost/api/app/exports/workspace-one/job-one/svg/artifact",
    { headers: { cookie: "gk_session=session" } },
  );
}

function context(
  overrides: Partial<{
    workspaceId: string;
    jobId: string;
    format: string;
    part: string;
  }>,
): {
  params: Promise<{
    workspaceId: string;
    jobId: string;
    format: string;
    part: string;
  }>;
} {
  return {
    params: Promise.resolve({
      workspaceId: "workspace-one",
      jobId: "job-one",
      format: "svg",
      part: "artifact",
      ...overrides,
    }),
  };
}
