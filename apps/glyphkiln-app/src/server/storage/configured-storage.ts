import { FileSystemRenderBlobStorage } from "./filesystem-render-blob-storage";
import type { RenderBlobStorage } from "./content-addressed-storage";

export function createRenderBlobStorageFromEnvironment(
  environment: NodeJS.ProcessEnv,
): RenderBlobStorage {
  return new FileSystemRenderBlobStorage(readStorageRootFromEnvironment(environment));
}

export function readStorageRootFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const root = environment.GLYPHKILN_STORAGE_ROOT?.trim();
  if (root === undefined || root === "") {
    throw new Error("GLYPHKILN_STORAGE_ROOT is required for immutable render storage.");
  }
  return root;
}
