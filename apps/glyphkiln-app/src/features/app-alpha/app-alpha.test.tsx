// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hashCanonical,
  MANIFEST_VERSION,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
} from "@glyphkiln/core";
import type { BrandSnapshot, DesignDocument, RenderManifest } from "@glyphkiln/core";

import { createInitialPreviewForm } from "@/features/project-preview/document-builder";
import type { PreviewSuccess } from "@/features/project-preview/types";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { constructManualDocument } from "@/server/app-workflow/document-factory";

import { AppAlpha } from "./app-alpha";
import type { ApiFailure, AppAlphaApi, DesignRevision } from "./api-client";
import { buildBrandSnapshotDraft } from "./manual-state";

vi.mock("@/features/project-preview/response-parser", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/project-preview/response-parser")>();
  return {
    ...actual,
    previewIntegrityPrerequisiteFailure: () => null,
    verifyPreviewIntegrity: () => Promise.resolve(null),
  };
});

const catalog = createPreviewCatalog();
const brand = createPublishedBrand();

describe("AppAlpha", () => {
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

  it("previews without saving, saves and reopens, then renders exact revision exports", async () => {
    const api = createWorkflowApi();
    act(() => {
      root.render(<AppAlpha catalog={catalog} api={api} />);
    });

    await waitForText("Brand snapshot 1.0.0 loaded");
    expect(container.textContent).toContain("UNSAVED DRAFT");
    expect(container.textContent).toContain("Preview does not save this document");

    clickButton("Preview draft · does not save");
    await waitForText("Draft preview verified");

    expect(container.textContent).toContain("DRAFT PREVIEW");
    expect(container.textContent).toContain("validated but has not been saved");
    expect(api.createDesign).not.toHaveBeenCalled();

    clickButton("Save revision 1");
    await waitForText("saved and reopened from persistent storage");

    expect(api.createDesign).toHaveBeenCalledTimes(1);
    expect(api.revision).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      designId: "design-1",
      revision: { revisionId: "revision-1" },
    });
    expect(container.textContent).toContain("SAVED · NOT RENDERED");
    expect(container.textContent).not.toContain("Deliberate downloads");

    clickButton("Queue durable export");
    await waitForText("Durable export complete");
    expect(api.requestRevisionExport).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        designId: "design-1",
        revisionId: "revision-1",
      }),
    );
    expect(api.renderJob).toHaveBeenCalledWith("workspace-1", "render-job-1");
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="/api/app/exports/workspace-1/render-job-1/svg/artifact"]',
      )?.textContent,
    ).toBe("Download SVG");

    clickButton("Render saved revision");
    await waitForText("Exact revision 1 rendered");

    expect(container.textContent).toContain("SAVED REVISION");
    expect(container.textContent).toContain("Download SVG");
    expect(container.textContent).toContain("Download PNG");
    expect(api.renderRevision).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      designId: "design-1",
      revisionId: "revision-1",
    });

    setInput("#seed", "revision-two-seed");
    expect(container.textContent).toContain("Edits not rendered");
    clickButton("Preview draft · does not save");
    await waitForText("Draft preview verified");
    clickButton("Save child revision");
    await waitForText("Revision 2 saved and reopened");

    expect(api.reviseDesign).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        designId: "design-1",
        baseRevisionId: "revision-1",
        brandSnapshotId: "snapshot-record-1",
      }),
    );
    expect(container.textContent).toContain("SAVED · NOT RENDERED");

    clickButton("Render saved revision");
    await waitForText("Exact revision 2 rendered");
    expect(container.textContent).toContain("SAVED REVISION");
  });

  it("rehydrates a completed durable export for a reopened revision", async () => {
    const api = createWorkflowApi({ hydrateCompletedExport: true });
    act(() => {
      root.render(<AppAlpha catalog={catalog} api={api} />);
    });

    await waitForText("Brand snapshot 1.0.0 loaded");
    clickButton("Preview draft · does not save");
    await waitForText("Draft preview verified");
    clickButton("Save revision 1");

    await waitForText("Durable export complete");
    expect(api.completedRenderJobs).toHaveBeenCalledWith("workspace-1", "revision-1");
    expect(api.requestRevisionExport).not.toHaveBeenCalled();
  });

  it("keeps a newly issued invitation token visible only in ephemeral UI state", async () => {
    const api = createWorkflowApi();
    act(() => {
      root.render(<AppAlpha catalog={catalog} api={api} />);
    });
    await waitForText("Brand snapshot 1.0.0 loaded");

    clickButton("Invitations");
    await waitForText("Invite a collaborator");
    setInput("#invite-email", "editor@example.test");
    clickButton("Create invitation");
    await waitForText("one-time-token-for-editor-example");

    expect(api.createInvitation).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      email: "editor@example.test",
      role: "editor",
    });

    clickButton("Close");
    expect(container.textContent).not.toContain("one-time-token-for-editor-example");
  });

  it("allows admins to issue admin invitations", async () => {
    const api = createWorkflowApi({ role: "admin" });
    act(() => {
      root.render(<AppAlpha catalog={catalog} api={api} />);
    });
    await waitForText("Brand snapshot 1.0.0 loaded");

    clickButton("Invitations");
    await waitForText("Invite a collaborator");

    expect(
      container.querySelector<HTMLOptionElement>('#invite-role option[value="admin"]')
        ?.textContent,
    ).toBe("Admin");
  });

  function clickButton(label: string): void {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (button === undefined) {
      throw new Error(`Button “${label}” was not found.`);
    }
    act(() => {
      button.click();
    });
  }

  function setInput(selector: string, value: string): void {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (input === null) throw new Error(`Input “${selector}” was not found.`);
    const setter = Reflect.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter === undefined) throw new Error("Input value setter was not found.");
    act(() => {
      Reflect.apply(setter, input, [value]);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function waitForText(text: string): Promise<void> {
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.textContent).toContain(text);
    });
  }
});

function createWorkflowApi(
  options: {
    role?: "owner" | "admin" | "editor" | "viewer";
    hydrateCompletedExport?: boolean;
  } = {},
): AppAlphaApi & {
  createDesign: ReturnType<typeof vi.fn<AppAlphaApi["createDesign"]>>;
  reviseDesign: ReturnType<typeof vi.fn<AppAlphaApi["reviseDesign"]>>;
  revision: ReturnType<typeof vi.fn<AppAlphaApi["revision"]>>;
  renderRevision: ReturnType<typeof vi.fn<AppAlphaApi["renderRevision"]>>;
  requestRevisionExport: ReturnType<typeof vi.fn<AppAlphaApi["requestRevisionExport"]>>;
  renderJob: ReturnType<typeof vi.fn<AppAlphaApi["renderJob"]>>;
  completedRenderJobs: ReturnType<typeof vi.fn<AppAlphaApi["completedRenderJobs"]>>;
  createInvitation: ReturnType<typeof vi.fn<AppAlphaApi["createInvitation"]>>;
} {
  let storedRevision: DesignRevision | undefined;
  const createDesign = vi.fn<AppAlphaApi["createDesign"]>((input) => {
    const document = constructDocument("design-1", input.draft);
    storedRevision = {
      kind: "design-revision",
      designId: "design-1",
      designName: input.name,
      revisionId: "revision-1",
      revisionNumber: 1,
      brandSnapshotId: "snapshot-record-1",
      documentHash: hashCanonical(document),
      document,
      createdAt: "2026-07-31T01:00:00.000Z",
    };
    return Promise.resolve({
      ok: true,
      value: {
        kind: "design-saved",
        designId: "design-1",
        revisionId: "revision-1",
        revisionNumber: 1,
        documentHash: hashCanonical(document),
        document,
      },
    });
  });
  const revision = vi.fn<AppAlphaApi["revision"]>(() => {
    if (storedRevision === undefined) {
      return Promise.resolve(missingResource());
    }
    return Promise.resolve({ ok: true, value: storedRevision });
  });
  const reviseDesign = vi.fn<AppAlphaApi["reviseDesign"]>((input) => {
    const document = constructDocument(input.designId, input.draft);
    storedRevision = {
      kind: "design-revision",
      designId: input.designId,
      designName: "Untitled workshop graphic",
      revisionId: "revision-2",
      revisionNumber: 2,
      parentRevisionId: input.baseRevisionId,
      brandSnapshotId: input.brandSnapshotId,
      documentHash: hashCanonical(document),
      document,
      createdAt: "2026-07-31T02:00:00.000Z",
      ...(input.changeNote === undefined ? {} : { changeNote: input.changeNote }),
    };
    return Promise.resolve({
      ok: true,
      value: {
        kind: "design-saved",
        designId: input.designId,
        revisionId: "revision-2",
        revisionNumber: 2,
        documentHash: hashCanonical(document),
        document,
      },
    });
  });
  const renderRevision = vi.fn<AppAlphaApi["renderRevision"]>(() => {
    if (storedRevision === undefined) {
      return Promise.resolve(missingResource());
    }
    return Promise.resolve({
      ok: true,
      value: renderDocument(storedRevision.document),
    });
  });
  const createInvitation = vi.fn<AppAlphaApi["createInvitation"]>((input) =>
    Promise.resolve({
      ok: true,
      value: {
        kind: "invitation-created",
        invitationId: "invitation-1",
        invitationToken: "one-time-token-for-editor-example-123456789",
        expiresAt: "2026-08-07T01:00:00.000Z",
        email: input.email,
        role: input.role,
      },
    }),
  );
  const requestRevisionExport = vi.fn<AppAlphaApi["requestRevisionExport"]>(() =>
    Promise.resolve({
      ok: true,
      value: {
        kind: "render-job-queued",
        jobId: "render-job-1",
        workspaceId: "workspace-1",
        state: "queued",
        created: true,
      },
    }),
  );
  const renderJob = vi.fn<AppAlphaApi["renderJob"]>(() => {
    if (storedRevision === undefined) {
      return Promise.resolve(missingResource());
    }
    return Promise.resolve({
      ok: true,
      value: completedRenderJob(storedRevision),
    });
  });
  const completedRenderJobs = vi.fn<AppAlphaApi["completedRenderJobs"]>(() => {
    const jobs =
      options.hydrateCompletedExport === true && storedRevision !== undefined
        ? [completedRenderJob(storedRevision)]
        : [];
    return Promise.resolve({ ok: true, value: jobs });
  });

  return {
    currentSession: () =>
      Promise.resolve({
        ok: true,
        value: {
          user: {
            id: "user-1",
            email: "owner@example.test",
            displayName: "Workshop Owner",
          },
          workspaces: [
            {
              id: "workspace-1",
              name: "Foundry Studio",
              slug: "foundry-studio",
              role: options.role ?? "owner",
            },
          ],
          expiresAt: "2026-08-30T01:00:00.000Z",
        },
      }),
    bootstrap: () => Promise.resolve(missingResource()),
    login: () => Promise.resolve(missingResource()),
    registerWithInvitation: () => Promise.resolve(missingResource()),
    logout: () => Promise.resolve({ ok: true, value: "session-revoked" as const }),
    createWorkspace: () => Promise.resolve(missingResource()),
    createInvitation,
    acceptInvitation: () => Promise.resolve(missingResource()),
    dashboard: () =>
      Promise.resolve({
        ok: true,
        value: {
          workspace: {
            id: "workspace-1",
            name: "Foundry Studio",
            slug: "foundry-studio",
            role: options.role ?? "owner",
          },
          brandKits: [
            {
              id: "brand-kit-1",
              name: brand.name,
              latestSnapshotId: "snapshot-record-1",
              latestVersion: brand.version,
              updatedAt: "2026-07-31T01:00:00.000Z",
            },
          ],
          designs:
            storedRevision === undefined
              ? []
              : [
                  {
                    id: storedRevision.designId,
                    name: storedRevision.designName,
                    headRevisionId: storedRevision.revisionId,
                    revisionNumber: storedRevision.revisionNumber,
                    updatedAt: storedRevision.createdAt,
                  },
                ],
        },
      }),
    publishBrand: () => Promise.resolve(missingResource()),
    brandSnapshot: () =>
      Promise.resolve({
        ok: true,
        value: {
          kind: "brand-snapshot",
          brandKitId: "brand-kit-1",
          snapshotId: "snapshot-record-1",
          version: brand.version,
          canonicalHash: hashCanonical(brand),
          snapshot: brand,
        },
      }),
    previewDesign: (input) =>
      Promise.resolve({
        ok: true,
        value: renderDocument(constructDocument("preview-test", input.draft)),
      }),
    createDesign,
    reviseDesign,
    revision,
    renderRevision,
    requestRevisionExport,
    renderJob,
    completedRenderJobs,
  };
}

function completedRenderJob(revision: DesignRevision) {
  return {
    kind: "render-job" as const,
    jobId: "render-job-1",
    workspaceId: "workspace-1",
    designId: revision.designId,
    revisionId: revision.revisionId,
    state: "completed" as const,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-07-31T01:00:00.000Z",
    updatedAt: "2026-07-31T01:00:01.000Z",
    finishedAt: "2026-07-31T01:00:01.000Z",
    outputs: [
      {
        format: "svg" as const,
        mimeType: "image/svg+xml" as const,
        artifactSha256: "a".repeat(64),
        artifactByteSize: 100,
        manifestSha256: "b".repeat(64),
        manifestByteSize: 200,
        fingerprint: "durable-svg-fingerprint",
      },
      {
        format: "png" as const,
        mimeType: "image/png" as const,
        artifactSha256: "c".repeat(64),
        artifactByteSize: 300,
        manifestSha256: "d".repeat(64),
        manifestByteSize: 200,
        fingerprint: "durable-png-fingerprint",
      },
    ],
  };
}

function constructDocument(
  documentId: string,
  draft: Parameters<AppAlphaApi["previewDesign"]>[0]["draft"],
): DesignDocument {
  const result = constructManualDocument({ documentId, brand, draft });
  if (!result.ok) throw new Error("Expected a valid test document.");
  return result.document;
}

function renderDocument(document: DesignDocument): PreviewSuccess {
  const fingerprint = "a".repeat(64);
  const baseManifest: Omit<RenderManifest, "output" | "renderingMethod"> = {
    manifestVersion: MANIFEST_VERSION,
    renderId: `render_${fingerprint.slice(0, 24)}`,
    renderFingerprint: fingerprint,
    designDocumentId: document.id,
    designDocumentHash: hashCanonical(document),
    seed: document.seed,
    template: { ...document.template },
    renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
    proceduralAlgorithmVersions: {
      "layered-waves":
        catalog.proceduralStyles.find((style) => style.id === "layered-waves")
          ?.version ?? "1.1.0",
    },
    assets: [],
    fonts: [
      {
        family: "Inter",
        weight: 700,
        style: "normal",
        sha256: catalog.developmentFontSha256,
      },
    ],
    dimensions: { width: 1_200, height: 627 },
    creationTimestamp: "2026-07-31T01:00:00.000Z",
    compositionGenerativeImageModelUsed: false,
    includedGenerativeAssetUsed: false,
    qualityIssues: [],
    productClaim: PRODUCT_CLAIM,
  };
  return {
    ok: true,
    document,
    qualityIssues: [],
    outputs: [
      {
        format: "svg",
        mimeType: "image/svg+xml",
        base64: "PHN2ZyAvPg==",
        byteSize: 7,
        fingerprint,
        filename: `${document.id}.svg`,
        manifest: {
          ...baseManifest,
          output: {
            format: "svg",
            sha256: "b".repeat(64),
            byteSize: 7,
          },
          renderingMethod: "deterministic-code-rendering/direct-svg",
        },
      },
      {
        format: "png",
        mimeType: "image/png",
        base64: "iVBORw0KGgo=",
        byteSize: 8,
        fingerprint,
        filename: `${document.id}.png`,
        manifest: {
          ...baseManifest,
          output: {
            format: "png",
            sha256: "c".repeat(64),
            byteSize: 8,
          },
          renderingMethod: "deterministic-code-rendering/resvg",
        },
      },
    ],
  };
}

function createPublishedBrand(): BrandSnapshot {
  const state = createInitialPreviewForm(catalog);
  return {
    snapshotId: "brand-kit-1",
    version: "1.0.0",
    name: "Foundry & Field",
    ...buildBrandSnapshotDraft(state),
  };
}

function missingResource(): ApiFailure {
  return {
    ok: false,
    status: 404,
    error: {
      code: "RESOURCE_NOT_FOUND",
      title: "Resource not found",
      detail: "The requested test resource does not exist.",
    },
  };
}
