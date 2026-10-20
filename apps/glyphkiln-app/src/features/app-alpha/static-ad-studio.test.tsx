// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialPreviewForm } from "@/features/project-preview/document-builder";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import {
  MANIFEST_VERSION,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  TYPOGRAPHY_POLICY,
  hashCanonical,
} from "@glyphkiln/core";
import type { PreviewSuccess } from "@/features/project-preview/types";
import { createPreviewDesign } from "@/test/preview-design";
import { StaticAdStudio } from "./static-ad-studio";
import { StaticAdReviewBoard } from "./static-ad-review-board";
import {
  createAppAlphaApi,
  type AppAlphaApi,
  type CampaignBoard,
  type RevisionReview,
  type RenderJob,
} from "./api-client";
const catalog = createPreviewCatalog();
const campaign = {
  id: "campaign-1",
  name: "Launch",
  brief: "Launch brief",
  campaignSeed: "launch",
  familyId: "static-ads" as const,
  createdAt: "2026-09-25",
  updatedAt: "2026-09-25",
};
const board: CampaignBoard = {
  kind: "campaign-board",
  campaign,
  directions: [
    {
      id: "direction-1",
      directionKey: "static-ads",
      name: "Ads",
      locks: [],
      createdAt: campaign.createdAt,
      proposalRuns: [],
      proposalRunsTruncated: false,
      canvases: [
        {
          id: "canvas-1",
          canvasKey: "product-square",
          designId: "design-1",
          revisionId: "revision-1",
          template: { id: "product-announcement", version: "1.2.0" },
          format: "instagram-square",
          compositionVariantId: "static-ad",
          narrativeRole: "action",
          ordinal: 0,
          seedDerivationVersion: "sha256/canonical-scope-v1",
          canvasSeed: "a".repeat(64),
          directionSeed: "b".repeat(64),
          createdAt: campaign.createdAt,
        },
      ],
    },
  ],
};
const missing = {
  ok: false as const,
  status: 404,
  error: { code: "RESOURCE_NOT_FOUND" as const, title: "Missing", detail: "Missing" },
};
describe("static ad campaign UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  async function click(text: string): Promise<void> {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === text,
    );
    expect(button).toBeDefined();
    await act(async () => {
      await Promise.resolve();
      if (button === undefined) throw new Error("Button missing");
      button.click();
    });
  }
  it("creates selected variants from explicit copy and the saved brand", async () => {
    const createStaticAdCampaign = vi.fn<AppAlphaApi["createStaticAdCampaign"]>(() =>
      Promise.resolve({ ok: true as const, value: campaign }),
    );
    const api = {
      ...createAppAlphaApi(),
      createStaticAdCampaign,
      campaignBoard: vi.fn(() => Promise.resolve({ ok: true as const, value: board })),
    };
    await act(async () => {
      await Promise.resolve();
      root.render(
        <StaticAdStudio
          api={api}
          workspaceId="workspace-1"
          brandSnapshotId="brand-1"
          campaigns={[]}
          formState={createInitialPreviewForm(catalog)}
          catalog={catalog}
          canEdit
          canApprove
          onChanged={() => Promise.resolve()}
          onOpenDesign={() => Promise.resolve()}
        />,
      );
    });
    const form = container.querySelector("form");
    if (form === null) throw new Error("Form missing");
    for (const [name, value] of Object.entries({
      campaignName: "Launch",
      brief: "Launch brief",
      headline: "Your product",
      benefits: "One verified benefit",
    }))
      (form.elements.namedItem(name) as HTMLInputElement).value = value;
    await act(async () => {
      await Promise.resolve();
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(createStaticAdCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        brandSnapshotId: "brand-1",
      }),
    );
    expect(createStaticAdCampaign.mock.calls[0]?.[0]?.drafts).toHaveLength(4);
    expect(container.textContent).toContain("Saved 4 ads");
  });
  it("surfaces validation failures and hides create controls from viewers", async () => {
    const createStaticAdCampaign = vi.fn<AppAlphaApi["createStaticAdCampaign"]>();
    const api = { ...createAppAlphaApi(), createStaticAdCampaign };
    const props = {
      api,
      workspaceId: "workspace-1",
      brandSnapshotId: "brand-1",
      campaigns: [],
      formState: createInitialPreviewForm(catalog),
      catalog,
      canApprove: false,
      onChanged: () => Promise.resolve(),
      onOpenDesign: () => Promise.resolve(),
    };
    await act(async () => {
      await Promise.resolve();
      root.render(<StaticAdStudio {...props} canEdit />);
    });
    await act(async () => {
      await Promise.resolve();
      const form = container.querySelector("form");
      if (form === null) throw new Error("Form missing");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("Main promise is required");
    expect(createStaticAdCampaign).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      root.render(<StaticAdStudio {...props} canEdit={false} />);
    });
    expect(container.querySelector("form")).toBeNull();
  });
  it("requires a viewed proof and completed job before batch approval, and requests approved-only downloads", async () => {
    const proof = proofFixture();
    const onOpenDesign = vi.fn(() => Promise.resolve());
    const job: RenderJob = {
      kind: "render-job",
      jobId: "job-1",
      workspaceId: "workspace-1",
      designId: "design-1",
      revisionId: "revision-1",
      state: "completed",
      attemptCount: 1,
      maxAttempts: 3,
      createdAt: campaign.createdAt,
      updatedAt: campaign.createdAt,
      outputs: proof.outputs.map((output) => ({
        format: output.format,
        mimeType: output.mimeType,
        artifactSha256: output.manifest.output.sha256,
        artifactByteSize: output.byteSize,
        manifestSha256: "b".repeat(64),
        manifestByteSize: 10,
        fingerprint: output.fingerprint,
      })),
    };
    const review: RevisionReview = {
      kind: "revision-review",
      id: "review-1",
      workspaceId: "workspace-1",
      designId: "design-1",
      revisionId: "revision-1",
      state: "approved",
      comments: [],
      transitions: [],
      startedAt: campaign.createdAt,
      startedBy: { id: "owner", email: "owner@example.com", displayName: "Owner" },
      updatedBy: { id: "owner", email: "owner@example.com", displayName: "Owner" },
      updatedAt: campaign.createdAt,
    };
    const approveRevision = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: review }),
    );
    const campaignHandoff = vi.fn(() => Promise.resolve(missing));
    const api = {
      ...createAppAlphaApi(),
      campaignBoard: vi.fn(() => Promise.resolve({ ok: true as const, value: board })),
      revisionReview: () => Promise.resolve(missing),
      completedRenderJobs: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: [job] }),
      ),
      renderRevision: vi.fn(() => Promise.resolve({ ok: true as const, value: proof })),
      submitRevisionReview: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: review }),
      ),
      approveRevision,
      campaignHandoff,
      requestRevisionExport: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            kind: "render-job-queued" as const,
            jobId: "job-1",
            workspaceId: "workspace-1",
            state: "queued" as const,
            created: true,
          },
        }),
      ),
    };
    await act(async () => {
      await Promise.resolve();
      root.render(
        <StaticAdReviewBoard
          api={api}
          workspaceId="workspace-1"
          campaignId="campaign-1"
          canEdit
          canApprove
          onOpenDesign={onOpenDesign}
        />,
      );
    });
    await click("Select all");
    await click("Approve selected proofs");
    expect(approveRevision).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Check this proof");
    api.renderRevision.mockResolvedValueOnce({
      ok: true,
      value: { ...proof, document: { ...proof.document, id: "wrong-design" } },
    });
    await click("Check / refresh selected proofs");
    expect(container.textContent).toContain("does not match this saved canvas");
    await click("Check / refresh selected proofs");
    expect(container.textContent).toContain("1 placement warnings");
    await click("Queue selected exports");
    expect(api.requestRevisionExport).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "static-ad:revision-1" }),
    );
    api.completedRenderJobs.mockResolvedValueOnce({
      ok: true,
      value: [
        {
          ...job,
          outputs: job.outputs.map((output) => ({
            ...output,
            artifactSha256: "c".repeat(64),
          })),
        },
      ],
    });
    await click("Approve selected proofs");
    expect(approveRevision).not.toHaveBeenCalled();
    expect(container.textContent).toContain("differs from the viewed proof");
    await click("Approve selected proofs");
    expect(approveRevision).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      designId: "design-1",
      revisionId: "revision-1",
      renderJobId: "job-1",
    });
    await click("Open in editor");
    expect(onOpenDesign).toHaveBeenCalledWith("design-1", "revision-1");
    await click("Reload campaign");
    expect(api.campaignBoard).toHaveBeenCalledTimes(2);
    await click("Download all approved ads");
    expect(campaignHandoff).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      approvedOnly: true,
    });
  });
});

function proofFixture(): PreviewSuccess {
  const document = createPreviewDesign();
  document.id = "design-1";
  document.seed = "a".repeat(64);
  document.format = "instagram-square";
  document.template = { id: "product-announcement", version: "1.2.0" };
  return {
    ok: true,
    document,
    qualityIssues: [],
    evidence: {
      version: "1.1.0",
      safeArea: { x: 0, y: 0, width: 1080, height: 1080 },
      text: [],
      crops: [],
      contrast: [],
    },
    outputs: (["png", "svg"] as const).map((format) => ({
      format,
      mimeType: format === "png" ? "image/png" : "image/svg+xml",
      base64: "cHJvb2Y=",
      byteSize: 5,
      filename: `proof.${format}`,
      fingerprint: "f".repeat(64),
      manifest: {
        manifestVersion: MANIFEST_VERSION,
        renderId: "render-proof",
        renderFingerprint: "f".repeat(64),
        designDocumentId: document.id,
        designDocumentHash: hashCanonical(document),
        seed: document.seed,
        template: document.template,
        renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
        typographyPolicy: TYPOGRAPHY_POLICY,
        proceduralAlgorithmVersions: {},
        assets: [],
        fonts: [],
        dimensions: { width: 1080, height: 1080 },
        output: { format, sha256: "a".repeat(64), byteSize: 5 },
        creationTimestamp: "2026-09-25T00:00:00.000Z",
        compositionGenerativeImageModelUsed: false,
        includedGenerativeAssetUsed: false,
        renderingMethod:
          format === "png"
            ? "deterministic-code-rendering/resvg"
            : "deterministic-code-rendering/direct-svg",
        qualityIssues: [],
        productClaim: PRODUCT_CLAIM,
      },
    })),
  };
}
