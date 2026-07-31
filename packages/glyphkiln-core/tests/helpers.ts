import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { DesignDocument, ResolvedAsset } from "../src/index.js";

export async function loadExample(name: string): Promise<DesignDocument> {
  const path = resolve(`examples/${name}.json`);
  return JSON.parse(await readFile(path, "utf8")) as DesignDocument;
}

export function cloneDocument(document: DesignDocument): DesignDocument {
  return structuredClone(document);
}

export async function loadExampleAssets(
  document: DesignDocument,
): Promise<ResolvedAsset[]> {
  return Promise.all(
    document.assets.map(async (asset) => ({
      ...asset,
      bytes: new Uint8Array(
        await readFile(
          resolve(
            `examples/assets/${asset.id}.${asset.mimeType === "image/png" ? "png" : "jpg"}`,
          ),
        ),
      ),
    })),
  );
}
