import { execFile } from "node:child_process";
import { link, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { RENDER_RESOURCE_LIMITS } from "../src/index.js";
import { runCli } from "../src/cli/index.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
  };
}

describe("CLI", () => {
  it("validates a design", async () => {
    const capture = captureIo();
    const code = await runCli(
      ["validate", resolve("examples/product-announcement.json")],
      capture.io,
    );
    expect(code).toBe(0);
    expect(capture.stdout.join("\n")).toContain("Valid Glyphkiln design");
  });

  it("reports actionable validation errors without a stack trace", async () => {
    const capture = captureIo();
    const code = await runCli(
      ["validate", resolve("fixtures/formats/square.json")],
      capture.io,
    );
    expect(code).toBe(1);
    expect(capture.stderr.join("\n")).toContain("schemaVersion");
    expect(capture.stderr.join("\n")).not.toContain("at ");
  });

  it("inspects a design", async () => {
    const capture = captureIo();
    const code = await runCli(
      ["inspect", resolve("examples/quote-card.json")],
      capture.io,
    );
    expect(code).toBe(0);
    const inspection = JSON.parse(capture.stdout.join("\n")) as {
      template: { id: string; supportedLayers: string[] };
      dimensions: { width: number; height: number };
    };
    expect(inspection.template.id).toBe("quote-card");
    expect(inspection.template.supportedLayers).toContain("attribution");
    expect(inspection.template.supportedLayers).not.toContain("chart");
    expect(inspection.dimensions).toEqual({ width: 1080, height: 1350 });
  });

  it("renders output and a manifest, then verifies the fingerprint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "glyphkiln-cli-test-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "graphic.svg");
    const manifest = join(directory, "manifest.json");
    const firstCapture = captureIo();
    const firstCode = await runCli(
      [
        "render",
        resolve("examples/product-announcement.json"),
        "--format",
        "svg",
        "--output",
        output,
        "--manifest",
        manifest,
      ],
      firstCapture.io,
    );
    expect(firstCode).toBe(0);
    expect(await readFile(output, "utf8")).toMatch(/^<svg /);
    const provenance = JSON.parse(await readFile(manifest, "utf8")) as {
      renderFingerprint: string;
    };

    const secondCapture = captureIo();
    const secondCode = await runCli(
      [
        "render",
        resolve("examples/product-announcement.json"),
        "--format",
        "svg",
        "--output",
        output,
        "--verify",
        provenance.renderFingerprint,
        "--force",
      ],
      secondCapture.io,
    );
    expect(secondCode).toBe(0);
  });

  it("refuses to overwrite output unless --force is explicit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "glyphkiln-cli-overwrite-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "graphic.svg");
    await writeFile(output, "keep me");
    const capture = captureIo();
    const code = await runCli(
      [
        "render",
        resolve("examples/article-cover.json"),
        "--format",
        "svg",
        "--output",
        output,
      ],
      capture.io,
    );
    expect(code).toBe(1);
    expect(capture.stderr.join("\n")).toContain("OUTPUT_EXISTS");
    expect(await readFile(output, "utf8")).toBe("keep me");
  });

  it("rejects an output path that collides with the manifest path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "glyphkiln-cli-conflict-"));
    temporaryDirectories.push(directory);
    const sharedPath = join(directory, "shared-output");
    const capture = captureIo();
    const code = await runCli(
      [
        "render",
        resolve("examples/article-cover.json"),
        "--format",
        "svg",
        "--output",
        sharedPath,
        "--manifest",
        sharedPath,
        "--force",
      ],
      capture.io,
    );
    expect(code).toBe(1);
    expect(capture.stderr.join("\n")).toContain("OUTPUT_PATH_CONFLICT");
    await expect(readFile(sharedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves hard-linked output aliases when --force is supplied", async () => {
    const directory = await mkdtemp(join(tmpdir(), "glyphkiln-cli-alias-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "graphic.svg");
    const manifest = join(directory, "manifest.json");
    await writeFile(output, "keep me");
    await link(output, manifest);
    const capture = captureIo();
    const code = await runCli(
      [
        "render",
        resolve("examples/article-cover.json"),
        "--format",
        "svg",
        "--output",
        output,
        "--manifest",
        manifest,
        "--force",
      ],
      capture.io,
    );
    expect(code).toBe(1);
    expect(capture.stderr.join("\n")).toContain("OUTPUT_PATH_CONFLICT");
    expect(await readFile(output, "utf8")).toBe("keep me");
    expect(await readFile(manifest, "utf8")).toBe("keep me");
  });

  it("reports the package version", async () => {
    const capture = captureIo();
    expect(await runCli(["--version"], capture.io)).toBe(0);
    expect(capture.stdout).toEqual(["0.2.0"]);
  });

  it("returns nonzero for invalid usage", async () => {
    const capture = captureIo();
    expect(await runCli(["render"], capture.io)).toBe(1);
    expect(capture.stderr.join("\n")).toContain("requires a design file");
  });

  it("rejects an oversized design file before parsing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "glyphkiln-cli-limit-test-"));
    temporaryDirectories.push(directory);
    const input = join(directory, "oversized.json");
    await writeFile(
      input,
      Buffer.alloc(RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes + 1, 0x20),
    );
    const capture = captureIo();
    expect(await runCli(["validate", input], capture.io)).toBe(1);
    expect(capture.stderr.join("\n")).toContain("INPUT_FILE_BYTES_LIMIT_EXCEEDED");
  });

  it("redacts absolute input directories from parse diagnostics", async () => {
    const directory = await mkdtemp(join(tmpdir(), "glyphkiln-cli-redaction-"));
    temporaryDirectories.push(directory);
    const input = join(directory, "invalid.json");
    await writeFile(input, "{");
    const capture = captureIo();
    expect(await runCli(["validate", input], capture.io)).toBe(1);
    const diagnostic = capture.stderr.join("\n");
    expect(diagnostic).toContain("invalid.json");
    expect(diagnostic).not.toContain(directory);
  });

  it("executes when Node receives a package-style symlink path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "glyphkiln-bin-test-"));
    temporaryDirectories.push(directory);
    const binaryLink = join(directory, "glyphkiln");
    await symlink(resolve("dist/cli/index.js"), binaryLink);
    const result = await execFileAsync(process.execPath, [
      binaryLink,
      "validate",
      resolve("examples/product-announcement.json"),
    ]);
    expect(result.stdout).toContain("Valid Glyphkiln design");
    expect(result.stderr).toBe("");
  });
});
