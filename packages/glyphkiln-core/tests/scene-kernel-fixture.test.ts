import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { contrastRatio, sha256 } from "../src/index.js";
import {
  SCENE_DOCUMENT_VERSION,
  SCENE_KERNEL_VERSION,
  SCENE_RENDER_MANIFEST_VERSION,
  renderScene,
  validateSceneDocument,
  verifySceneReproduction,
  type SceneDocument,
  type SceneElement,
  type SceneGroupElement,
  type SceneRenderManifest,
} from "../src/scene/index.js";

const fixtureDirectory = resolve("fixtures/scene-kernel");
const fixtureName = "editorial-decoder-spread-v1";
const creationTimestamp = "2026-08-29T00:00:00.000Z";

type FixtureExpectations = {
  fixtureVersion: string;
  sceneId: string;
  versions: {
    sceneSchemaVersion: string;
    sceneKernelVersion: string;
    rendererVersion: string;
    sceneManifestVersion: string;
  };
  dimensions: { width: number; height: number; gutterX: number };
  palette: {
    paper: string;
    ink: string;
    signal: string;
    allowedPaints: string[];
  };
  contrastThresholds: {
    inkOnPaper: { minimumRatio: number };
    signalOnPaper: { minimumRatio: number };
  };
  resources: {
    assets: unknown[];
    fonts: SceneDocument["fonts"];
    allowSystemFonts: boolean;
    allowExternalPaths: boolean;
    allowNetworkReferences: boolean;
  };
  requiredFeatures: {
    elementTypes: SceneElement["type"][];
    nestedGroups: { parentId: string; childId: string }[];
    translatedGroup: {
      id: string;
      transform: { type: "translate"; x: number; y: number };
    };
    rectClips: {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
    textModes: string[];
    semanticRoles: string[];
    decorativePathIds: string[];
    connectorPathDataAllowed: boolean;
  };
  requiredIds: string[];
  semanticSequence: string[];
  requiredConnectors: { id: string; fromId: string; toId: string }[];
  residualBypasses: {
    connectorId: string;
    fromId: string;
    mustEndAtId: string;
  }[];
  candidateState: {
    neutralBeforeDecoder: { id: string; fill: string; stroke: string }[];
    decoderId: string;
    selectedAfterDecoder: { id: string; fill: string; stroke: string };
  };
  readingOrder: string[];
  outputHashes: { svgSha256: string; pngSha256: string };
};

describe("Direction A Scene Kernel conformance fixture", () => {
  it("pins the reviewed editorial structure and mechanism corrections", async () => {
    const { document, expectations } = await loadFixture();
    const entries = flattenScene(document.elements);
    const elementsById = new Map(entries.map((entry) => [entry.element.id, entry]));

    expect(document.id).toBe(expectations.sceneId);
    expect(document.schemaVersion).toBe(SCENE_DOCUMENT_VERSION);
    expect(document.dimensions).toEqual({
      width: expectations.dimensions.width,
      height: expectations.dimensions.height,
    });
    expect(document.readingOrder).toEqual(expectations.readingOrder);
    expect(document.assets).toEqual(expectations.resources.assets);
    expect(document.fonts).toEqual(expectations.resources.fonts);
    expect(expectations.resources).toMatchObject({
      allowSystemFonts: false,
      allowExternalPaths: false,
      allowNetworkReferences: false,
    });

    for (const id of expectations.requiredIds) expect(elementsById.has(id)).toBe(true);
    for (const type of expectations.requiredFeatures.elementTypes) {
      expect(entries.some((entry) => entry.element.type === type)).toBe(true);
    }
    for (const relationship of expectations.requiredFeatures.nestedGroups) {
      expect(elementsById.get(relationship.childId)?.parentId).toBe(
        relationship.parentId,
      );
    }

    const translated = requireGroup(
      elementsById,
      expectations.requiredFeatures.translatedGroup.id,
    );
    expect(translated.transforms).toContainEqual(
      expectations.requiredFeatures.translatedGroup.transform,
    );
    for (const expectedClip of expectations.requiredFeatures.rectClips) {
      const group = requireGroup(elementsById, expectedClip.id);
      expect(group.clip).toEqual({
        type: "rect",
        x: expectedClip.x,
        y: expectedClip.y,
        width: expectedClip.width,
        height: expectedClip.height,
      });
    }

    expect(
      new Set(
        entries
          .filter(
            (
              entry,
            ): entry is SceneEntry & {
              element: Extract<SceneElement, { type: "text" }>;
            } => entry.element.type === "text",
          )
          .map((entry) => entry.element.textMode),
      ),
    ).toEqual(new Set(expectations.requiredFeatures.textModes));
    expect(
      new Set(
        entries.flatMap((entry) =>
          entry.element.semantic === undefined ? [] : [entry.element.semantic.role],
        ),
      ),
    ).toEqual(new Set(expectations.requiredFeatures.semanticRoles));
    for (const id of expectations.requiredFeatures.decorativePathIds) {
      expect(elementsById.get(id)?.element).toMatchObject({
        type: "path",
        semantic: { role: "decoration" },
      });
    }

    const connectors = entries
      .map((entry) => entry.element)
      .filter(
        (element): element is Extract<SceneElement, { type: "connector" }> =>
          element.type === "connector",
      );
    expect(expectations.requiredFeatures.connectorPathDataAllowed).toBe(false);
    expect(connectors.every((connector) => !("data" in connector))).toBe(true);
    for (const expectedConnector of expectations.requiredConnectors) {
      expect(
        connectors.find((connector) => connector.id === expectedConnector.id),
      ).toMatchObject(expectedConnector);
    }
    for (const bypass of expectations.residualBypasses) {
      expect(
        connectors.find((connector) => connector.id === bypass.connectorId),
      ).toMatchObject({
        fromId: bypass.fromId,
        toId: bypass.mustEndAtId,
      });
    }

    for (const candidate of expectations.candidateState.neutralBeforeDecoder) {
      expect(elementsById.get(candidate.id)?.element).toMatchObject(candidate);
    }
    expect(elementsById.has(expectations.candidateState.decoderId)).toBe(true);
    expect(
      elementsById.get(expectations.candidateState.selectedAfterDecoder.id)?.element,
    ).toMatchObject(expectations.candidateState.selectedAfterDecoder);
    const conceptIds = new Set(
      entries.flatMap((entry) =>
        entry.element.semantic?.conceptId === undefined
          ? []
          : [entry.element.semantic.conceptId],
      ),
    );
    for (const conceptId of expectations.semanticSequence) {
      expect(conceptIds.has(conceptId)).toBe(true);
    }

    const paints = new Set([
      document.backgroundColor,
      ...entries.flatMap((entry) => elementPaints(entry.element)),
    ]);
    expect([...paints].sort()).toEqual([...expectations.palette.allowedPaints].sort());
    expect(
      contrastRatio(expectations.palette.ink, expectations.palette.paper),
    ).toBeGreaterThanOrEqual(expectations.contrastThresholds.inkOnPaper.minimumRatio);
    expect(
      contrastRatio(expectations.palette.signal, expectations.palette.paper),
    ).toBeGreaterThanOrEqual(
      expectations.contrastThresholds.signalOnPaper.minimumRatio,
    );
  });

  it("reproduces exact SVG, PNG, and manifests from the public lifecycle", async () => {
    const { document, expectations } = await loadFixture();
    const first = await renderScene(document, {
      formats: ["svg", "png"],
      creationTimestamp,
    });
    const second = await renderScene(document, {
      formats: ["svg", "png"],
      creationTimestamp,
    });
    expect(first.qualityIssues).toEqual([]);
    expect(second.qualityIssues).toEqual([]);

    const svg = outputFor(first, "svg");
    const png = outputFor(first, "png");
    expect(svg.bytes).toEqual(outputFor(second, "svg").bytes);
    expect(png.bytes).toEqual(outputFor(second, "png").bytes);
    expect(sha256(svg.bytes)).toBe(expectations.outputHashes.svgSha256);
    expect(sha256(png.bytes)).toBe(expectations.outputHashes.pngSha256);

    const committedPng = new Uint8Array(
      await readFile(resolve(fixtureDirectory, "generated", `${fixtureName}.png`)),
    );
    expect(png.bytes).toEqual(committedPng);
    const decodedPng = PNG.sync.read(Buffer.from(png.bytes));
    expect({ width: decodedPng.width, height: decodedPng.height }).toEqual(
      document.dimensions,
    );

    const svgManifest = await loadManifest("svg");
    const pngManifest = await loadManifest("png");
    expect(svg.manifest).toEqual(svgManifest);
    expect(png.manifest).toEqual(pngManifest);
    expect(svg.manifest).toMatchObject({
      manifestVersion: SCENE_RENDER_MANIFEST_VERSION,
      sceneKernelVersion: SCENE_KERNEL_VERSION,
      renderer: { version: expectations.versions.rendererVersion },
      accessibility: {
        readingOrder: expectations.readingOrder,
        selectableText: true,
      },
    });
    expect(
      verifySceneReproduction({
        document,
        bytes: svg.bytes,
        manifest: svg.manifest,
      }),
    ).toEqual([]);
    expect(
      verifySceneReproduction({
        document,
        bytes: png.bytes,
        manifest: png.manifest,
      }),
    ).toEqual([]);
  }, 60_000);
});

type SceneEntry = {
  element: SceneElement;
  parentId: string | undefined;
};

function flattenScene(
  elements: readonly SceneElement[],
  parentId?: string,
): SceneEntry[] {
  return elements.flatMap((element) => [
    { element, parentId },
    ...(element.type === "group" ? flattenScene(element.elements, element.id) : []),
  ]);
}

function requireGroup(
  entries: ReadonlyMap<string, SceneEntry>,
  id: string,
): SceneGroupElement {
  const element = entries.get(id)?.element;
  if (element?.type !== "group") throw new Error(`Missing fixture group ${id}.`);
  return element;
}

function elementPaints(element: SceneElement): string[] {
  switch (element.type) {
    case "rect":
    case "circle":
    case "path":
      return [element.fill, ...(element.stroke === undefined ? [] : [element.stroke])];
    case "text":
      return [element.fill];
    case "connector":
      return [element.stroke];
    case "image":
    case "group":
      return [];
  }
}

async function loadFixture(): Promise<{
  document: SceneDocument;
  expectations: FixtureExpectations;
}> {
  const input: unknown = JSON.parse(
    await readFile(resolve(fixtureDirectory, `${fixtureName}.scene.json`), "utf8"),
  );
  const validation = validateSceneDocument(input);
  if (!validation.success) {
    throw new Error(
      `Invalid Scene Kernel fixture: ${JSON.stringify(validation.problems)}`,
    );
  }
  const expectations = JSON.parse(
    await readFile(
      resolve(fixtureDirectory, `${fixtureName}.expectations.json`),
      "utf8",
    ),
  ) as FixtureExpectations;
  expect(expectations.versions).toMatchObject({
    sceneSchemaVersion: SCENE_DOCUMENT_VERSION,
    sceneKernelVersion: SCENE_KERNEL_VERSION,
    sceneManifestVersion: SCENE_RENDER_MANIFEST_VERSION,
  });
  return { document: validation.data, expectations };
}

function outputFor(
  result: Awaited<ReturnType<typeof renderScene>>,
  format: "svg" | "png",
) {
  const output = result.outputs.find((candidate) => candidate.format === format);
  if (output === undefined) throw new Error(`Missing ${format} fixture output.`);
  return output;
}

async function loadManifest(format: "svg" | "png"): Promise<SceneRenderManifest> {
  return JSON.parse(
    await readFile(
      resolve(fixtureDirectory, "generated", `${fixtureName}.${format}.manifest.json`),
      "utf8",
    ),
  ) as SceneRenderManifest;
}
