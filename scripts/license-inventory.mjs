import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
const reviewedLicenseIdentifiers = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-3-Clause",
  "MIT",
  "MPL-2.0",
]);
const packages = new Map();

for (const [path, entry] of Object.entries(lock.packages)) {
  if (path === "" || entry.dev === true) continue;
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
}

const inventory = {
  schemaVersion: "1.0.0",
  source: "package-lock.json",
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
const outputUrl = new URL("THIRD_PARTY_LICENSES.json", root);

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
