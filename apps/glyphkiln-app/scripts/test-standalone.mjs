import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { appRoot, readStandaloneLayout } from "./standalone-paths.mjs";

const PRODUCT_ANNOUNCEMENT_DOCUMENT = {
  schemaVersion: "1.0.0",
  id: "example-product-announcement",
  template: {
    id: "product-announcement",
    version: "1.1.1",
  },
  format: "linkedin-landscape",
  seed: "launch-analytics-01",
  mode: "dark",
  brand: {
    snapshotId: "brand-glyphkiln-2026-07",
    version: "1.0.0",
    name: "Glyphkiln",
    palette: {
      primary: "#6C5CE7",
      secondary: "#00B894",
      accent: "#FDCB6E",
      neutrals: ["#0B1020", "#F7F8FC"],
    },
    themes: {
      light: {
        background: "#F7F8FC",
        surface: "#FFFFFF",
        text: "#0B1020",
        mutedText: "#47506A",
      },
      dark: {
        background: "#0B1020",
        surface: "#171D32",
        text: "#F7F8FC",
        mutedText: "#B8C0D9",
      },
    },
    typography: {
      headlineFamily: "Inter",
      bodyFamily: "Inter",
      monospaceFamily: "Inter",
    },
    spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
    borderRadii: [0, 16, 28],
    visualDensity: "balanced",
    preferredProceduralStyles: ["layered-waves", "flow-field"],
    safeArea: {
      top: 0.07,
      right: 0.07,
      bottom: 0.07,
      left: 0.07,
    },
    prohibitedColors: [],
    prohibitedStyles: ["photorealistic-ai"],
  },
  assets: [],
  fonts: [
    {
      family: "Inter",
      weight: 400,
      style: "normal",
      sha256: "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
    },
    {
      family: "Inter",
      weight: 700,
      style: "normal",
      sha256: "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
    },
    {
      family: "Inter",
      weight: 800,
      style: "normal",
      sha256: "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
    },
  ],
  layers: [
    {
      id: "background",
      type: "background",
    },
    {
      id: "waves",
      type: "procedural-decoration",
      style: "layered-waves",
      intensity: 0.58,
      density: 0.62,
      complexity: 0.48,
      contrast: 0.55,
      quietRegion: {
        x: 0.04,
        y: 0.12,
        width: 0.7,
        height: 0.62,
      },
    },
    {
      id: "eyebrow",
      type: "eyebrow",
      text: "NOW IN PUBLIC BETA",
    },
    {
      id: "headline",
      type: "headline",
      text: "Ship on-brand graphics from deterministic code",
    },
    {
      id: "subtitle",
      type: "subtitle",
      text: "One structured design document. Reproducible SVG, PNG, and provenance.",
    },
    {
      id: "cta",
      type: "cta",
      text: "Explore Glyphkiln Core →",
    },
  ],
  metadata: {
    campaign: "public-beta",
    reviewed: true,
  },
};

const EXPECTED_OUTPUT_INTEGRITY = {
  svg: {
    byteSize: 106381,
    sha256: "c0a2fcd75feeab8c3cc95da749d09dac95bfbc6fc9c734185a9f7b51900f9b08",
  },
  png: {
    byteSize: 67486,
    sha256: "49a5a41690ea772bd80d356f97cb851258ac2d25ccc3e43e4821ad321a8a0124",
  },
};

const layout = await readStandaloneLayout();
const serverPath = join(layout.standaloneAppRoot, "server.js");
const staticAssetsPath = join(layout.standaloneAppRoot, ".next/static");
await assert.doesNotReject(
  access(serverPath),
  "The standalone build must include its generated server.",
);
await assert.doesNotReject(
  access(staticAssetsPath),
  "The standalone build must include its static assets.",
);
await verifyStartCommand(layout.relativeAppDir);

const temporaryRoot = await mkdtemp(join(tmpdir(), "glyphkiln-standalone-"));
try {
  const isolatedStandaloneRoot = join(temporaryRoot, "standalone");
  await cp(layout.standaloneRoot, isolatedStandaloneRoot, {
    recursive: true,
    verbatimSymlinks: true,
  });
  const isolatedAppRoot = join(isolatedStandaloneRoot, layout.relativeAppDir);
  const isolatedCoreRoot = join(isolatedAppRoot, "node_modules", "@glyphkiln", "core");
  await verifyContainedRuntime(isolatedStandaloneRoot, isolatedCoreRoot);
  await verifyStandaloneRuntime(isolatedAppRoot);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function verifyStartCommand(relativeAppDir) {
  const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
  const portableAppDirectory = relativeAppDir.replaceAll("\\", "/");
  assert.equal(
    packageJson.scripts?.start,
    `node .next/standalone/${portableAppDirectory}/start.mjs`,
  );
}

async function verifyStandaloneRuntime(isolatedAppRoot) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await verifyRuntimeAttempt(isolatedAppRoot);
    } catch (error) {
      if (attempt === 3 || !String(error).includes("EADDRINUSE")) {
        throw error;
      }
    }
  }
}

async function verifyRuntimeAttempt(isolatedAppRoot) {
  const port = await findAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = startApplication(isolatedAppRoot, port);
  try {
    const home = await waitForApplication(server, origin);
    assert.equal(home.status, 200);
    const assetPaths = extractStaticAssetPaths(await home.text());
    assert.ok(assetPaths.length > 0, "The home page must reference static assets.");
    await verifyStaticAssets(origin, assetPaths);
    await verifyPreviewRoute(origin, server);
    process.stdout.write(
      `Isolated standalone application served ${assetPaths.length} static assets and rendered SVG+PNG.\n`,
    );
  } finally {
    await stopApplication(server);
  }
}

async function findAvailablePort() {
  const listener = createServer();
  await new Promise((resolveListen, rejectListen) => {
    listener.once("error", rejectListen);
    listener.listen(0, "127.0.0.1", resolveListen);
  });
  const address = listener.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await new Promise((resolveClose) => listener.close(resolveClose));
  return address.port;
}

function startApplication(isolatedAppRoot, portNumber) {
  const environment = { ...process.env };
  delete environment.NODE_PATH;
  delete environment.HOSTNAME;
  delete environment.GLYPHKILN_HOSTNAME;
  const child = spawn(process.execPath, [join(isolatedAppRoot, "start.mjs")], {
    cwd: isolatedAppRoot,
    env: {
      ...environment,
      PORT: String(portNumber),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = [];
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  return {
    child,
    exited,
    get output() {
      return output.join("");
    },
  };
}

async function verifyContainedRuntime(isolatedStandaloneRoot, isolatedCoreRoot) {
  const canonicalStandaloneRoot = await realpath(isolatedStandaloneRoot);
  const coreStats = await lstat(isolatedCoreRoot);
  assert.equal(
    coreStats.isSymbolicLink(),
    false,
    "The packaged Core runtime must be a real directory, not the workspace symlink.",
  );
  assertPathInside(
    canonicalStandaloneRoot,
    await realpath(isolatedCoreRoot),
    "The packaged Core runtime must resolve inside the isolated standalone copy.",
  );

  const pending = [isolatedStandaloneRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.isSymbolicLink()) continue;
      assertPathInside(
        canonicalStandaloneRoot,
        await realpath(path),
        `Standalone symlink "${path}" must not escape the isolated copy.`,
      );
    }
  }
}

function assertPathInside(root, target, message) {
  const relativeTarget = relative(root, target);
  assert.equal(
    relativeTarget === ".." ||
      relativeTarget.startsWith(`..${sep}`) ||
      isAbsolute(relativeTarget),
    false,
    message,
  );
}

async function verifyPreviewRoute(originUrl, server) {
  const previewResponse = await fetch(new URL("/api/preview", originUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(PRODUCT_ANNOUNCEMENT_DOCUMENT),
    signal: AbortSignal.timeout(30_000),
  });
  const preview = await previewResponse.json();
  assert.equal(
    previewResponse.status,
    200,
    `The isolated preview render must succeed: ${JSON.stringify(preview)}\n${server.output}`,
  );
  assert.equal(preview.ok, true);
  assert.equal(preview.document?.id, PRODUCT_ANNOUNCEMENT_DOCUMENT.id);
  assert.ok(Array.isArray(preview.outputs));
  assert.equal(preview.outputs.length, 2);

  const outputByFormat = new Map(
    preview.outputs.map((output) => [output.format, output]),
  );
  assert.deepEqual([...outputByFormat.keys()].sort(), ["png", "svg"]);
  verifyPreviewOutput(
    outputByFormat.get("svg"),
    "svg",
    "image/svg+xml",
    EXPECTED_OUTPUT_INTEGRITY.svg,
  );
  verifyPreviewOutput(
    outputByFormat.get("png"),
    "png",
    "image/png",
    EXPECTED_OUTPUT_INTEGRITY.png,
  );

  const invalidResponse = await fetch(new URL("/api/preview", originUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5_000),
  });
  const invalid = await invalidResponse.json();
  assert.equal(invalidResponse.status, 422);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "INVALID_DESIGN_DOCUMENT");
  assert.ok(
    Array.isArray(invalid.problems) && invalid.problems.length > 0,
    "Invalid preview input must include Core validation problems.",
  );
}

function verifyPreviewOutput(output, format, mimeType, expectedIntegrity) {
  assert.notEqual(output, undefined, `The ${format} output must be present.`);
  assert.equal(output.format, format);
  assert.equal(output.mimeType, mimeType);
  assert.equal(typeof output.base64, "string");
  const bytes = Buffer.from(output.base64, "base64");
  assert.ok(bytes.byteLength > 0);
  assert.equal(bytes.byteLength, expectedIntegrity.byteSize);
  assert.equal(output.byteSize, bytes.byteLength);
  assert.equal(output.manifest?.output?.format, format);
  assert.equal(output.manifest?.output?.byteSize, bytes.byteLength);
  assert.equal(output.manifest?.output?.sha256, expectedIntegrity.sha256);
  assert.equal(output.manifest?.output?.sha256, sha256(bytes));
  assert.equal(output.manifest?.renderFingerprint, output.fingerprint);
  assert.equal(output.manifest?.designDocumentId, PRODUCT_ANNOUNCEMENT_DOCUMENT.id);
  if (format === "svg") {
    assert.match(bytes.subarray(0, 128).toString("utf8"), /^<svg\b/);
    return;
  }
  assert.deepEqual(
    bytes.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function waitForApplication(server, originUrl) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`Application exited during startup.\n${server.output}`);
    }
    try {
      return await fetch(originUrl, { signal: AbortSignal.timeout(500) });
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Application did not start in time.\n${server.output}`);
}

function extractStaticAssetPaths(html) {
  const paths = [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map(
    (match) => match[1],
  );
  return [...new Set(paths)];
}

async function verifyStaticAssets(originUrl, assetPaths) {
  await Promise.all(
    assetPaths.map(async (assetPath) => {
      const response = await fetch(new URL(assetPath, originUrl), {
        signal: AbortSignal.timeout(5_000),
      });
      assert.equal(response.status, 200, `${assetPath} must be available.`);
      assert.ok(
        (await response.arrayBuffer()).byteLength > 0,
        `${assetPath} must not be empty.`,
      );
    }),
  );
}

async function stopApplication(server) {
  if (server.child.exitCode !== null) {
    return;
  }
  server.child.kill("SIGTERM");
  const exited = await Promise.race([
    server.exited.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!exited) {
    server.child.kill("SIGKILL");
    await server.exited;
  }
}
