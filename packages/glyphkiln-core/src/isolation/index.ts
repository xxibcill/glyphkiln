import { fork, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GlyphkilnError } from "../domain/types.js";
import {
  RENDER_WORKER_PROFILE,
  assertAssetResources,
  assertDesignInputResources,
  assertFontResources,
} from "../resources/index.js";
import {
  assertRenderGraphicOptionsResources,
  type RenderGraphicOptions,
  type RenderGraphicResult,
} from "../renderer/index.js";

export type IsolatedRenderOptions = {
  timeoutMilliseconds?: number;
};

type WorkerSuccess = {
  ok: true;
  result: RenderGraphicResult;
};

type WorkerFailure = {
  ok: false;
  error: {
    name: string;
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
};

type WorkerResponse = WorkerSuccess | WorkerFailure;

let renderQueue: Promise<void> = Promise.resolve();

export function renderGraphicIsolated(
  input: unknown,
  options: RenderGraphicOptions = {},
  isolation: IsolatedRenderOptions = {},
): Promise<RenderGraphicResult> {
  assertDesignInputResources(input);
  assertAssetResources(options.assets ?? []);
  assertFontResources(options.fonts ?? []);
  assertRenderGraphicOptionsResources(options);
  const timeoutMilliseconds = validateTimeout(isolation.timeoutMilliseconds);
  const render = renderQueue.then(
    () => runRenderProcess(input, options, timeoutMilliseconds),
    () => runRenderProcess(input, options, timeoutMilliseconds),
  );
  renderQueue = render.then(
    () => undefined,
    () => undefined,
  );
  return render;
}

function runRenderProcess(
  input: unknown,
  options: RenderGraphicOptions,
  timeoutMilliseconds: number,
): Promise<RenderGraphicResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = createRenderProcess();
    let settled = false;
    const timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGKILL");
        rejectPromise(
          new GlyphkilnError(
            `Isolated render exceeded ${timeoutMilliseconds} milliseconds.`,
            "RENDER_TIMEOUT",
            { maximum: timeoutMilliseconds },
          ),
        );
      });
    }, timeoutMilliseconds);

    child.once("message", (message: unknown) => {
      finish(() => {
        const response = parseWorkerResponse(message);
        if (response.ok) {
          resolvePromise(response.result);
          return;
        }
        rejectPromise(deserializeWorkerError(response.error));
      });
    });
    child.once("error", (error) => {
      finish(() => {
        rejectPromise(
          new GlyphkilnError(
            "The isolated render process could not be started.",
            "RENDER_PROCESS_FAILED",
            { cause: error.message },
          ),
        );
      });
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      finish(() => {
        rejectPromise(
          new GlyphkilnError(
            "The isolated render process exited without returning a result.",
            "RENDER_PROCESS_EXITED",
            { exitCode: code, signal },
          ),
        );
      });
    });
    child.send({ input, options }, (error) => {
      if (error === null) return;
      finish(() => {
        rejectPromise(
          new GlyphkilnError(
            "The render request could not be sent to the isolated process.",
            "RENDER_PROCESS_IPC_FAILED",
            { cause: error.message },
          ),
        );
      });
    });

    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      if (child.connected) child.disconnect();
      callback();
    }
  });
}

function createRenderProcess(): ChildProcess {
  const workerPath = fileURLToPath(new URL("./render-process.js", import.meta.url));
  if (!existsSync(workerPath)) {
    throw new GlyphkilnError(
      "The isolated render process is unavailable before the package is built.",
      "RENDER_PROCESS_NOT_BUILT",
      { entry: basename(workerPath) },
    );
  }
  const packageRoot = resolve(dirname(workerPath), "../..");
  const dependencyReadRoots = findDependencyReadRoots(packageRoot);
  return fork(workerPath, {
    serialization: "advanced",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    execArgv: [
      "--permission",
      "--allow-addons",
      `--allow-fs-read=${packageRoot}`,
      ...dependencyReadRoots.map((root) => `--allow-fs-read=${root}`),
      `--allow-fs-read=${tmpdir()}`,
      `--allow-fs-write=${tmpdir()}`,
      `--max-old-space-size=${RENDER_WORKER_PROFILE.nodeResourceLimits.maxOldGenerationSizeMb}`,
      `--max-semi-space-size=${Math.floor(
        RENDER_WORKER_PROFILE.nodeResourceLimits.maxYoungGenerationSizeMb / 3,
      )}`,
      `--stack-size=${RENDER_WORKER_PROFILE.nodeResourceLimits.stackSizeMb * 1_024}`,
    ],
  });
}

function findDependencyReadRoots(packageRoot: string): string[] {
  const roots = new Set<string>();
  for (const dependency of readDependencyNames(packageRoot)) {
    const entryPath = fileURLToPath(import.meta.resolve(dependency));
    const nodeModulesRoot = findAncestorNamed(entryPath, "node_modules");
    if (nodeModulesRoot === undefined) continue;
    roots.add(nodeModulesRoot);
    roots.add(realpathSync(nodeModulesRoot));
    const pnpmStoreRoot = findAncestorNamed(nodeModulesRoot, ".pnpm");
    if (pnpmStoreRoot !== undefined) roots.add(pnpmStoreRoot);
  }
  roots.delete(packageRoot);
  return [...roots].filter((root) => existsSync(root)).sort();
}

function readDependencyNames(packageRoot: string): string[] {
  const packageJson = JSON.parse(
    readFileSync(resolve(packageRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, unknown> };
  return Object.keys(packageJson.dependencies ?? {}).sort();
}

function findAncestorNamed(path: string, name: string): string | undefined {
  let current = path;
  while (dirname(current) !== current) {
    if (basename(current) === name) return current;
    current = dirname(current);
  }
  return undefined;
}

function validateTimeout(value: number | undefined): number {
  const timeout = value ?? RENDER_WORKER_PROFILE.timeoutMilliseconds;
  if (
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > RENDER_WORKER_PROFILE.timeoutMilliseconds
  ) {
    throw new GlyphkilnError(
      `Isolation timeout must be an integer from 1 to ${RENDER_WORKER_PROFILE.timeoutMilliseconds}.`,
      "INVALID_RENDER_TIMEOUT",
      { maximum: RENDER_WORKER_PROFILE.timeoutMilliseconds, actual: value },
    );
  }
  return timeout;
}

function parseWorkerResponse(value: unknown): WorkerResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    throw new GlyphkilnError(
      "The isolated render process returned an invalid response.",
      "INVALID_RENDER_PROCESS_RESPONSE",
    );
  }
  return value as WorkerResponse;
}

function deserializeWorkerError(error: WorkerFailure["error"]): Error {
  if (error.code !== undefined) {
    return new GlyphkilnError(error.message, error.code, error.details);
  }
  const restored = new Error(error.message);
  restored.name = error.name;
  return restored;
}
