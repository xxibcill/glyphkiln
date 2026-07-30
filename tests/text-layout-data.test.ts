import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const generator = resolve("scripts/generate-text-layout-data.mjs");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Unicode text-layout data generation", () => {
  it("verifies committed generated data byte-for-byte", async () => {
    const result = await execFileAsync(process.execPath, [generator, "--verify"]);
    expect(result.stdout).toContain("Verified Unicode 17.0.0 text-layout data");
    expect(result.stderr).toBe("");
  });

  it("generates byte-identical output from pinned local sources", async () => {
    const directory = await temporaryDirectory("glyphkiln-unicode-output-");
    const first = join(directory, "first.ts");
    const second = join(directory, "second.ts");
    await execFileAsync(process.execPath, [generator, "--output", first]);
    await execFileAsync(process.execPath, [generator, "--output", second]);
    expect(await readFile(first)).toEqual(await readFile(second));
  });

  it("rejects source files whose checksum changed", async () => {
    const directory = await copiedUnicodeSources();
    const path = join(directory, "DerivedBidiClass.txt");
    await writeFile(path, `${await readFile(path, "utf8")}\n# changed\n`);
    await expect(generatorFailure(directory)).resolves.toContain("checksum mismatch");
  });

  it.each([
    ["malformed", "not-a-range ; R", "malformed range"],
    ["unsorted", "0042 ; R\n0041 ; R", "not sorted"],
    ["overlapping", "0041..0043 ; R\n0043..0044 ; R", "overlaps"],
  ])("rejects %s source ranges", async (_label, content, expected) => {
    const directory = await minimalUnicodeSources(content);
    await expect(generatorFailure(directory)).resolves.toContain(expected);
  });
});

async function generatorFailure(sourceDirectory: string): Promise<string> {
  const output = join(sourceDirectory, "generated.ts");
  try {
    await execFileAsync(process.execPath, [
      generator,
      "--source-dir",
      sourceDirectory,
      "--checksums",
      join(sourceDirectory, "source-checksums.json"),
      "--output",
      output,
    ]);
    throw new Error("Expected generator to fail.");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return error.stderr;
    }
    throw error;
  }
}

async function copiedUnicodeSources(): Promise<string> {
  const directory = await temporaryDirectory("glyphkiln-unicode-sources-");
  await cp(resolve("vendor/unicode/17.0.0/sources"), directory, {
    recursive: true,
  });
  await cp(
    resolve("vendor/unicode/17.0.0/source-checksums.json"),
    join(directory, "source-checksums.json"),
  );
  return directory;
}

async function minimalUnicodeSources(derivedBidiClass: string): Promise<string> {
  const directory = await temporaryDirectory("glyphkiln-unicode-invalid-");
  const sources = {
    "DerivedBidiClass.txt": derivedBidiClass,
    "PropList.txt": "200E ; Bidi_Control",
    "Scripts.txt": "1800 ; Mongolian\nA840 ; Phags_Pa",
    "DerivedDecompositionType.txt": "FE10 ; Vertical",
  };
  for (const [name, content] of Object.entries(sources)) {
    await writeFile(join(directory, name), `${content}\n`);
  }
  await writeFile(
    join(directory, "source-checksums.json"),
    `${JSON.stringify(
      {
        unicodeVersion: "17.0.0",
        files: Object.fromEntries(
          Object.entries(sources).map(([name, content]) => [
            name,
            sha256(`${content}\n`),
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  return directory;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}
