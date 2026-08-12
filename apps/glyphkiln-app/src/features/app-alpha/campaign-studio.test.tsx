// @vitest-environment jsdom

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

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
  TYPOGRAPHY_POLICY,
} from "@glyphkiln/core";
import type { RenderManifest } from "@glyphkiln/core";

import type { CampaignSummary } from "@/server/app-workflow";
import { createPreviewDesign } from "@/test/preview-design";
import type { PreviewSuccess } from "@/features/project-preview/types";

import { createAppAlphaApi } from "./api-client";
import { CampaignStudio } from "./campaign-studio";

const CAMPAIGN: CampaignSummary = {
  id: "campaign-1",
  name: "First firing",
  brief: "Launch one admitted image across a coordinated campaign family.",
  campaignSeed: "first-firing-2026",
  familyId: "image-led-campaign",
  createdAt: "2026-08-12T01:00:00.000Z",
  updatedAt: "2026-08-12T01:00:00.000Z",
};

describe("CampaignStudio", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    document.cookie = "gk_csrf=campaign-ui-proof; Path=/";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.cookie = "gk_csrf=; Max-Age=0; Path=/";
    container.remove();
  });

  it("branches locked directions and labels model output as optional proposals", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "campaign.board") {
        return Promise.resolve(success(200, campaignBoardFixture()));
      }
      if (body.type === "campaign.direction.branch") {
        return Promise.resolve(
          success(201, {
            kind: "campaign-direction-created",
            campaignId: CAMPAIGN.id,
            direction: {
              id: "direction-2",
              directionKey: "editorial-a-branch-2",
              name: "Editorial A · branch 2",
              locks: ["copy", "image", "palette"],
              createdAt: CAMPAIGN.createdAt,
              canvases: [],
            },
          }),
        );
      }
      if (body.type === "campaign.proposals.request") {
        return Promise.resolve(
          success(201, {
            kind: "campaign-proposals-created",
            run: proposalRunFixture(),
          }),
        );
      }
      throw new Error(`Unexpected campaign API request: ${body.type}`);
    });
    const onCampaignChanged = vi.fn(() => Promise.resolve());
    const onOpenDesign = vi.fn(() => Promise.resolve());

    await act(async () => {
      root.render(
        <CampaignStudio
          api={createAppAlphaApi(fetchMock)}
          workspaceId="workspace-1"
          campaigns={[CAMPAIGN]}
          canCoordinate
          onCampaignChanged={onCampaignChanged}
          onOpenDesign={onOpenDesign}
        />,
      );
      await flushEffects();
    });

    expect(container.textContent).toContain("Editorial A");
    expect(container.textContent).toContain("LOCKED · copy · image · palette");
    await clickButton("Branch");
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "campaign.direction.branch",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      sourceDirectionId: "direction-1",
      directionKey: "editorial-a-branch-2",
      name: "Editorial A · branch 2",
    });

    await clickButton("Request 3 optional proposals");
    expect(container.textContent).toContain("OPTIONAL / PROPOSAL-ONLY");
    expect(container.textContent).toContain("Model suggestions under human locks");
    expect(container.querySelectorAll(".proposal-board article")).toHaveLength(3);
    expect(container.textContent.match(/REJECTED BY BOUNDARY/g)).toHaveLength(3);
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "campaign.proposals.request",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      baseCanvasId: "canvas-1",
      candidateCount: 3,
    });

    await clickButton("Open revision");
    expect(onOpenDesign).toHaveBeenCalledWith("design-1", "revision-1");
  });

  it.each([
    ["matching", false, true],
    ["changed", true, false],
  ])(
    "%s persisted proof metadata controls whether decision refresh retains proof bytes",
    async (_name, changeFingerprint, shouldRetainProof) => {
      const proof = proposalProofFixture();
      const png = proof.outputs.find((output) => output.format === "png");
      if (png === undefined) throw new Error("Expected a PNG proposal proof.");
      const createdRun = proposalRunWithProof(proof, png.fingerprint, true);
      const refreshedRun = proposalRunWithProof(
        proof,
        changeFingerprint ? "f".repeat(64) : png.fingerprint,
        false,
      );
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(requestBody(init?.body)) as { type: string };
        if (body.type === "campaign.board") {
          return Promise.resolve(success(200, campaignBoardFixture()));
        }
        if (body.type === "campaign.proposals.request") {
          return Promise.resolve(
            success(201, {
              kind: "campaign-proposals-created",
              run: createdRun,
            }),
          );
        }
        if (body.type === "campaign.proposal.reject") {
          return Promise.resolve(
            success(201, {
              kind: "campaign-proposal-rejected",
              decision: proposalDecision(),
            }),
          );
        }
        if (body.type === "campaign.proposal.run") {
          return Promise.resolve(
            success(200, {
              ...refreshedRun,
              candidates: refreshedRun.candidates.map((candidate, index) =>
                index === 0
                  ? { ...candidate, decision: proposalDecision() }
                  : candidate,
              ),
            }),
          );
        }
        throw new Error(`Unexpected campaign API request: ${body.type}`);
      });

      await act(async () => {
        root.render(
          <CampaignStudio
            api={createAppAlphaApi(fetchMock)}
            workspaceId="workspace-1"
            campaigns={[CAMPAIGN]}
            canCoordinate
            onCampaignChanged={() => Promise.resolve()}
            onOpenDesign={() => Promise.resolve()}
          />,
        );
        await flushEffects();
      });

      await clickButton("Request 3 optional proposals");
      await waitForProposalImages(1);
      await clickButton("Reject");
      await waitForText("REJECTED");
      await waitForProposalImages(shouldRetainProof ? 1 : 0);
    },
  );

  async function clickButton(label: string): Promise<void> {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (button === undefined) throw new Error(`Button “${label}” was not found.`);
    await act(async () => {
      button.click();
      await flushEffects();
    });
  }

  async function waitForText(text: string): Promise<void> {
    await vi.waitFor(async () => {
      await act(flushEffects);
      expect(container.textContent).toContain(text);
    });
  }

  async function waitForProposalImages(count: number): Promise<void> {
    await vi.waitFor(async () => {
      await act(flushEffects);
      expect(container.querySelectorAll(".proposal-board img")).toHaveLength(count);
    });
  }
});

function campaignBoardFixture() {
  return {
    kind: "campaign-board",
    campaign: CAMPAIGN,
    directions: [
      {
        id: "direction-1",
        directionKey: "editorial-a",
        name: "Editorial A",
        locks: ["copy", "image", "palette"],
        createdAt: CAMPAIGN.createdAt,
        canvases: [
          {
            id: "canvas-1",
            canvasKey: "hero-landscape",
            designId: "design-1",
            revisionId: "revision-1",
            template: { id: "image-led-campaign", version: "1.0.0" },
            format: "linkedin-landscape",
            compositionVariantId: "focal-editorial",
            seedDerivationVersion: "1.0.0",
            directionSeed: "a".repeat(64),
            canvasSeed: "b".repeat(64),
            ordinal: 0,
            createdAt: CAMPAIGN.createdAt,
          },
        ],
      },
    ],
  };
}

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
      retentionDisclosure: "The provider receives only the bounded authoring input.",
    },
    inputHash: "c".repeat(64),
    responseHash: "d".repeat(64),
    locks: ["copy", "image", "palette"],
    createdAt: CAMPAIGN.createdAt,
    candidates: Array.from({ length: 3 }, (_, index) => ({
      id: `candidate-${index.toString()}`,
      index,
      status: "rejected",
      issues: [
        {
          code: "RESOURCE_BACKED_PROOF_FAILED",
          message: "Core proof was not accepted.",
          candidateIndex: index,
        },
      ],
    })),
  };
}

function proposalRunWithProof(
  proof: PreviewSuccess,
  fingerprint: string,
  includeBytes: boolean,
) {
  const run = proposalRunFixture();
  const outputs = proof.outputs.map((output) => {
    const next = structuredClone(output);
    if (output.format === "png" && fingerprint !== output.fingerprint) {
      next.fingerprint = fingerprint;
      next.manifest.renderFingerprint = fingerprint;
    }
    if (!includeBytes) {
      const metadata = { ...next } as Omit<typeof next, "base64"> & {
        base64?: string;
      };
      delete metadata.base64;
      return metadata;
    }
    return next;
  });
  return {
    ...run,
    candidates: run.candidates.map((candidate, index) =>
      index === 0
        ? {
            ...candidate,
            status: "proved",
            document: proof.document,
            canonicalHash: hashCanonical(proof.document),
            issues: [],
            proof: {
              qualityIssues: proof.qualityIssues,
              evidence: proof.evidence,
              outputs,
            },
          }
        : candidate,
    ),
  };
}

function proposalProofFixture(): PreviewSuccess {
  const document = createPreviewDesign();
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
    typographyPolicy: TYPOGRAPHY_POLICY,
    proceduralAlgorithmVersions: { "layered-waves": "1.1.0" },
    assets: [],
    fonts: document.fonts.map((font) => ({
      ...font,
      sha256: font.sha256 ?? "d".repeat(64),
    })),
    dimensions: { width: 1_200, height: 627 },
    creationTimestamp: CAMPAIGN.createdAt,
    compositionGenerativeImageModelUsed: false,
    includedGenerativeAssetUsed: false,
    qualityIssues: [],
    productClaim: PRODUCT_CLAIM,
  };
  const svgBase64 = "PHN2ZyAvPg==";
  const pngBase64 = "iVBORw0KGgo=";
  return {
    ok: true,
    document,
    qualityIssues: [],
    evidence: {
      version: "1.0.0",
      safeArea: { x: 84, y: 44, width: 1_032, height: 539 },
      text: [],
      crops: [],
      contrast: [],
    },
    outputs: [
      {
        format: "svg",
        mimeType: "image/svg+xml",
        base64: svgBase64,
        byteSize: 7,
        fingerprint,
        filename: `${document.id}.svg`,
        manifest: {
          ...baseManifest,
          output: {
            format: "svg",
            sha256: sha256Base64(svgBase64),
            byteSize: 7,
          },
          renderingMethod: "deterministic-code-rendering/direct-svg",
        },
      },
      {
        format: "png",
        mimeType: "image/png",
        base64: pngBase64,
        byteSize: 8,
        fingerprint,
        filename: `${document.id}.png`,
        manifest: {
          ...baseManifest,
          output: {
            format: "png",
            sha256: sha256Base64(pngBase64),
            byteSize: 8,
          },
          renderingMethod: "deterministic-code-rendering/resvg",
        },
      },
    ],
  };
}

function sha256Base64(base64: string): string {
  return createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
}

function proposalDecision() {
  return {
    id: "decision-1",
    decision: "rejected",
    decidedBy: {
      id: "user-1",
      email: "reviewer@example.test",
      displayName: "Reviewer",
    },
    createdAt: CAMPAIGN.createdAt,
  };
}

function success(status: 200 | 201, value: unknown): Response {
  return new Response(JSON.stringify({ ok: true, status, value }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== "string") throw new Error("Expected a JSON request body.");
  return body;
}

function requestBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls.map((call) =>
    parseUnknownJson(requestBody((call[1] as RequestInit | undefined)?.body)),
  );
}

function parseUnknownJson(input: string): unknown {
  return JSON.parse(input) as unknown;
}

function flushEffects(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}
