// @vitest-environment jsdom

import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MANIFEST_VERSION,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  TYPOGRAPHY_POLICY,
  DELIVERY_PROFILE_REGISTRY,
  DELIVERY_SOURCES,
  hashCanonical,
} from "@glyphkiln/core";
import type { DesignDocument, RenderManifest } from "@glyphkiln/core";

import type { CampaignProposalRunProjection } from "@/server/app-workflow";
import type { PreviewSuccess } from "@/features/project-preview/types";
import { createPreviewDesign } from "@/test/preview-design";

import { createAppAlphaApi } from "./api-client";

describe("App Alpha API client", () => {
  afterEach(() => {
    document.cookie = "gk_csrf=; Max-Age=0; Path=/";
  });

  it("rejects a failure whose body status does not match HTTP status", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
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
      );
    });
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

  it("parses the server-owned campaign feature flag on workspace dashboards", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 200,
            value: dashboardFixture({ campaignWorkflow: false }),
          },
          200,
        ),
      ),
    );

    await expect(
      createAppAlphaApi(fetchMock).dashboard("workspace-1"),
    ).resolves.toMatchObject({
      ok: true,
      value: { features: { campaignWorkflow: false } },
    });
  });

  it("rejects a dashboard that omits the server-owned feature policy", async () => {
    const { features: _features, ...dashboard } = dashboardFixture({
      campaignWorkflow: false,
    });
    void _features;
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ ok: true, status: 200, value: dashboard }, 200)),
    );

    await expect(
      createAppAlphaApi(fetchMock).dashboard("workspace-1"),
    ).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "INVALID_APP_RESPONSE" },
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
    const seedRequest = fetchMock.mock.calls.at(0);
    if (seedRequest === undefined) throw new Error("Expected a seed request.");
    expect(JSON.parse(requestBody(seedRequest[1]?.body))).toEqual({
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
    const handoff = campaignHandoffFixture();
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
            value: handoff,
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
    const handoffResult = await api.campaignHandoff({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
    });
    expect(handoffResult).toMatchObject({
      ok: true,
      value: {
        fileCount: 1,
        unapprovedCanvasCount: 1,
      },
    });
    if (!handoffResult.ok) throw new Error("Expected a valid handoff.");
    expect(handoffResult.value.bytes).toBeInstanceOf(Uint8Array);
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
      directionId: "direction-1",
    });
  });

  it("requests a campaign canvas seed for an exact scope", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 200,
            value: campaignCanvasSeedFixture(),
          },
          200,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);

    await expect(
      api.campaignCanvasSeed({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        directionId: "direction-1",
        canvasKey: "hero-landscape",
        templateId: "image-led-campaign",
        format: "linkedin-landscape",
        compositionVariantId: "focal-editorial",
      }),
    ).resolves.toEqual({ ok: true, value: campaignCanvasSeedFixture() });
    expect(JSON.parse(requestBody(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: "campaign.canvas.seed",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      canvasKey: "hero-landscape",
      templateId: "image-led-campaign",
      format: "linkedin-landscape",
      compositionVariantId: "focal-editorial",
    });
  });

  it.each([
    ["workspace", { workspaceId: "workspace-other" }],
    ["campaign", { campaignId: "campaign-other" }],
    ["direction", { directionId: "direction-other" }],
    ["canvas", { canvasKey: "hero-square" }],
    ["template", { template: { id: "product-announcement", version: "1.1.1" } }],
    ["format", { format: "instagram-square" }],
    ["seed", { canvasSeed: "b".repeat(63) }],
    ["unknown field", { ignoredScope: "slide-2" }],
  ])(
    "rejects a campaign canvas seed with a mismatched %s",
    async (_name, overrides) => {
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              ok: true,
              status: 200,
              value: { ...campaignCanvasSeedFixture(), ...overrides },
            },
            200,
          ),
        ),
      );

      await expect(
        createAppAlphaApi(fetchMock).campaignCanvasSeed({
          workspaceId: "workspace-1",
          campaignId: "campaign-1",
          directionId: "direction-1",
          canvasKey: "hero-landscape",
          templateId: "image-led-campaign",
          format: "linkedin-landscape",
          compositionVariantId: "focal-editorial",
        }),
      ).resolves.toMatchObject({
        ok: false,
        status: 502,
        error: { code: "INVALID_APP_RESPONSE" },
      });
    },
  );

  it.each([
    ["campaign", { campaignId: "campaign-other" }],
    ["direction", { directionId: "direction-other" }],
    ["byte size", { byteSize: 1 }],
    ["archive hash", { sha256: "f".repeat(64) }],
    ["file count", { fileCount: 2 }],
  ])("rejects a campaign handoff with a mismatched %s", async (_name, overrides) => {
    document.cookie = "gk_csrf=csrf-token-123; Path=/";
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 200,
            value: campaignHandoffFixture(overrides),
          },
          200,
        ),
      ),
    );

    await expect(
      createAppAlphaApi(fetchMock).campaignHandoff({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        directionId: "direction-1",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "INVALID_APP_RESPONSE" },
    });
  });

  it("validates exact pre-handoff carousel review evidence", async () => {
    const document = createPreviewDesign();
    const rendered = carouselReviewProof(document);
    const canvas = {
      id: "canvas-1",
      canvasKey: "slide-01",
      designId: "design-1",
      revisionId: "revision-1",
      template: document.template,
      format: document.format,
      compositionVariantId: "focal-editorial" as const,
      narrativeRole: "hook" as const,
      deliveryProfileId: "instagram-native-carousel" as const,
      carouselSequenceKey: "launch-carousel",
      altText: "Opening launch slide with a product announcement.",
      sourceNotes: [{ label: "Launch brief", url: "https://example.com/launch-brief" }],
      seedDerivationVersion: "sha256/canonical-scope-v1",
      directionSeed: "a".repeat(64),
      canvasSeed: "b".repeat(64),
      ordinal: 0,
      createdAt: "2026-08-12T01:00:00.000Z",
    };
    const value = {
      kind: "campaign-carousel-review",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      directionKey: "editorial-a",
      sequenceKey: "launch-carousel",
      review: {
        version: "1.2.0",
        deliveryProfileId: "instagram-native-carousel",
        success: true,
        issues: [],
      },
      deliverySidecar: {
        version: "1.2.0",
        deliveryProfile: {
          id: "instagram-native-carousel",
          metadataVersion: "1.0.0",
          profile: DELIVERY_PROFILE_REGISTRY["instagram-native-carousel"],
          sources: [
            DELIVERY_SOURCES["glyphkiln-carousel-validation"],
            DELIVERY_SOURCES["instagram-creators-carousel-limit"],
            DELIVERY_SOURCES["meta-instagram-alt-text"],
            DELIVERY_SOURCES["meta-instagram-carousel"],
            DELIVERY_SOURCES["meta-instagram-photo-resolution"],
          ],
        },
        slides: [],
      },
      slides: [
        {
          canvas,
          documentHash: hashCanonical(document),
          proof: {
            document: rendered.document,
            qualityIssues: rendered.qualityIssues,
            evidence: rendered.evidence,
            outputs: rendered.outputs,
          },
        },
      ],
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ ok: true, status: 200, value }, 200)),
    );

    await expect(
      createAppAlphaApi(fetchMock).campaignCarouselReview({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        directionId: "direction-1",
        sequenceKey: "launch-carousel",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        review: { success: true },
        slides: [
          {
            canvas: {
              altText: "Opening launch slide with a product announcement.",
              sourceNotes: [{ label: "Launch brief" }],
            },
            proof: { ok: true, outputs: [{ format: "svg" }, { format: "png" }] },
          },
        ],
      },
    });

    value.deliverySidecar.deliveryProfile.sources = [];
    await expect(
      createAppAlphaApi(fetchMock).campaignCarouselReview({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        directionId: "direction-1",
        sequenceKey: "launch-carousel",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "INVALID_APP_RESPONSE" },
    });
  });

  it("rejects a proved proposal whose browser proof is incomplete", async () => {
    document.cookie = "gk_csrf=csrf-token-123; Path=/";
    const run = proposalRunFixture();
    run.candidates[0] = {
      id: "candidate-0",
      index: 0,
      status: "proved",
      document: createPreviewDesign(),
      canonicalHash: "c".repeat(64),
      issues: [],
      proof: {
        qualityIssues: [],
        evidence: {
          version: "1.1.0",
          safeArea: { x: 0, y: 0, width: 1, height: 1 },
          text: [],
          crops: [],
          contrast: [],
        },
        outputs: [],
      },
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 201,
            value: { kind: "campaign-proposals-created", run },
          },
          201,
        ),
      ),
    );

    await expect(
      createAppAlphaApi(fetchMock).requestCampaignProposals({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        directionId: "direction-1",
        baseCanvasId: "canvas-1",
        candidateCount: 3,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "INVALID_APP_RESPONSE" },
    });
  });
});

function carouselReviewProof(document: DesignDocument): PreviewSuccess {
  const documentHash = hashCanonical(document);
  const fingerprint = "a".repeat(64);
  const sharedManifest: Omit<RenderManifest, "output" | "renderingMethod"> = {
    manifestVersion: MANIFEST_VERSION,
    renderId: `render_${fingerprint.slice(0, 24)}`,
    renderFingerprint: fingerprint,
    designDocumentId: document.id,
    designDocumentHash: documentHash,
    seed: document.seed,
    template: document.template,
    renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
    typographyPolicy: TYPOGRAPHY_POLICY,
    proceduralAlgorithmVersions: { "layered-waves": "1.1.0" },
    assets: [],
    fonts: document.fonts.map((font) => ({
      family: font.family,
      weight: font.weight,
      style: font.style,
      sha256: font.sha256 ?? "d".repeat(64),
    })),
    dimensions: { width: 1_200, height: 627 },
    creationTimestamp: "2026-08-12T01:00:00.000Z",
    compositionGenerativeImageModelUsed: false,
    includedGenerativeAssetUsed: false,
    qualityIssues: [],
    productClaim: PRODUCT_CLAIM,
  };
  const outputs = (["svg", "png"] as const).map((format) => {
    const bytes = new TextEncoder().encode(`${format}-review-proof`);
    return {
      format,
      mimeType: format === "svg" ? ("image/svg+xml" as const) : ("image/png" as const),
      base64: bytesToBase64(bytes),
      byteSize: bytes.byteLength,
      fingerprint,
      filename: `${document.id}.${format}`,
      manifest: {
        ...sharedManifest,
        output: { format, sha256: sha256(bytes), byteSize: bytes.byteLength },
        renderingMethod:
          format === "svg"
            ? ("deterministic-code-rendering/direct-svg" as const)
            : ("deterministic-code-rendering/resvg" as const),
      },
    };
  });
  return {
    ok: true,
    document,
    qualityIssues: [],
    evidence: {
      version: "1.1.0",
      safeArea: { x: 84, y: 44, width: 1_032, height: 539 },
      text: [],
      crops: [],
      contrast: [],
    },
    outputs,
  };
}

function campaignHandoffFixture(
  overrides: Partial<{
    campaignId: string;
    directionId: string;
    byteSize: number;
    sha256: string;
    fileCount: number;
  }> = {},
) {
  const fileBytes = new TextEncoder().encode("{}\n");
  const file = {
    path: "campaign/canvas.approval.json",
    mediaType: "application/json",
    byteSize: fileBytes.byteLength,
    sha256: sha256(fileBytes),
    base64: bytesToBase64(fileBytes),
    approvalStatus: "unapproved" as const,
  };
  const archiveBytes = new TextEncoder().encode(
    `${JSON.stringify({
      version: "1.0.0",
      campaign: {
        id: "campaign-1",
        name: "First firing",
        brief: "Launch one admitted image across a coordinated campaign family.",
        campaignSeed: "first-firing-2026",
        familyId: "image-led-campaign",
        createdAt: "2026-08-12T01:00:00.000Z",
        updatedAt: "2026-08-12T01:00:00.000Z",
      },
      directionId: "direction-1",
      files: [file],
      summary: { approvedCanvasCount: 0, unapprovedCanvasCount: 1 },
    })}\n`,
  );
  return {
    kind: "campaign-handoff" as const,
    campaignId: "campaign-1",
    directionId: "direction-1",
    filename: "campaign-1-direction-1.gk-handoff.json",
    mediaType: "application/vnd.glyphkiln.campaign-handoff+json" as const,
    byteSize: archiveBytes.byteLength,
    sha256: sha256(archiveBytes),
    base64: bytesToBase64(archiveBytes),
    fileCount: 1,
    approvedCanvasCount: 0,
    unapprovedCanvasCount: 1,
    ...overrides,
  };
}

function dashboardFixture(features: { campaignWorkflow: boolean }) {
  return {
    kind: "workspace-dashboard" as const,
    workspace: {
      id: "workspace-1",
      name: "Foundry Studio",
      slug: "foundry-studio",
      role: "owner" as const,
    },
    brandKits: [],
    designs: [],
    campaigns: [],
    features,
  };
}

function campaignCanvasSeedFixture() {
  return {
    kind: "campaign-canvas-seed" as const,
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    directionId: "direction-1",
    canvasKey: "hero-landscape",
    template: { id: "image-led-campaign" as const, version: "1.0.1" },
    format: "linkedin-landscape" as const,
    compositionVariantId: "focal-editorial" as const,
    seedDerivationVersion: "sha256/canonical-scope-v1",
    directionSeed: "a".repeat(64),
    canvasSeed: "b".repeat(64),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function proposalRunFixture(): CampaignProposalRunProjection {
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
