import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repositoryRoot = resolve(appRoot, "../..");
export const corePackageRoot = join(repositoryRoot, "packages", "glyphkiln-core");
export const stagedCoreRoot = join(appRoot, "node_modules", "@glyphkiln", "core");

export async function readStandaloneLayout() {
  const manifestPath = join(appRoot, ".next/required-server-files.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { relativeAppDir } = manifest;
  if (typeof relativeAppDir !== "string" || relativeAppDir.length === 0) {
    throw new Error("Next.js did not report a relative application directory.");
  }

  const standaloneRoot = join(appRoot, ".next/standalone");
  const standaloneAppRoot = resolve(standaloneRoot, relativeAppDir);
  const relativeStandaloneApp = relative(standaloneRoot, standaloneAppRoot);
  if (
    relativeStandaloneApp === ".." ||
    relativeStandaloneApp.startsWith(`..${sep}`) ||
    isAbsolute(relativeStandaloneApp)
  ) {
    throw new Error("Next.js reported an invalid standalone application path.");
  }

  return {
    relativeAppDir,
    standaloneAppRoot,
    standaloneCoreRoot: join(standaloneAppRoot, "node_modules", "@glyphkiln", "core"),
    standaloneRoot,
  };
}
