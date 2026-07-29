#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { open, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output.bytes);
  if (parsed.manifest) {
    const manifestPath = resolve(
      parsed.manifestPath ?? `${parsed.outputPath}.manifest.json`,
    );
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      `${JSON.stringify(output.manifest, null, 2)}\n`,
      "utf8",
    );
    io.stdout(`Manifest: ${manifestPath}`);
  }
  io.stdout(`Rendered ${parsed.format}: ${outputPath}`);
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
  manifestPath?: string;
  verifyFingerprint?: string;
};

function parseRenderArguments(arguments_: readonly string[]): RenderArguments {
  let format: OutputFormat | undefined;
  let outputPath: string | undefined;
  let manifest = false;
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
    ...(manifestPath === undefined ? {} : { manifestPath }),
    ...(verifyFingerprint === undefined ? {} : { verifyFingerprint }),
  };
}

async function readJson(path: string): Promise<unknown> {
  const absolutePath = resolve(path);
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
          path: absolutePath,
        },
      );
    }
    return JSON.parse(buffer.toString("utf8", 0, bytesRead)) as unknown;
  } catch (error) {
    if (error instanceof GlyphkilnError) throw error;
    if (error instanceof SyntaxError) {
      throw new GlyphkilnError(
        `Could not parse JSON in ${absolutePath}: ${error.message}`,
        "INVALID_JSON",
      );
    }
    throw new GlyphkilnError(`Could not read ${absolutePath}.`, "INPUT_READ_FAILED", {
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
  glyphkiln render <design.json> --format <svg|png> --output <path>
      [--manifest [path]] [--verify <fingerprint>]`;
}

class CliUsageError extends Error {}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(invokedPath)).href
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
