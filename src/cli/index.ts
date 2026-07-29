#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, stat, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  GlyphkilnError,
  inspectDesignDocument,
  RENDER_RESOURCE_LIMITS,
  renderGraphic,
  validateDesignDocument,
  type OutputFormat,
} from "../index.js";

type CliIo = {
  stdout(message: string): void;
  stderr(message: string): void;
};

const defaultIo: CliIo = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

export async function runCli(
  arguments_: readonly string[],
  io: CliIo = defaultIo,
): Promise<number> {
  try {
    const [command, inputPath, ...options] = arguments_;
    if (command === undefined || command === "--help" || command === "-h") {
      io.stdout(helpText());
      return 0;
    }
    if (command === "--version" || command === "-v") {
      io.stdout(packageVersion());
      return 0;
    }
    if (inputPath === undefined) {
      throw new CliUsageError(`Command "${command}" requires a design file.`);
    }
    const input = await readJson(inputPath);
    if (command === "validate") {
      return validateCommand(input, io);
    }
    if (command === "inspect") {
      io.stdout(JSON.stringify(inspectDesignDocument(input), null, 2));
      return 0;
    }
    if (command === "render") {
      return await renderCommand(input, options, io);
    }
    throw new CliUsageError(`Unknown command "${command}".`);
  } catch (error) {
    reportExpectedError(error, io);
    return 1;
  }
}

async function renderCommand(
  input: unknown,
  arguments_: readonly string[],
  io: CliIo,
): Promise<number> {
  const parsed = parseRenderArguments(arguments_);
  const result = await renderGraphic(input, {
    formats: [parsed.format],
  });
  const output = result.outputs[0]!;
  if (
    parsed.verifyFingerprint !== undefined &&
    parsed.verifyFingerprint !== output.fingerprint
  ) {
    throw new GlyphkilnError(
      `Fingerprint verification failed. Expected ${parsed.verifyFingerprint}, received ${output.fingerprint}.`,
      "FINGERPRINT_MISMATCH",
    );
  }
  const outputPath = resolve(parsed.outputPath);
  const manifestPath = !parsed.manifest
    ? undefined
    : resolve(parsed.manifestPath ?? `${parsed.outputPath}.manifest.json`);
  if (manifestPath === outputPath) {
    throw outputPathConflict(outputPath);
  }
  const files: PendingOutput[] = [{ path: outputPath, content: output.bytes }];
  if (manifestPath !== undefined) {
    files.push({
      path: manifestPath,
      content: `${JSON.stringify(output.manifest, null, 2)}\n`,
    });
  }
  await writeOutputs(files, parsed.force);
  if (manifestPath !== undefined) {
    io.stdout(
      `Manifest: ${parsed.manifestPath ?? `${parsed.outputPath}.manifest.json`}`,
    );
  }
  io.stdout(`Rendered ${parsed.format}: ${parsed.outputPath}`);
  io.stdout(`Fingerprint: ${output.fingerprint}`);
  return 0;
}

function validateCommand(input: unknown, io: CliIo): number {
  const result = validateDesignDocument(input);
  if (result.success) {
    io.stdout(`Valid Glyphkiln design document ${result.data.id} (schema 1.0.0).`);
    return 0;
  }
  io.stderr("Design document is invalid:");
  for (const problem of result.problems) {
    io.stderr(`  ${problem.path}: ${problem.message} [${problem.code}]`);
  }
  return 1;
}

type RenderArguments = {
  format: OutputFormat;
  outputPath: string;
  manifest: boolean;
  force: boolean;
  manifestPath?: string;
  verifyFingerprint?: string;
};

function parseRenderArguments(arguments_: readonly string[]): RenderArguments {
  let format: OutputFormat | undefined;
  let outputPath: string | undefined;
  let manifest = false;
  let force = false;
  let manifestPath: string | undefined;
  let verifyFingerprint: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--format") {
      const value = arguments_[++index];
      if (value !== "svg" && value !== "png") {
        throw new CliUsageError("--format must be svg or png.");
      }
      format = value;
    } else if (argument === "--output" || argument === "-o") {
      outputPath = requireOptionValue(arguments_[++index], argument);
    } else if (argument === "--manifest") {
      manifest = true;
      const candidate = arguments_[index + 1];
      if (candidate !== undefined && !candidate.startsWith("-")) {
        manifestPath = candidate;
        index += 1;
      }
    } else if (argument === "--verify") {
      verifyFingerprint = requireOptionValue(arguments_[++index], "--verify");
    } else if (argument === "--force") {
      force = true;
    } else {
      throw new CliUsageError(`Unknown render option "${argument}".`);
    }
  }
  if (format === undefined) {
    throw new CliUsageError("render requires --format svg or --format png.");
  }
  if (outputPath === undefined) {
    throw new CliUsageError("render requires --output <path>.");
  }
  return {
    format,
    outputPath,
    manifest,
    force,
    ...(manifestPath === undefined ? {} : { manifestPath }),
    ...(verifyFingerprint === undefined ? {} : { verifyFingerprint }),
  };
}

async function readJson(path: string): Promise<unknown> {
  const absolutePath = resolve(path);
  const displayPath = basename(path);
  let handle;
  try {
    handle = await open(absolutePath, "r");
    const buffer = Buffer.alloc(RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.byteLength) {
      const result = await handle.read(
        buffer,
        bytesRead,
        buffer.byteLength - bytesRead,
        null,
      );
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes) {
      throw new GlyphkilnError(
        `Design file exceeds ${RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes} bytes.`,
        "INPUT_FILE_BYTES_LIMIT_EXCEEDED",
        {
          maximum: RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes,
          file: displayPath,
        },
      );
    }
    return JSON.parse(buffer.toString("utf8", 0, bytesRead)) as unknown;
  } catch (error) {
    if (error instanceof GlyphkilnError) throw error;
    if (error instanceof SyntaxError) {
      throw new GlyphkilnError(
        `Could not parse JSON in ${displayPath}: ${error.message}`,
        "INVALID_JSON",
      );
    }
    throw new GlyphkilnError(`Could not read ${displayPath}.`, "INPUT_READ_FAILED", {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await handle?.close();
  }
}

function requireOptionValue(value: string | undefined, option: string): string {
  if (value === undefined || value.startsWith("-")) {
    throw new CliUsageError(`${option} requires a value.`);
  }
  return value;
}

type PendingOutput = {
  path: string;
  content: Uint8Array | string;
};

type OpenedOutput = PendingOutput & {
  handle: FileHandle;
  created: boolean;
};

async function writeOutputs(
  outputs: readonly PendingOutput[],
  force: boolean,
): Promise<void> {
  const opened: OpenedOutput[] = [];
  let writeStarted = false;
  try {
    for (const output of outputs) {
      await mkdir(dirname(output.path), { recursive: true });
      opened.push({ ...output, ...(await openOutput(output.path, force)) });
    }
    await assertDistinctOutputFiles(opened);
    writeStarted = true;
    for (const output of opened) {
      await output.handle.truncate(0);
      await output.handle.writeFile(output.content);
    }
  } catch (error) {
    const createdPaths = writeStarted
      ? []
      : opened.filter((output) => output.created).map((output) => output.path);
    await settleOutputClosures(opened);
    await Promise.allSettled(createdPaths.map((path) => unlink(path)));
    throw error;
  }
  await closeOutputs(opened);
}

async function openOutput(
  path: string,
  force: boolean,
): Promise<{ handle: FileHandle; created: boolean }> {
  if (await isDanglingSymbolicLink(path)) {
    throw new GlyphkilnError(
      `Output path "${basename(path)}" is a dangling symbolic link.`,
      "OUTPUT_PATH_DANGLING_SYMLINK",
      { file: basename(path) },
    );
  }
  try {
    return { handle: await open(path, "ax+"), created: true };
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") throw error;
    if (!force) throw outputExists(path);
    return { handle: await open(path, "a+"), created: false };
  }
}

async function assertDistinctOutputFiles(
  outputs: readonly OpenedOutput[],
): Promise<void> {
  const identities = await Promise.all(
    outputs.map(async (output) => ({
      path: output.path,
      identity: await output.handle.stat(),
    })),
  );
  for (let left = 0; left < identities.length; left += 1) {
    for (let right = left + 1; right < identities.length; right += 1) {
      const first = identities[left]!;
      const second = identities[right]!;
      if (
        first.identity.dev === second.identity.dev &&
        first.identity.ino === second.identity.ino
      ) {
        throw outputPathConflict(first.path);
      }
    }
  }
}

async function isDanglingSymbolicLink(path: string): Promise<boolean> {
  try {
    if (!(await lstat(path)).isSymbolicLink()) return false;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
  try {
    await stat(path);
    return false;
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ELOOP")) {
      return true;
    }
    throw error;
  }
}

async function closeOutputs(outputs: OpenedOutput[]): Promise<void> {
  const pending = outputs.splice(0);
  await Promise.all(pending.map((output) => output.handle.close()));
}

async function settleOutputClosures(outputs: OpenedOutput[]): Promise<void> {
  const pending = outputs.splice(0);
  await Promise.allSettled(pending.map((output) => output.handle.close()));
}

function outputExists(path: string): GlyphkilnError {
  return new GlyphkilnError(
    `Refusing to overwrite existing output "${basename(path)}"; pass --force to replace it.`,
    "OUTPUT_EXISTS",
    { file: basename(path) },
  );
}

function outputPathConflict(path: string): GlyphkilnError {
  return new GlyphkilnError(
    "The rendered output and manifest must use different paths.",
    "OUTPUT_PATH_CONFLICT",
    { file: basename(path) },
  );
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

function reportExpectedError(error: unknown, io: CliIo): void {
  if (error instanceof CliUsageError) {
    io.stderr(`Error: ${error.message}`);
    io.stderr("Run glyphkiln --help for usage.");
    return;
  }
  if (error instanceof GlyphkilnError) {
    io.stderr(`Error [${error.code}]: ${error.message}`);
    const problems = error.details?.["problems"];
    if (Array.isArray(problems)) {
      for (const problem of problems) {
        if (isValidationProblem(problem)) {
          io.stderr(`  ${problem.path}: ${problem.message}`);
        }
      }
    }
    const issues = error.details?.["issues"];
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        if (isQualityIssue(issue)) {
          io.stderr(
            `  ${issue.severity.toUpperCase()} ${issue.code}${issue.layerId === undefined ? "" : ` (${issue.layerId})`}: ${issue.message}`,
          );
        }
      }
    }
    return;
  }
  io.stderr(
    `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function isValidationProblem(
  value: unknown,
): value is { path: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["path"] === "string" &&
    typeof (value as Record<string, unknown>)["message"] === "string"
  );
}

function isQualityIssue(value: unknown): value is {
  severity: "warning" | "error";
  code: string;
  message: string;
  layerId?: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  return (
    (issue["severity"] === "warning" || issue["severity"] === "error") &&
    typeof issue["code"] === "string" &&
    typeof issue["message"] === "string"
  );
}

function helpText(): string {
  return `Glyphkiln Core deterministic renderer

Usage:
  glyphkiln validate <design.json>
  glyphkiln inspect <design.json>
  glyphkiln --version
  glyphkiln render <design.json> --format <svg|png> --output <path>
      [--manifest [path]] [--verify <fingerprint>] [--force]`;
}

class CliUsageError extends Error {}

function packageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new GlyphkilnError(
      "Installed package metadata does not contain a version.",
      "PACKAGE_VERSION_UNAVAILABLE",
    );
  }
  return packageJson.version;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(invokedPath)).href
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
