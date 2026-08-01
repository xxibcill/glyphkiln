import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function loadExampleAssets(document) {
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
