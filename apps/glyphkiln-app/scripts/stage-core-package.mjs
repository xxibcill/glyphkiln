import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import { appRoot, stagedCoreRoot } from "./standalone-paths.mjs";

const execFileAsync = promisify(execFile);
const stageMarker = join(stagedCoreRoot, ".glyphkiln-temporary-stage");

export async function stageCorePackage() {
  if (await pathExists(stageMarker)) {
    await rm(stagedCoreRoot, { recursive: true, force: true });
  }
  const sourceRoot = resolveInstalledCoreRoot();
  if (resolve(sourceRoot) === resolve(stagedCoreRoot)) return;

  const publicFiles = await readCorePacklist(sourceRoot);
  await rm(stagedCoreRoot, { recursive: true, force: true });
  await mkdir(stagedCoreRoot, { recursive: true });
  await writeFile(stageMarker, "temporary build stage\n");
  for (const relativePath of publicFiles) {
    await copyPublicPackageFile(sourceRoot, relativePath);
  }
}

export async function removeCorePackageStage() {
  if (await pathExists(stageMarker)) {
    await rm(stagedCoreRoot, { recursive: true, force: true });
  }
}

function resolveInstalledCoreRoot() {
  const require = createRequire(join(appRoot, "package.json"));
  return dirname(require.resolve("@glyphkiln/core/package.json"));
}

async function readCorePacklist(sourceRoot) {
  const npmCli = process.env.npm_execpath;
  if (npmCli === undefined || npmCli.length === 0) {
    throw new Error("The app build must run through npm so Core can be staged.");
  }
  const { stdout } = await execFileAsync(
    process.execPath,
    [npmCli, "pack", "--json", "--dry-run", "--ignore-scripts", sourceRoot],
    { cwd: appRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  const manifests = JSON.parse(stdout);
  const manifest = Array.isArray(manifests) ? manifests[0] : undefined;
  if (
    manifest?.name !== "@glyphkiln/core" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    throw new Error("npm did not report a valid @glyphkiln/core package artifact.");
  }
  return manifest.files.map((file) => {
    if (typeof file?.path !== "string" || !isContainedPath(file.path)) {
      throw new Error("npm reported an invalid Core package path.");
    }
    return file.path;
  });
}

async function copyPublicPackageFile(sourceRoot, relativePath) {
  const source = join(sourceRoot, relativePath);
  const destination = join(stagedCoreRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

function isContainedPath(path) {
  return (
    path.length > 0 &&
    path !== ".." &&
    !path.startsWith("../") &&
    !path.startsWith("..\\") &&
    !isAbsolute(path)
  );
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
