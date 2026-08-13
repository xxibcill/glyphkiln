import { describe, expect, it } from "vitest";

import {
  CampaignHandoffArchive,
  CampaignHandoffArchiveLimitError,
  campaignHandoffCanvasPrefix,
  type CampaignHandoffFile,
} from "./campaign-handoff-archive";

describe("CampaignHandoffArchive", () => {
  it("sorts files and encodes a bounded canonical archive", () => {
    const archive = new CampaignHandoffArchive(2_048);
    archive.add(file("z-last.json", "e30="), file("a-first.json", "e30="));

    const encoded = archive.encode({
      campaign: { id: "campaign-1" },
      summary: { approvedCanvasCount: 0, unapprovedCanvasCount: 2 },
    });

    expect(encoded.files.map((entry) => entry.path)).toEqual([
      "a-first.json",
      "z-last.json",
    ]);
    expect(new TextDecoder().decode(encoded.bytes)).toContain('"version":"1.0.0"');
  });

  it("rejects an aggregate that exceeds the byte budget without partial addition", () => {
    const first = file("first.bin", "a".repeat(80));
    const second = file("second.bin", "b".repeat(80));
    const oneFileBytes = new TextEncoder().encode(JSON.stringify([first])).byteLength;
    const archive = new CampaignHandoffArchive(oneFileBytes + 1);

    expect(() => {
      archive.add(first, second);
    }).toThrow(CampaignHandoffArchiveLimitError);
    const encoded = archive.encode({
      campaign: {},
      summary: { approvedCanvasCount: 0, unapprovedCanvasCount: 0 },
    });
    expect(encoded.files).toEqual([]);
  });

  it("includes archive metadata in the final byte limit", () => {
    const archive = new CampaignHandoffArchive(128);

    expect(() =>
      archive.encode({
        campaign: { name: "x".repeat(128) },
        summary: { approvedCanvasCount: 0, unapprovedCanvasCount: 0 },
      }),
    ).toThrow(CampaignHandoffArchiveLimitError);
  });

  it("keeps existing canvas paths stable when the board grows before them", () => {
    const initialBoard = [
      {
        directionKey: "editorial-b",
        canvases: [{ canvasKey: "hero", ordinal: 10 }],
      },
    ];
    const grownBoard = [
      {
        directionKey: "editorial-a",
        canvases: [{ canvasKey: "cover", ordinal: 0 }],
      },
      {
        directionKey: "editorial-b",
        canvases: [
          { canvasKey: "detail", ordinal: 2 },
          { canvasKey: "hero", ordinal: 10 },
        ],
      },
    ];

    const initialPaths = canvasPaths(initialBoard);
    const grownPaths = canvasPaths(grownBoard);

    expect(initialPaths).toEqual(["first-firing/direction-editorial-b/010-hero"]);
    expect(grownPaths).toEqual(expect.arrayContaining(initialPaths));
  });
});

function canvasPaths(
  directions: readonly {
    directionKey: string;
    canvases: readonly { canvasKey: string; ordinal: number }[];
  }[],
): string[] {
  return directions.flatMap((direction) =>
    direction.canvases.map((canvas) =>
      campaignHandoffCanvasPrefix({
        campaignPrefix: "first-firing",
        directionKey: direction.directionKey,
        canvasOrdinal: canvas.ordinal,
        canvasKey: canvas.canvasKey,
      }),
    ),
  );
}

function file(path: string, base64: string): CampaignHandoffFile {
  return {
    path,
    mediaType: "application/octet-stream",
    byteSize: 2,
    sha256: "a".repeat(64),
    base64,
    approvalStatus: "unapproved",
  };
}
