import { readFile, writeFile } from "node:fs/promises";

const packageRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../", packageRoot);
const lock = JSON.parse(
  await readFile(new URL("package-lock.json", repositoryRoot), "utf8"),
);
const workspacePath = "packages/glyphkiln-core";
const workspace = lock.packages[workspacePath];
if (workspace === undefined) {
  throw new Error(`package-lock.json has no ${workspacePath} workspace entry.`);
}
const reviewedLicenseIdentifiers = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-3-Clause",
  "MIT",
  "MPL-2.0",
]);
const packages = new Map();
const visitedPaths = new Set();
const pendingDependencies = dependencyRecords(workspace).map((dependency) => ({
  requesterPath: workspacePath,
  ...dependency,
}));

while (pendingDependencies.length > 0) {
  const dependency = pendingDependencies.pop();
  const path = resolveDependencyPath(dependency.requesterPath, dependency.name);
  if (path === undefined && dependency.optional) continue;
  if (path === undefined) {
    throw new Error(`Cannot resolve production dependency ${dependency.name}.`);
  }
  if (visitedPaths.has(path)) continue;
  visitedPaths.add(path);

  const entry = lock.packages[path];
  const name = packageName(path);
  const license = entry.license;
  if (typeof license !== "string" || !reviewedLicenseIdentifiers.has(license)) {
    throw new Error(
      `Production package ${name}@${entry.version ?? "unknown"} has unreviewed license ${String(license)}.`,
    );
  }
  const key = `${name}\u0000${entry.version}`;
  const current = packages.get(key);
  packages.set(key, {
    name,
    version: entry.version,
    license,
    optional: current?.optional === false ? false : entry.optional === true,
  });

  for (const child of dependencyRecords(entry)) {
    pendingDependencies.push({ requesterPath: path, ...child });
  }
}

const inventory = {
  schemaVersion: "1.0.0",
  source: "package-lock.json#packages/glyphkiln-core",
  reviewPolicy:
    "Every production dependency must declare an SPDX identifier in the reviewed allowlist.",
  reviewedLicenseIdentifiers: [...reviewedLicenseIdentifiers].sort(),
  packages: [...packages.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name, "en-US") ||
      left.version.localeCompare(right.version, "en-US"),
  ),
};
const rendered = `${JSON.stringify(inventory, null, 2)}\n`;
const outputUrl = new URL("THIRD_PARTY_LICENSES.json", packageRoot);

if (process.argv.includes("--write")) {
  await writeFile(outputUrl, rendered, "utf8");
  process.stdout.write(
    `Wrote ${inventory.packages.length} production dependency license records.\n`,
  );
} else {
  const committed = await readFile(outputUrl, "utf8");
  if (committed !== rendered) {
    throw new Error("THIRD_PARTY_LICENSES.json is stale; run npm run licenses:update.");
  }
  process.stdout.write(
    `Verified ${inventory.packages.length} production dependency license records.\n`,
  );
}

function packageName(path) {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  return path.slice(index + marker.length);
}

function dependencyRecords(entry) {
  const required = new Set(Object.keys(entry.dependencies ?? {}));
  return [
    ...[...required].map((name) => ({ name, optional: false })),
    ...Object.keys(entry.optionalDependencies ?? {})
      .filter((name) => !required.has(name))
      .map((name) => ({ name, optional: true })),
  ];
}

function resolveDependencyPath(requesterPath, name) {
  let directory = requesterPath;

  while (true) {
    const candidate = `${directory.length > 0 ? `${directory}/` : ""}node_modules/${name}`;
    if (lock.packages[candidate] !== undefined) return candidate;

    const nestedNodeModules = directory.lastIndexOf("/node_modules/");
    if (nestedNodeModules >= 0) {
      directory = directory.slice(0, nestedNodeModules);
      continue;
    }
    if (directory.startsWith("node_modules/")) {
      directory = "";
      continue;
    }
    const separator = directory.lastIndexOf("/");
    if (separator >= 0) {
      directory = directory.slice(0, separator);
      continue;
    }
    if (directory.length > 0) {
      directory = "";
      continue;
    }
    return undefined;
  }
}
