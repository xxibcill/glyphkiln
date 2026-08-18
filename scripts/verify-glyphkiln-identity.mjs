import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const identityRoot = resolve(repositoryRoot, "assets/brand/glyphkiln");

const expectedIdentity = {
  schemaVersion: "1.0.0",
  brand: "Glyphkiln",
  status: "current",
  approvedAt: "2026-08-18",
  provenance:
    "Project-owner-provided SVGs explicitly approved as the current official logo.",
  primary: {
    path: "glyphkiln-mark.svg",
    mediaType: "image/svg+xml",
    background: "transparent",
    byteSize: 2308,
    sha256: "31c8729c0ba2512d9ef8697fa8da711ac6337d6f63b80bf7aa92dfc34bc13ba9",
  },
  variants: [
    {
      id: "on-ivory",
      path: "glyphkiln-mark-on-ivory.svg",
      mediaType: "image/svg+xml",
      background: "warm-ivory",
      byteSize: 1587,
      sha256: "2514f06f1a74f9d8f1ec826602ceb2dd339f498674cd1e7ca14961674e3732a3",
    },
  ],
};

const manifest = JSON.parse(
  await readFile(resolve(identityRoot, "identity.json"), "utf8"),
);
assert.deepEqual(
  manifest,
  expectedIdentity,
  "Glyphkiln identity manifest does not match the approved current identity.",
);

for (const asset of [expectedIdentity.primary, ...expectedIdentity.variants]) {
  const canonicalPath = resolve(identityRoot, asset.path);
  const deliverablePath = resolve(repositoryRoot, "Deliverables/svg", asset.path);
  const [canonicalBytes, deliverableBytes] = await Promise.all([
    readFile(canonicalPath),
    readFile(deliverablePath),
  ]);

  assert.equal(
    canonicalBytes.byteLength,
    asset.byteSize,
    `${asset.path} byte size changed.`,
  );
  assert.equal(
    sha256(canonicalBytes),
    asset.sha256,
    `${asset.path} does not match the approved official bytes.`,
  );
  assert.deepEqual(
    deliverableBytes,
    canonicalBytes,
    `Deliverables/svg/${asset.path} is not an exact copy of the official master.`,
  );
  assertSafeSvg(canonicalBytes.toString("utf8"), asset.path);
}

process.stdout.write(
  "Verified the current official Glyphkiln logo, approved variant, and deliverable copies.\n",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSafeSvg(svg, name) {
  assert.match(svg, /<svg\b/u, `${name} must contain an SVG root.`);
  assert.match(svg, /\bviewBox=/u, `${name} must declare a viewBox.`);
  assert.doesNotMatch(
    svg,
    /<(?:script|foreignObject|image|iframe|object|embed)\b/iu,
    `${name} contains disallowed active or embedded content.`,
  );
  assert.doesNotMatch(
    svg,
    /\b(?:href|xlink:href)\s*=/iu,
    `${name} contains a reference to another resource.`,
  );
  assert.doesNotMatch(
    svg,
    /<!DOCTYPE|<!ENTITY/iu,
    `${name} contains a disallowed XML declaration.`,
  );
}
