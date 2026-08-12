// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppAlphaApi } from "./api-client";

describe("App Alpha API client", () => {
  afterEach(() => {
    document.cookie = "gk_csrf=; Max-Age=0; Path=/";
  });

  it("rejects a failure whose body status does not match HTTP status", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: false,
            status: 401,
            error: {
              code: "AUTH_REQUIRED",
              title: "Authentication required",
              detail: "Sign in.",
            },
          },
          403,
        ),
      ),
    );
    const api = createAppAlphaApi(fetchMock);

    await expect(api.currentSession()).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "INVALID_APP_RESPONSE" },
    });
  });

  it("preserves structured validation problems from an aligned failure", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: false,
            status: 422,
            error: {
              code: "INVALID_INPUT",
              title: "Request needs attention",
              detail: "Review the command.",
              problems: [{ path: "name", code: "too_small", message: "Required" }],
            },
          },
          422,
        ),
      ),
    );
    const api = createAppAlphaApi(fetchMock);

    await expect(api.createWorkspace("")).resolves.toMatchObject({
      ok: false,
      error: {
        problems: [{ path: "name", code: "too_small", message: "Required" }],
      },
    });
  });

  it("sends the operator bootstrap token only in the first-run command", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 201,
            value: {
              kind: "session-granted",
              user: {
                id: "owner-1",
                email: "owner@example.test",
                displayName: "Owner",
              },
              workspaces: [],
              expiresAt: "2026-08-30T01:00:00.000Z",
            },
          },
          201,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);
    const bootstrapToken = "operator-bootstrap-token-for-client-test";

    await expect(
      api.bootstrap({
        bootstrapToken,
        displayName: "Owner",
        email: "owner@example.test",
        password: "correct horse battery staple",
        workspaceName: "Kiln Studio",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        type: "bootstrap.register",
        bootstrapToken,
        displayName: "Owner",
        email: "owner@example.test",
        password: "correct horse battery staple",
        workspaceName: "Kiln Studio",
      }),
    );
  });

  it("sends a matching CSRF header for mutation commands without exposing the session", async () => {
    document.cookie = "gk_csrf=csrf-token-123; Path=/";
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 201,
            value: {
              kind: "workspace-created",
              workspace: {
                id: "workspace-2",
                name: "Second workshop",
                slug: "second-workshop",
                role: "owner",
              },
            },
          },
          201,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);

    await expect(api.createWorkspace("Second workshop")).resolves.toMatchObject({
      ok: true,
      value: { id: "workspace-2" },
    });
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-glyphkiln-csrf")).toBe("csrf-token-123");
    expect(init?.body).toBe(
      JSON.stringify({ type: "workspace.create", name: "Second workshop" }),
    );
    expect(init?.body).not.toContain("session");
  });

  it("requests and inspects a durable revision export through the typed client", async () => {
    document.cookie = "gk_csrf=csrf-token-123; Path=/";
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "revision.export.request") {
        return Promise.resolve(
          jsonResponse(
            {
              ok: true,
              status: 201,
              value: {
                kind: "render-job-queued",
                jobId: "job-1",
                workspaceId: "workspace-1",
                state: "queued",
                created: true,
              },
            },
            201,
          ),
        );
      }
      expect(input).toBe("/api/app/queries");
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 200,
            value: {
              kind: "render-job",
              jobId: "job-1",
              workspaceId: "workspace-1",
              designId: "design-1",
              revisionId: "revision-1",
              state: "completed",
              attemptCount: 1,
              maxAttempts: 3,
              createdAt: "2026-07-31T01:00:00.000Z",
              updatedAt: "2026-07-31T01:00:01.000Z",
              finishedAt: "2026-07-31T01:00:01.000Z",
              outputs: [
                {
                  format: "svg",
                  mimeType: "image/svg+xml",
                  artifactSha256: "a".repeat(64),
                  artifactByteSize: 100,
                  manifestSha256: "b".repeat(64),
                  manifestByteSize: 200,
                  fingerprint: "render-fingerprint",
                },
              ],
            },
          },
          200,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);

    await expect(
      api.requestRevisionExport({
        workspaceId: "workspace-1",
        designId: "design-1",
        revisionId: "revision-1",
        idempotencyKey: "export-request-1",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { jobId: "job-1", state: "queued" },
    });
    await expect(api.renderJob("workspace-1", "job-1")).resolves.toMatchObject({
      ok: true,
      value: {
        state: "completed",
        outputs: [{ format: "svg", artifactByteSize: 100 }],
      },
    });
    expect(JSON.parse(requestBody(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: "revision.export.request",
      workspaceId: "workspace-1",
      designId: "design-1",
      revisionId: "revision-1",
      idempotencyKey: "export-request-1",
    });
    expect(JSON.parse(requestBody(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      type: "render.job",
      workspaceId: "workspace-1",
      jobId: "job-1",
    });
  });

  it("lists completed exports for an exact saved revision", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(requestBody(init?.body))).toEqual({
        type: "render.jobs.completed",
        workspaceId: "workspace-1",
        revisionId: "revision-1",
      });
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 200,
            value: {
              kind: "completed-render-jobs",
              jobs: [
                {
                  kind: "render-job",
                  jobId: "job-1",
                  workspaceId: "workspace-1",
                  designId: "design-1",
                  revisionId: "revision-1",
                  state: "completed",
                  attemptCount: 1,
                  maxAttempts: 3,
                  createdAt: "2026-07-31T01:00:00.000Z",
                  updatedAt: "2026-07-31T01:00:01.000Z",
                  finishedAt: "2026-07-31T01:00:01.000Z",
                  outputs: [],
                },
              ],
            },
          },
          200,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);

    await expect(
      api.completedRenderJobs("workspace-1", "revision-1"),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ jobId: "job-1", state: "completed" }],
    });
  });

  it("parses selectable workspace resources without accepting storage fields", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(requestBody(init?.body))).toEqual({
        type: "workspace.resources",
        workspaceId: "workspace-1",
      });
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 200,
            value: {
              kind: "workspace-resources",
              workspaceId: "workspace-1",
              truncated: false,
              resources: [
                {
                  id: "image-1",
                  kind: "raster-asset",
                  mediaType: "image/png",
                  contentHash: "a".repeat(64),
                  byteSize: 42,
                  width: 1_200,
                  height: 800,
                  origin: { kind: "user-upload" },
                  license: { status: "owned" },
                  createdAt: "2026-08-12T01:00:00.000Z",
                },
              ],
            },
          },
          200,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);

    await expect(api.resources("workspace-1")).resolves.toMatchObject({
      ok: true,
      value: {
        truncated: false,
        resources: [{ id: "image-1", width: 1_200, height: 800 }],
      },
    });
  });

  it("keeps proposal requests bounded and parses a deterministic handoff receipt", async () => {
    document.cookie = "gk_csrf=csrf-token-123; Path=/";
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "campaign.proposals.request") {
        return Promise.resolve(
          jsonResponse(
            {
              ok: true,
              status: 201,
              value: {
                kind: "campaign-proposals-created",
                run: proposalRunFixture(),
              },
            },
            201,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 200,
            value: {
              kind: "campaign-handoff",
              campaignId: "campaign-1",
              filename: "campaign-1.gk-handoff.json",
              mediaType: "application/vnd.glyphkiln.campaign-handoff+json",
              byteSize: 128,
              sha256: "d".repeat(64),
              base64: "eyJ2ZXJzaW9uIjoiMS4wLjAifQo=",
              fileCount: 7,
              approvedCanvasCount: 0,
              unapprovedCanvasCount: 1,
            },
          },
          200,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);

    await expect(
      api.requestCampaignProposals({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        directionId: "direction-1",
        baseCanvasId: "canvas-1",
        candidateCount: 3,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        candidates: [
          { index: 0, status: "rejected" },
          { index: 1, status: "rejected" },
          { index: 2, status: "rejected" },
        ],
      },
    });
    await expect(
      api.campaignHandoff("workspace-1", "campaign-1"),
    ).resolves.toMatchObject({
      ok: true,
      value: { fileCount: 7, unapprovedCanvasCount: 1 },
    });
    expect(JSON.parse(requestBody(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: "campaign.proposals.request",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      baseCanvasId: "canvas-1",
      candidateCount: 3,
    });
    expect(JSON.parse(requestBody(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      type: "campaign.handoff",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
    });
  });
});

function proposalRunFixture() {
  return {
    kind: "campaign-proposal-run",
    id: "run-1",
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    directionId: "direction-1",
    baseCanvasId: "canvas-1",
    baseDesignId: "design-1",
    baseRevisionId: "revision-1",
    descriptor: {
      providerId: "provider-1",
      modelId: "model-1",
      retentionDisclosure: "Bounded provider disclosure.",
    },
    inputHash: "a".repeat(64),
    responseHash: "b".repeat(64),
    locks: ["copy"],
    createdAt: "2026-08-12T01:00:00.000Z",
    candidates: Array.from({ length: 3 }, (_, index) => ({
      id: `candidate-${index.toString()}`,
      index,
      status: "rejected",
      issues: [
        {
          code: "RESOURCE_BACKED_PROOF_FAILED",
          message: "The candidate did not cross the Core proof boundary.",
          candidateIndex: index,
        },
      ],
    })),
  };
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return body;
}
