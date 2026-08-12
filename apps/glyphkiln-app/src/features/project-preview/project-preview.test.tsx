// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MANIFEST_VERSION,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  TYPOGRAPHY_POLICY,
} from "@glyphkiln/core";
import type { RenderManifest } from "@glyphkiln/core";

import { createPreviewCatalog } from "@/lib/project-preview/catalog";

import { ProjectPreview } from "./project-preview";
import type { PreviewFailure, PreviewResponse, PreviewSuccess } from "./types";

const responseParserMocks = vi.hoisted(() => ({
  prerequisiteFailure: vi.fn<() => PreviewFailure | null>(),
  verifyIntegrity:
    vi.fn<
      (
        response: PreviewSuccess,
        catalog: ReturnType<typeof createPreviewCatalog>,
        submittedDocument: PreviewSuccess["document"],
      ) => Promise<PreviewFailure | null>
    >(),
}));

vi.mock("./response-parser", () => ({
  parsePreviewResponse: (input: unknown) => input as PreviewResponse,
  previewIntegrityPrerequisiteFailure: responseParserMocks.prerequisiteFailure,
  verifyPreviewIntegrity: responseParserMocks.verifyIntegrity,
}));

describe("ProjectPreview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    responseParserMocks.prerequisiteFailure.mockReturnValue(null);
    responseParserMocks.verifyIntegrity.mockResolvedValue(null);
    act(() => {
      root.render(<ProjectPreview catalog={createPreviewCatalog()} />);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("stops before rendering when secure-context Web Crypto is unavailable", () => {
    const fetchMock = vi.fn();
    responseParserMocks.prerequisiteFailure.mockReturnValue(
      secureContextRequiredFailure(),
    );
    vi.stubGlobal("fetch", fetchMock);

    clickRender();

    expect(container.textContent).toContain("Secure browser context required");
    expect(container.textContent).toContain("HTTPS");
    expect(container.textContent).toContain("Unfired");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an integrity-checked proof and marks later edits as stale", async () => {
    const fetchMock = createPreviewFetch();
    vi.stubGlobal("fetch", fetchMock);

    clickRender();
    await waitForText("Proof current");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Deliberate downloads");
    expect(container.textContent).toContain("Download SVG");
    expect(container.textContent).toContain("Hide Core evidence");
    expect(container.querySelector(".proof-evidence-overlay")).not.toBeNull();

    clickButton("Hide Core evidence");
    expect(container.textContent).toContain("Show Core evidence");
    expect(container.querySelector(".proof-evidence-overlay")).toBeNull();

    setSeed("workshop-proof-02");

    expect(container.textContent).toContain("Edits not rendered");
    expect(container.textContent).toContain("Validation needs refresh");
    expect(container.textContent).toContain("Last rendered downloads");
  });

  it("does not promote a tampered response to proof", async () => {
    const fetchMock = createPreviewFetch();
    responseParserMocks.verifyIntegrity.mockResolvedValue({
      ok: false,
      status: 502,
      title: "Preview integrity check failed",
      code: "PREVIEW_INTEGRITY_FAILED",
      detail: "The SVG bytes do not match the output manifest.",
    });
    vi.stubGlobal("fetch", fetchMock);

    clickRender();
    await waitForText("Preview integrity check failed");

    expect(container.textContent).toContain("Unfired");
    expect(container.textContent).toContain("Exports appear after Core accepts");
    expect(container.textContent).not.toContain("Deliberate downloads");
  });

  it("keeps a completed proof stale when controls change during rendering", async () => {
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const fetchMock = createPreviewFetch(undefined, responseGate);
    vi.stubGlobal("fetch", fetchMock);

    clickRender();
    expect(container.textContent).toContain("Firing SVG and PNG");

    setSeed("edited-during-render");
    if (releaseResponse === undefined) {
      throw new Error("Preview response gate was not initialized.");
    }
    const release = releaseResponse;
    await act(async () => {
      release();
      await responseGate;
    });
    await waitForText("Edits not rendered");

    expect(container.textContent).toContain("Validation needs refresh");
    expect(container.textContent).toContain("Last rendered downloads");
  });

  it("classifies an aborted request as a timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            },
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    clickRender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(container.textContent).toContain("Preview request timed out");
    expect(container.textContent).toContain("Unfired");
  });

  function clickRender(): void {
    const button = container.querySelector<HTMLButtonElement>("button[type='submit']");
    if (button === null) throw new Error("Render button was not found.");
    act(() => {
      button.click();
    });
  }

  function clickButton(label: string): void {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (button === undefined) throw new Error(`Button “${label}” was not found.`);
    act(() => {
      button.click();
    });
  }

  function setSeed(value: string): void {
    const input = container.querySelector<HTMLInputElement>("#seed");
    if (input === null) throw new Error("Seed input was not found.");
    const valueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    if (valueDescriptor?.set === undefined) {
      throw new Error("Input value setter was not found.");
    }

    act(() => {
      valueDescriptor.set?.call(input, value);
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

function createPreviewFetch(
  transform?: (body: PreviewResponse) => void,
  responseGate: Promise<void> = Promise.resolve(),
) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    await responseGate;
    if (typeof init?.body !== "string") {
      throw new Error("Expected a JSON preview request body.");
    }
    const body = createPreviewSuccess(
      JSON.parse(init.body) as PreviewSuccess["document"],
    );
    transform?.(body);
    return {
      status: 200,
      json: () => Promise.resolve(body),
    } as Response;
  });
}

function createPreviewSuccess(document: PreviewSuccess["document"]): PreviewSuccess {
  const fingerprint = "a".repeat(64);
  const outputHash = "b".repeat(64);
  const baseManifest: Omit<RenderManifest, "output" | "renderingMethod"> = {
    manifestVersion: MANIFEST_VERSION,
    renderId: `render_${fingerprint.slice(0, 24)}`,
    renderFingerprint: fingerprint,
    designDocumentId: document.id,
    designDocumentHash: "c".repeat(64),
    seed: document.seed,
    template: { ...document.template },
    renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
    typographyPolicy: TYPOGRAPHY_POLICY,
    proceduralAlgorithmVersions: { "layered-waves": "1.1.0" },
    assets: [],
    fonts: [
      {
        family: "Inter",
        weight: 700,
        style: "normal",
        sha256: document.fonts[0]?.sha256 ?? "d".repeat(64),
      },
    ],
    dimensions: { width: 1_200, height: 627 },
    creationTimestamp: "2026-07-30T06:00:00.000Z",
    compositionGenerativeImageModelUsed: false,
    includedGenerativeAssetUsed: false,
    qualityIssues: [],
    productClaim: PRODUCT_CLAIM,
  };

  return {
    ok: true,
    document,
    qualityIssues: [],
    evidence: {
      version: "1.0.0",
      safeArea: { x: 84, y: 44, width: 1_032, height: 539 },
      text: [
        {
          layerId: "headline",
          bounds: { x: 120, y: 140, width: 620, height: 180 },
          lineCount: 2,
          maximumLines: 3,
          overflow: false,
        },
      ],
      crops: [],
      contrast: [],
    },
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
            sha256: outputHash,
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
            sha256: outputHash,
            byteSize: 8,
          },
          renderingMethod: "deterministic-code-rendering/resvg",
        },
      },
    ],
  };
}

function secureContextRequiredFailure(): PreviewFailure {
  return {
    ok: false,
    status: 0,
    title: "Secure browser context required",
    code: "PREVIEW_SECURE_CONTEXT_REQUIRED",
    detail:
      "Open the remote workshop over HTTPS, or use localhost on this machine, before rendering a proof.",
  };
}
