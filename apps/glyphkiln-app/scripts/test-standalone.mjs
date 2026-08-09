import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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

import { appRoot, readStandaloneLayout, stagedCoreRoot } from "./standalone-paths.mjs";

const REQUIRED_CORE_DISTRIBUTION_FILES = [
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_LICENSES.json",
  "assets/fonts/OFL.txt",
  "vendor/unicode/LICENSE.txt",
];
const HTTP_REQUEST_TIMEOUT_MS = 15_000;

const layout = await readStandaloneLayout();
await assert.rejects(
  access(stagedCoreRoot),
  (error) => error?.code === "ENOENT",
  "The build must remove its temporary Core package stage.",
);
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
await verifyWorkerBundle(layout.standaloneAppRoot);
await verifyBuildInputsArePruned(layout.standaloneAppRoot);
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
  await verifyDistributionFiles(isolatedStandaloneRoot, isolatedCoreRoot);
  await verifyContainedRuntime(isolatedStandaloneRoot, isolatedCoreRoot);
  await verifyIsolatedWorkerRuntime(isolatedAppRoot);
  await verifyStandaloneRuntime(isolatedAppRoot);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function verifyDistributionFiles(isolatedStandaloneRoot, isolatedCoreRoot) {
  await assertNonEmptyFile(
    join(isolatedStandaloneRoot, "LICENSE"),
    "The standalone distribution must retain the application license.",
  );
  for (const relativePath of REQUIRED_CORE_DISTRIBUTION_FILES) {
    await assertNonEmptyFile(
      join(isolatedCoreRoot, relativePath),
      `The standalone Core package must retain ${relativePath}.`,
    );
  }
}

async function assertNonEmptyFile(path, message) {
  const bytes = await readFile(path);
  assert.ok(bytes.byteLength > 0, message);
}

async function verifyWorkerBundle(standaloneAppRoot) {
  const packagedWorkerRoot = join(standaloneAppRoot, ".worker");
  await assertNonEmptyFile(
    join(packagedWorkerRoot, "worker.mjs"),
    "The standalone build must include the executable render worker.",
  );
  const sourceMigrationRoot = join(
    appRoot,
    "src",
    "server",
    "persistence",
    "migrations",
  );
  const sourceMigrations = (await readdir(sourceMigrationRoot))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const packagedMigrations = (await readdir(join(packagedWorkerRoot, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.deepEqual(
    packagedMigrations,
    sourceMigrations,
    "The standalone worker must include every checked-in SQL migration.",
  );
  for (const migration of sourceMigrations) {
    assert.deepEqual(
      await readFile(join(packagedWorkerRoot, "migrations", migration)),
      await readFile(join(sourceMigrationRoot, migration)),
      `The packaged worker migration ${migration} must match its source.`,
    );
  }
}

async function verifyIsolatedWorkerRuntime(isolatedAppRoot) {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.NODE_PATH;
  const worker = spawn(
    process.execPath,
    [join(isolatedAppRoot, ".worker", "worker.mjs"), "--healthcheck"],
    {
      cwd: isolatedAppRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const output = [];
  worker.stdout.on("data", (chunk) => output.push(String(chunk)));
  worker.stderr.on("data", (chunk) => output.push(String(chunk)));
  const exitCode = await Promise.race([
    new Promise((resolveExit, rejectExit) => {
      worker.once("error", rejectExit);
      worker.once("exit", resolveExit);
    }),
    delay(5_000).then(() => {
      worker.kill("SIGKILL");
      throw new Error(
        "The isolated render worker did not validate its runtime in time.",
      );
    }),
  ]);
  const combinedOutput = output.join("");
  assert.notEqual(
    exitCode,
    0,
    "The isolated worker smoke test must stop at its intentionally absent database configuration.",
  );
  assert.match(
    combinedOutput,
    /DATABASE_URL is required for the render worker\./,
    `The isolated worker must load its complete runtime before validating configuration.\n${combinedOutput}`,
  );
  assert.doesNotMatch(
    combinedOutput,
    /ERR_MODULE_NOT_FOUND|Cannot find package/,
    `The isolated worker must not depend on workspace packages.\n${combinedOutput}`,
  );
}

async function verifyBuildInputsArePruned(standaloneAppRoot) {
  for (const relativePath of [
    "Dockerfile",
    "next.config.ts",
    "scripts",
    "src/app",
    "src/features",
    "src/server/app-workflow",
    "src/server/render-worker",
    "src/test",
    "tsconfig.json",
    "vitest.config.ts",
  ]) {
    await assert.rejects(
      access(join(standaloneAppRoot, relativePath)),
      (error) => error?.code === "ENOENT",
      `The standalone runtime must exclude build-only path ${relativePath}.`,
    );
  }
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
    await verifyLegacyPreviewIsClosed(origin, server);
    process.stdout.write(
      `Isolated standalone application served ${assetPaths.length} static assets and kept the legacy anonymous renderer closed.\n`,
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

async function verifyLegacyPreviewIsClosed(originUrl, server) {
  const previewResponse = await fetch(new URL("/api/preview", originUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MS),
  });
  const preview = await previewResponse.json();
  assert.equal(
    previewResponse.status,
    410,
    `The isolated legacy preview route must remain closed: ${JSON.stringify(preview)}\n${server.output}`,
  );
  assert.equal(preview.ok, false);
  assert.equal(preview.code, "LEGACY_PREVIEW_DISABLED");
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
        signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MS),
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
