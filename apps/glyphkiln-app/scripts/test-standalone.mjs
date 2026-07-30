import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { appRoot, readStandaloneLayout } from "./standalone-paths.mjs";

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
  await cp(layout.standaloneRoot, isolatedStandaloneRoot, { recursive: true });
  const isolatedAppRoot = join(isolatedStandaloneRoot, layout.relativeAppDir);
  await verifyStandaloneRuntime(isolatedAppRoot);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function verifyStartCommand(relativeAppDir) {
  const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
  const portableAppDirectory = relativeAppDir.replaceAll("\\", "/");
  assert.equal(
    packageJson.scripts?.start,
    `node .next/standalone/${portableAppDirectory}/server.js`,
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
    process.stdout.write(
      `Isolated standalone application served ${assetPaths.length} static assets.\n`,
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
  const child = spawn(process.execPath, [join(isolatedAppRoot, "server.js")], {
    cwd: isolatedAppRoot,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
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
