// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CampaignSummary } from "@/server/app-workflow";

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
    ["matching", "proof-fingerprint", true],
    ["changed", "changed-fingerprint", false],
  ])(
    "%s persisted proof metadata controls whether decision refresh retains proof bytes",
    async (_name, refreshedFingerprint, shouldRetainProof) => {
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(requestBody(init?.body)) as { type: string };
        if (body.type === "campaign.board") {
          return Promise.resolve(success(200, campaignBoardFixture()));
        }
        if (body.type === "campaign.proposals.request") {
          return Promise.resolve(
            success(201, {
              kind: "campaign-proposals-created",
              run: proposalRunWithProof("proof-fingerprint", true),
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
              ...proposalRunWithProof(refreshedFingerprint, false),
              candidates: proposalRunWithProof(refreshedFingerprint, false).candidates.map(
                (candidate, index) =>
                  index === 0 ? { ...candidate, decision: proposalDecision() } : candidate,
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

function proposalRunWithProof(fingerprint: string, includeBytes: boolean) {
  const run = proposalRunFixture();
  return {
    ...run,
    candidates: run.candidates.map((candidate, index) =>
      index === 0
        ? {
            ...candidate,
            status: "proved",
            canonicalHash: "e".repeat(64),
            issues: [],
            proof: {
              qualityIssues: [],
              evidence: {},
              outputs: [
                {
                  format: "png",
                  mimeType: "image/png",
                  ...(includeBytes ? { base64: "AA==" } : {}),
                  byteSize: 1,
                  fingerprint,
                  filename: "proposal.png",
                  manifest: {},
                },
              ],
            },
          }
        : candidate,
    ),
  };
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
  return new Promise((resolve) => setTimeout(resolve, 0));
}
