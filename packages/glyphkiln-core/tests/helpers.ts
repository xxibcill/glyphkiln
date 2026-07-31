import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { DesignDocument } from "../src/index.js";

export { loadExampleAssets } from "../scripts/example-assets.mjs";

export async function loadExample(name: string): Promise<DesignDocument> {
  const path = resolve(`examples/${name}.json`);
  return JSON.parse(await readFile(path, "utf8")) as DesignDocument;
}

export function cloneDocument(document: DesignDocument): DesignDocument {
  return structuredClone(document);
}
