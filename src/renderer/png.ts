import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import type { ResolvedFont } from "../domain/types.js";

export async function rasterizeSvg(
  svg: string,
  fonts: readonly ResolvedFont[],
): Promise<Uint8Array> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "glyphkiln-render-fonts-"));
  try {
    const fontFiles = await writeFonts(temporaryDirectory, fonts);
    const renderer = new Resvg(svg, {
      font: {
        fontFiles,
        loadSystemFonts: false,
        defaultFontFamily: fonts[0]?.family ?? "Inter",
      },
      fitTo: { mode: "original" },
      shapeRendering: 2,
      textRendering: 2,
      imageRendering: 0,
      logLevel: "error",
    });
    return new Uint8Array(renderer.render().asPng());
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function writeFonts(
  directory: string,
  fonts: readonly ResolvedFont[],
): Promise<string[]> {
  const unique = new Map<string, ResolvedFont>();
  for (const font of fonts) {
    unique.set(font.sha256 ?? `${font.family}-${font.weight}-${font.style}`, font);
  }
  return Promise.all(
    [...unique.values()].map(async (font, index) => {
      const path = join(directory, `font-${index}.ttf`);
      await writeFile(path, font.bytes);
      return path;
    }),
  );
}
