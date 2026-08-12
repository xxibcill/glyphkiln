import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { installedCliInvocation } from "../scripts/package-consumer-cli.mjs";
import { packageConsumerInstallPlan } from "../scripts/package-consumer-install.mjs";
import { expectProcessFailureStderr } from "./helpers.js";

const execFileAsync = promisify(execFile);
const packageConsumer = resolve("scripts/test-package-consumer.mjs");

it("launches the installed Windows CLI shim through the command shell", () => {
  const cli = String.raw`C:\consumer path\node_modules\.bin\glyphkiln.cmd`;
  const design = String.raw`C:\consumer path\design.json`;
  const commandShell = String.raw`C:\Windows\System32\cmd.exe`;

  expect(
    installedCliInvocation("win32", cli, ["inspect", design], commandShell),
  ).toEqual({
    file: commandShell,
    args: ["/d", "/s", "/c", cli, "inspect", design],
  });
});

it("keeps the lockfile and audits signatures for a published package", () => {
  expect(packageConsumerInstallPlan("@glyphkiln/core@0.5.0", true)).toEqual({
    installArguments: [
      "install",
      "@glyphkiln/core@0.5.0",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    signatureAuditArguments: ["audit", "signatures"],
  });
});

it("disables the lockfile when signature verification is not requested", () => {
  expect(packageConsumerInstallPlan("./glyphkiln-core.tgz", false)).toEqual({
    installArguments: [
      "install",
      "./glyphkiln-core.tgz",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    signatureAuditArguments: undefined,
  });
});

it("rejects an empty package spec before creating consumer files", async () => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "glyphkiln-package-consumer-test-"),
  );

  try {
    await expect(
      packageConsumerFailure({
        ...process.env,
        GLYPHKILN_PACKAGE_SPEC: "   ",
        TEMP: temporaryRoot,
        TMP: temporaryRoot,
        TMPDIR: temporaryRoot,
      }),
    ).resolves.toContain("GLYPHKILN_PACKAGE_SPEC must not be empty when provided.");
    await expect(readdir(temporaryRoot)).resolves.toEqual([]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

it("rejects an invalid package-signature verification mode", async () => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "glyphkiln-package-signature-mode-test-"),
  );

  try {
    await expect(
      packageConsumerFailure({
        ...process.env,
        GLYPHKILN_VERIFY_PACKAGE_SIGNATURES: "true",
        TEMP: temporaryRoot,
        TMP: temporaryRoot,
        TMPDIR: temporaryRoot,
      }),
    ).resolves.toContain(
      "GLYPHKILN_VERIFY_PACKAGE_SIGNATURES must be 1 when provided.",
    );
    await expect(readdir(temporaryRoot)).resolves.toEqual([]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

it("requires a selected package for signature verification", async () => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "glyphkiln-package-signature-spec-test-"),
  );

  try {
    await expect(
      packageConsumerFailure({
        ...process.env,
        GLYPHKILN_VERIFY_PACKAGE_SIGNATURES: "1",
        TEMP: temporaryRoot,
        TMP: temporaryRoot,
        TMPDIR: temporaryRoot,
      }),
    ).resolves.toContain(
      "GLYPHKILN_VERIFY_PACKAGE_SIGNATURES requires GLYPHKILN_PACKAGE_SPEC.",
    );
    await expect(readdir(temporaryRoot)).resolves.toEqual([]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

it("installs a selected archive relative to the invocation directory", async () => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "glyphkiln-selected-package-test-"),
  );

  try {
    const { stdout: packOutput } = await execFileAsync(
      "npm",
      ["pack", "--pack-destination", temporaryRoot, "--silent"],
      { cwd: resolve(".") },
    );
    const archiveName = packOutput.trim().split(/\r?\n/).at(-1);
    if (archiveName === undefined || archiveName.length === 0) {
      throw new Error("npm pack did not report an archive name.");
    }

    const { stdout } = await execFileAsync(process.execPath, [packageConsumer], {
      cwd: temporaryRoot,
      env: {
        ...process.env,
        GLYPHKILN_PACKAGE_SPEC: `./${archiveName}`,
      },
    });
    expect(stdout).toContain(
      "Fresh published-package JavaScript, TypeScript, schema-subpath, installed-bin, and isolated consumers passed.",
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);

async function packageConsumerFailure(env: NodeJS.ProcessEnv): Promise<string> {
  return expectProcessFailureStderr(
    () => execFileAsync(process.execPath, [packageConsumer], { env }),
    "Expected package consumer to fail.",
  );
}
