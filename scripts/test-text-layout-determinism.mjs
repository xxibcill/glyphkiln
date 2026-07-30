import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const probe = new URL("./print-text-layout-diagnostics.mjs", import.meta.url);
const EXPECTED_DIAGNOSTIC_CORPUS_SHA256 =
  "e1533c2a31622a6b2c5582960076f9517cd654b8cdc2b9cacbd7376207d73db2";
const [first, second] = await Promise.all([runProbe(), runProbe()]);

assert.equal(first.stderr, "");
assert.equal(second.stderr, "");
assert.equal(first.stdout, second.stdout);

const fingerprint = createHash("sha256").update(first.stdout).digest("hex");
assert.equal(fingerprint, EXPECTED_DIAGNOSTIC_CORPUS_SHA256);
process.stdout.write(
  `Text-layout diagnostics are deterministic across fresh processes (${fingerprint}).\n`,
);

function runProbe() {
  return execFileAsync(process.execPath, [probe.pathname], {
    maxBuffer: 1_048_576,
  });
}
