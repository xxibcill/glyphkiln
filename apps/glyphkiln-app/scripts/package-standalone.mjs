import { access, cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  appRoot,
  readStandaloneLayout,
  repositoryRoot,
  stagedCoreRoot,
} from "./standalone-paths.mjs";

const CORE_DISTRIBUTION_FILES = [
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_LICENSES.json",
  "assets/fonts/OFL.txt",
  "vendor/unicode/LICENSE.txt",
];

const { standaloneAppRoot, standaloneCoreRoot, standaloneRoot } =
  await readStandaloneLayout();
await copyRequiredDirectory(
  join(appRoot, ".next/static"),
  join(standaloneAppRoot, ".next/static"),
);
await copyOptionalDirectory(join(appRoot, "public"), join(standaloneAppRoot, "public"));
await copyRequiredFile(
  join(appRoot, "scripts/start-standalone.mjs"),
  join(standaloneAppRoot, "start.mjs"),
);
await copyRequiredFile(
  join(appRoot, "scripts/runtime-hostname.mjs"),
  join(standaloneAppRoot, "runtime-hostname.mjs"),
);
await copyRequiredFile(
  join(repositoryRoot, "LICENSE"),
  join(standaloneRoot, "LICENSE"),
);
await packageCoreRuntime(standaloneCoreRoot);

process.stdout.write("Packaged standalone application assets and Core runtime.\n");

async function packageCoreRuntime(destinationRoot) {
  const runtimeFiles = new Set(await readTracedCoreRuntimeFiles());
  for (const relativePath of CORE_DISTRIBUTION_FILES) {
    runtimeFiles.add(relativePath);
  }
  await rm(destinationRoot, { recursive: true, force: true });
  for (const relativePath of [...runtimeFiles].sort()) {
    await copyRequiredFile(
      join(stagedCoreRoot, relativePath),
      join(destinationRoot, relativePath),
    );
  }
}

async function readTracedCoreRuntimeFiles() {
  const traceRoot = join(appRoot, ".next", "server");
  const traceManifests = await findTraceManifests(traceRoot);
  const runtimeFiles = new Set();
  for (const manifestPath of traceManifests) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!Array.isArray(manifest.files)) {
      throw new Error(`Invalid Next.js file trace: ${manifestPath}`);
    }
    for (const tracedPath of manifest.files) {
      if (typeof tracedPath !== "string") continue;
      const source = resolve(dirname(manifestPath), tracedPath);
      const relativePath = relative(stagedCoreRoot, source);
      if (!isContainedPath(relativePath)) continue;
      runtimeFiles.add(relativePath);
    }
  }
  if (!runtimeFiles.has("package.json")) {
    throw new Error("Next.js did not trace the external Core package.");
  }
  return [...runtimeFiles].sort();
}

async function findTraceManifests(root) {
  await access(root);
  const manifests = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".nft.json")) {
        manifests.push(path);
      }
    }
  }
  return manifests.sort();
}

async function copyRequiredFile(source, destination) {
  await access(source);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

function isContainedPath(path) {
  return (
    path.length > 0 &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

async function copyRequiredDirectory(source, destination) {
  await access(source);
  await replaceDirectory(source, destination);
}

async function copyOptionalDirectory(source, destination) {
  try {
    await access(source);
  } catch (error) {
    if (error?.code === "ENOENT") {
      await rm(destination, { recursive: true, force: true });
      return;
    }
    throw error;
  }
  await replaceDirectory(source, destination);
}

async function replaceDirectory(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}
