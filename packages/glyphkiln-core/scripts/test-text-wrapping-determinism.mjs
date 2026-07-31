import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const probe = new URL("./print-text-wrapping.mjs", import.meta.url);
const EXPECTED_WRAPPING_CORPUS_SHA256 =
  "d67facd3e2daf4bd1697cbf4f828b0737f4c06b46f0a0e0d62dbcc084ea1af88";
const [first, second] = await Promise.all([runProbe(), runProbe()]);

assert.equal(first.stderr, "");
assert.equal(second.stderr, "");
assert.equal(first.stdout, second.stdout);

const fingerprint = createHash("sha256").update(first.stdout).digest("hex");
assert.equal(fingerprint, EXPECTED_WRAPPING_CORPUS_SHA256);
process.stdout.write(
  `Text wrapping is deterministic across fresh processes (${fingerprint}).\n`,
);

function runProbe() {
  return execFileAsync(process.execPath, [probe.pathname], {
    maxBuffer: 1_048_576,
  });
}
