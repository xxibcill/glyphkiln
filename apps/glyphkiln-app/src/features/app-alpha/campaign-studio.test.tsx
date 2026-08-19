// @vitest-environment jsdom

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DELIVERY_PROFILE_REGISTRY,
  DELIVERY_SOURCES,
  hashCanonical,
  MANIFEST_VERSION,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  TYPOGRAPHY_POLICY,
} from "@glyphkiln/core";
import type { RenderManifest } from "@glyphkiln/core";

import type { CampaignSummary } from "@/server/app-workflow";
import { constructManualDocument } from "@/server/app-workflow/document-factory";
import { createPreviewDesign } from "@/test/preview-design";
import type { PreviewSuccess } from "@/features/project-preview/types";

import {
  createAppAlphaApi,
  type CampaignBoard,
  type CampaignCarouselReview,
} from "./api-client";
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
              proposalRuns: [],
              proposalRunsTruncated: false,
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
          draftCanvas={campaignDraftCanvas()}
          canCoordinate
          onApplyCanvasSeed={vi.fn()}
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

  it("requests a handoff for one explicitly selected direction", async () => {
    const board = campaignBoardFixture();
    const alternative = structuredClone(board.directions[0]);
    alternative.id = "direction-2";
    alternative.directionKey = "editorial-b";
    alternative.name = "Editorial B";
    alternative.canvases[0] = {
      ...alternative.canvases[0],
      id: "canvas-2",
      canvasKey: "hero-square",
      format: "instagram-square",
    };
    board.directions.push(alternative);
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "campaign.board") {
        return Promise.resolve(success(200, board));
      }
      if (body.type === "campaign.handoff") {
        return Promise.resolve(success(200, {}));
      }
      throw new Error(`Unexpected campaign API request: ${body.type}`);
    });

    await act(async () => {
      root.render(
        <CampaignStudio
          api={createAppAlphaApi(fetchMock)}
          workspaceId="workspace-1"
          campaigns={[CAMPAIGN]}
          draftCanvas={campaignDraftCanvas()}
          canCoordinate
          onApplyCanvasSeed={vi.fn()}
          onCampaignChanged={() => Promise.resolve()}
          onOpenDesign={() => Promise.resolve()}
        />,
      );
      await flushEffects();
    });

    await setSelect("#campaign-handoff-direction", "direction-2");
    await clickButton("Build verified handoff");
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "campaign.handoff",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-2",
    });
  });

  it("opens the exact sequence evidence before handoff", async () => {
    const board = campaignBoardFixture();
    const canvas = board.directions[0].canvases[0];
    Object.assign(canvas, {
      deliveryProfileId: "instagram-native-carousel" as const,
      carouselSequenceKey: "launch-carousel",
      altText: "Opening launch slide with a cobalt product on an ivory field.",
      sourceNotes: [
        {
          label: "Approved launch brief",
          url: "https://example.com/launch-brief",
        },
      ],
    });
    const proof = proposalProofFixture();
    const deliveryProfile = DELIVERY_PROFILE_REGISTRY["instagram-native-carousel"];
    const carouselReview: CampaignCarouselReview = {
      kind: "campaign-carousel-review",
      workspaceId: "workspace-1",
      campaignId: CAMPAIGN.id,
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
          profile: deliveryProfile,
          sources: [
            DELIVERY_SOURCES["glyphkiln-carousel-validation"],
            DELIVERY_SOURCES["instagram-creators-carousel-limit"],
            DELIVERY_SOURCES["meta-instagram-alt-text"],
            DELIVERY_SOURCES["meta-instagram-carousel"],
            DELIVERY_SOURCES["meta-instagram-photo-resolution"],
          ],
        },
        slides: [
          {
            documentId: proof.document.id,
            ordinal: 0,
            narrativeRole: "hook",
            altText: canvas.altText ?? "",
            readingOrder: [],
            visualDescriptions: [],
            sourceNotes: canvas.sourceNotes ?? [],
          },
        ],
      },
      slides: [{ canvas, documentHash: hashCanonical(proof.document), proof }],
    };
    const reviewSequence = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: carouselReview }),
    );
    const api = {
      ...createAppAlphaApi(vi.fn(() => Promise.resolve(success(200, board)))),
      campaignBoard: () => Promise.resolve({ ok: true as const, value: board }),
      campaignCarouselReview: reviewSequence,
    };

    await act(async () => {
      root.render(
        <CampaignStudio
          api={api}
          workspaceId="workspace-1"
          campaigns={[CAMPAIGN]}
          draftCanvas={campaignDraftCanvas()}
          canCoordinate
          onApplyCanvasSeed={vi.fn()}
          onCampaignChanged={() => Promise.resolve()}
          onOpenDesign={() => Promise.resolve()}
        />,
      );
      await flushEffects();
    });

    await clickButton("Review sequence launch-carousel");
    expect(reviewSequence).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      sequenceKey: "launch-carousel",
    });
    expect(container.textContent).toContain("READY FOR HANDOFF");
    expect(container.textContent).toContain(
      "Opening launch slide with a cobalt product on an ivory field.",
    );
    expect(container.textContent).toContain("Approved launch brief");
    expect(container.textContent).toContain("Exact render evidence");
    expect(container.querySelectorAll(".carousel-review-slides img")).toHaveLength(1);
  });

  it("does not hard-limit publisher alt text to a recommendation", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "campaign.board") {
        return Promise.resolve(success(200, campaignBoardFixture()));
      }
      throw new Error(`Unexpected campaign API request: ${body.type}`);
    });

    await act(async () => {
      root.render(
        <CampaignStudio
          api={createAppAlphaApi(fetchMock)}
          workspaceId="workspace-1"
          campaigns={[CAMPAIGN]}
          draftCanvas={campaignDraftCanvas("draft-seed", "tiktok-photo-carousel")}
          canCoordinate
          selectedDeliveryProfileId="tiktok-content-posting-photo"
          onApplyCanvasSeed={vi.fn()}
          onCampaignChanged={() => Promise.resolve()}
          onOpenDesign={() => Promise.resolve()}
        />,
      );
      await flushEffects();
    });

    const altText = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="altText"]',
    );
    expect(altText?.maxLength).toBe(2_000);
    expect(container.querySelector("#carousel-alt-text-hint")?.textContent).toContain(
      "this path recommends 300",
    );
  });

  it("recovers bounded proposal history while campaign mutations are disabled", async () => {
    const board = campaignBoardFixture();
    const direction = board.directions[0];
    direction.proposalRuns.push({
      id: "run-1",
      providerId: "provider-1",
      modelId: "model-1",
      candidateCount: 3,
      decidedCount: 1,
      acceptedCount: 0,
      createdAt: CAMPAIGN.createdAt,
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "campaign.board") {
        return Promise.resolve(success(200, board));
      }
      if (body.type === "campaign.proposal.run") {
        return Promise.resolve(success(200, proposalRunFixture()));
      }
      throw new Error(`Unexpected campaign API request: ${body.type}`);
    });

    await act(async () => {
      root.render(
        <CampaignStudio
          api={createAppAlphaApi(fetchMock)}
          workspaceId="workspace-1"
          campaigns={[CAMPAIGN]}
          draftCanvas={campaignDraftCanvas()}
          canCoordinate={false}
          onApplyCanvasSeed={vi.fn()}
          onCampaignChanged={() => Promise.resolve()}
          onOpenDesign={() => Promise.resolve()}
        />,
      );
      await flushEffects();
    });

    expect(container.textContent).toContain("Proposal history");
    expect(container.textContent).toContain("1/3 decided");
    await clickButton("Open run 01");
    expect(container.textContent).toContain("Model suggestions under human locks");
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "campaign.proposal.run",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      runId: "run-1",
    });
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
            draftCanvas={campaignDraftCanvas()}
            canCoordinate
            onApplyCanvasSeed={vi.fn()}
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

  it("applies an exact scoped seed to the draft without attaching it", async () => {
    const board = campaignBoardFixture();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "campaign.board") {
        return Promise.resolve(success(200, board));
      }
      if (body.type === "campaign.canvas.seed") {
        return Promise.resolve(
          success(200, campaignCanvasSeedFixture("instagram-square")),
        );
      }
      if (body.type === "campaign.canvas.attach") {
        return Promise.resolve(
          success(201, {
            kind: "campaign-canvas-attached",
            campaignId: CAMPAIGN.id,
            directionId: "direction-1",
            canvas: board.directions[0]?.canvases[0],
          }),
        );
      }
      throw new Error(`Unexpected campaign API request: ${body.type}`);
    });
    const api = createAppAlphaApi(fetchMock);
    const campaigns = [CAMPAIGN];
    const onApplyCanvasSeed = vi.fn();
    const renderStudio = async (
      draftCanvas = campaignDraftCanvas("draft-seed", "instagram-square"),
      openRevision?: Parameters<typeof CampaignStudio>[0]["openRevision"],
    ) => {
      await act(async () => {
        root.render(
          <CampaignStudio
            api={api}
            workspaceId="workspace-1"
            campaigns={campaigns}
            draftCanvas={draftCanvas}
            openRevision={openRevision}
            canCoordinate
            selectedDeliveryProfileId="instagram-api-carousel"
            onApplyCanvasSeed={onApplyCanvasSeed}
            onCampaignChanged={() => Promise.resolve()}
            onOpenDesign={() => Promise.resolve()}
          />,
        );
        await flushEffects();
      });
    };

    await renderStudio();
    await setInput('input[name="canvasKey"]', "hero-landscape");
    await clickButton("Plan canvas seed");

    expect(requestBodies(fetchMock)).toContainEqual({
      type: "campaign.canvas.seed",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      canvasKey: "hero-landscape",
      templateId: "image-led-campaign",
      format: "instagram-square",
      compositionVariantId: "focal-editorial",
    });
    expect(container.textContent).toContain("sha256/canonical-scope-v1");
    expect(button("Attach revision").disabled).toBe(true);

    await clickButton("Apply seed to draft");
    expect(onApplyCanvasSeed).toHaveBeenCalledWith("b".repeat(64));
    expect(
      requestBodies(fetchMock).filter(
        (request) =>
          typeof request === "object" &&
          request !== null &&
          "type" in request &&
          request.type === "campaign.canvas.attach",
      ),
    ).toHaveLength(0);
    expect(button("Attach revision").disabled).toBe(true);

    await renderStudio(
      campaignDraftCanvas("b".repeat(64), "instagram-square"),
      campaignRevision("b".repeat(64), "instagram-square"),
    );
    expect(button("Attach revision").disabled).toBe(false);
    await setInput('input[name="carouselSequenceKey"]', "launch-carousel");
    await setTextarea(
      'textarea[name="altText"]',
      "Square launch slide showing the campaign product and its core promise.",
    );
    await setTextarea(
      'textarea[name="sourceNotes"]',
      "Product launch brief | https://example.com/launch-brief",
    );
    await clickButton("Attach revision");
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "campaign.canvas.attach",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      canvasKey: "hero-landscape",
      designId: "design-seeded",
      revisionId: "revision-seeded",
      ordinal: 0,
      compositionVariantId: "focal-editorial",
      narrativeRole: "context",
      deliveryProfileId: "instagram-api-carousel",
      carouselSequenceKey: "launch-carousel",
      altText: "Square launch slide showing the campaign product and its core promise.",
      sourceNotes: [
        {
          label: "Product launch brief",
          url: "https://example.com/launch-brief",
        },
      ],
    });
  });

  it("invalidates a canvas seed plan when any editable scope field changes", async () => {
    const board = campaignBoardFixture();
    const firstDirection = board.directions[0];
    board.directions.push({
      ...firstDirection,
      id: "direction-2",
      directionKey: "editorial-b",
      name: "Editorial B",
      canvases: [],
      proposalRuns: [],
      proposalRunsTruncated: false,
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      return Promise.resolve(
        success(
          200,
          body.type === "campaign.board" ? board : campaignCanvasSeedFixture(),
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);
    const campaigns = [CAMPAIGN];
    const renderStudio = async (draftCanvas = campaignDraftCanvas()) => {
      await act(async () => {
        root.render(
          <CampaignStudio
            api={api}
            workspaceId="workspace-1"
            campaigns={campaigns}
            draftCanvas={draftCanvas}
            openRevision={campaignRevision("b".repeat(64))}
            canCoordinate
            onApplyCanvasSeed={vi.fn()}
            onCampaignChanged={() => Promise.resolve()}
            onOpenDesign={() => Promise.resolve()}
          />,
        );
        await flushEffects();
      });
    };
    const restorePlan = async () => {
      await setInput('input[name="canvasKey"]', "hero-landscape");
      await clickButton("Plan canvas seed");
      expect(container.textContent).toContain("sha256/canonical-scope-v1");
    };

    await renderStudio(campaignDraftCanvas("b".repeat(64)));
    await restorePlan();
    await setInput('input[name="canvasKey"]', "hero-square");
    expect(container.textContent).not.toContain("sha256/canonical-scope-v1");

    await restorePlan();
    await setSelect('select[name="canvasDirection"]', "direction-2");
    expect(container.textContent).not.toContain("sha256/canonical-scope-v1");

    await setSelect('select[name="canvasDirection"]', "direction-1");
    await restorePlan();
    await renderStudio({
      ...campaignDraftCanvas("b".repeat(64)),
      templateId: "product-announcement",
    });
    expect(container.textContent).not.toContain("sha256/canonical-scope-v1");

    await renderStudio(campaignDraftCanvas("b".repeat(64)));
    await restorePlan();
    await renderStudio({
      ...campaignDraftCanvas("b".repeat(64)),
      format: "instagram-square",
    });
    expect(container.textContent).not.toContain("sha256/canonical-scope-v1");
    expect(button("Attach revision").disabled).toBe(true);
  });

  it("requests the carousel member's authoritative composition variant", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "campaign.board") {
        return Promise.resolve(success(200, campaignBoardFixture()));
      }
      if (body.type === "campaign.canvas.seed") {
        return Promise.resolve(
          success(200, {
            ...campaignCanvasSeedFixture(),
            canvasKey: "carousel-01",
            template: { id: "tiktok-carousel-slide", version: "1.0.4" },
            format: "tiktok-photo-carousel",
            compositionVariantId: "organic-photo-editorial",
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
          draftCanvas={{
            templateId: "tiktok-carousel-slide",
            format: "tiktok-photo-carousel",
            seed: "carousel-draft",
          }}
          canCoordinate
          onApplyCanvasSeed={vi.fn()}
          onCampaignChanged={() => Promise.resolve()}
          onOpenDesign={() => Promise.resolve()}
        />,
      );
      await flushEffects();
    });

    await setInput('input[name="canvasKey"]', "carousel-01");
    await clickButton("Plan canvas seed");
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "campaign.canvas.seed",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      directionId: "direction-1",
      canvasKey: "carousel-01",
      templateId: "tiktok-carousel-slide",
      format: "tiktok-photo-carousel",
      compositionVariantId: "organic-photo-editorial",
    });
  });

  async function clickButton(label: string): Promise<void> {
    const target = button(label);
    await act(async () => {
      target.click();
      await flushEffects();
    });
  }

  function button(label: string): HTMLButtonElement {
    const target = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (target === undefined) throw new Error(`Button “${label}” was not found.`);
    return target;
  }

  async function setInput(selector: string, value: string): Promise<void> {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (input === null) throw new Error(`Input “${selector}” was not found.`);
    await setControlValue(input, HTMLInputElement.prototype, value);
  }

  async function setSelect(selector: string, value: string): Promise<void> {
    const select = container.querySelector<HTMLSelectElement>(selector);
    if (select === null) throw new Error(`Select “${selector}” was not found.`);
    await setControlValue(select, HTMLSelectElement.prototype, value);
  }

  async function setTextarea(selector: string, value: string): Promise<void> {
    const textarea = container.querySelector<HTMLTextAreaElement>(selector);
    if (textarea === null) throw new Error(`Textarea “${selector}” was not found.`);
    await setControlValue(textarea, HTMLTextAreaElement.prototype, value);
  }

  async function setControlValue(
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    prototype: object,
    value: string,
  ): Promise<void> {
    const setter = Reflect.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter === undefined) throw new Error("Control value setter was not found.");
    await act(async () => {
      Reflect.apply(setter, control, [value]);
      control.dispatchEvent(
        new Event(control instanceof HTMLSelectElement ? "change" : "input", {
          bubbles: true,
        }),
      );
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

function campaignBoardFixture(): CampaignBoard {
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
            template: { id: "image-led-campaign", version: "1.0.1" },
            format: "linkedin-landscape",
            compositionVariantId: "focal-editorial",
            narrativeRole: "hook",
            seedDerivationVersion: "1.0.0",
            directionSeed: "a".repeat(64),
            canvasSeed: "b".repeat(64),
            ordinal: 0,
            createdAt: CAMPAIGN.createdAt,
          },
        ],
        proposalRuns: [],
        proposalRunsTruncated: false,
      },
    ],
  };
}

function campaignDraftCanvas(
  seed = "draft-seed",
  format:
    | "linkedin-landscape"
    | "instagram-square"
    | "tiktok-photo-carousel" = "linkedin-landscape",
): Parameters<typeof CampaignStudio>[0]["draftCanvas"] {
  return {
    templateId:
      format === "tiktok-photo-carousel"
        ? ("tiktok-carousel-slide" as const)
        : ("image-led-campaign" as const),
    format,
    seed,
  };
}

function campaignCanvasSeedFixture(
  format: "linkedin-landscape" | "instagram-square" = "linkedin-landscape",
) {
  return {
    kind: "campaign-canvas-seed" as const,
    workspaceId: "workspace-1",
    campaignId: CAMPAIGN.id,
    directionId: "direction-1",
    canvasKey: "hero-landscape",
    template: { id: "image-led-campaign" as const, version: "1.0.1" },
    format,
    compositionVariantId: "focal-editorial" as const,
    seedDerivationVersion: "sha256/canonical-scope-v1",
    directionSeed: "a".repeat(64),
    canvasSeed: "b".repeat(64),
  };
}

function campaignRevision(
  seed: string,
  format: "linkedin-landscape" | "instagram-square" = "linkedin-landscape",
): NonNullable<Parameters<typeof CampaignStudio>[0]["openRevision"]> {
  const document = constructManualDocument({
    documentId: "design-seeded",
    brand: createPreviewDesign().brand,
    draft: {
      templateId: "image-led-campaign",
      format,
      seed,
      mode: "dark",
      resources: {
        assetIds: ["campaign-image", "campaign-logo"],
        fontIds: [],
      },
      layers: [
        {
          id: "campaign-image-layer",
          type: "image",
          visible: true,
          assetId: "campaign-image",
          alt: "Campaign photograph",
          fit: "cover",
          focalPoint: { x: 0.5, y: 0.5 },
          treatment: "dark-scrim",
        },
        {
          id: "campaign-logo-layer",
          type: "logo",
          visible: true,
          assetId: "campaign-logo",
          alt: "Brand mark",
          fit: "contain",
        },
        { id: "eyebrow", type: "eyebrow", visible: true, text: "CAMPAIGN" },
        { id: "headline", type: "headline", visible: true, text: "Seeded canvas" },
        { id: "subtitle", type: "subtitle", visible: true, text: "Exact scope" },
        { id: "cta", type: "cta", visible: true, text: "VIEW →" },
      ],
    },
    assets: [
      {
        id: "campaign-image",
        mimeType: "image/png",
        sha256: "d".repeat(64),
        width: 1_200,
        height: 800,
        origin: { kind: "user-upload" },
      },
      {
        id: "campaign-logo",
        mimeType: "image/png",
        sha256: "e".repeat(64),
        width: 400,
        height: 200,
        origin: { kind: "user-upload" },
      },
    ],
  });
  if (!document.ok) throw new Error("Expected a valid image-led campaign document.");
  return {
    kind: "design-revision" as const,
    designId: "design-seeded",
    designName: "Seeded canvas",
    revisionId: "revision-seeded",
    revisionNumber: 1,
    brandSnapshotId: "brand-snapshot-1",
    documentHash: "c".repeat(64),
    document: document.document,
    createdAt: CAMPAIGN.createdAt,
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
      version: "1.1.0",
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
