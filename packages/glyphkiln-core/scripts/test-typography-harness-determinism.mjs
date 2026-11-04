// The typography harness (plan M0) must give byte-identical output in fresh
// processes: corpus snapshots, quality metrics and the LineBreakTest oracle.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const probe = new URL("./print-typography-harness.mjs", import.meta.url);
const EXPECTED_HARNESS_SHA256 =
  "3727cdacc60a413218370bb074d5dd975c234d4301edcdb52201ebc20507978f";
const [first, second] = await Promise.all([runProbe(), runProbe()]);

assert.equal(first.stderr, "");
assert.equal(second.stderr, "");
assert.equal(first.stdout, second.stdout);

const fingerprint = createHash("sha256").update(first.stdout).digest("hex");
assert.equal(fingerprint, EXPECTED_HARNESS_SHA256);
process.stdout.write(
  `Typography harness is deterministic across fresh processes (${fingerprint}).\n`,
);

function runProbe() {
  return execFileAsync(process.execPath, [probe.pathname], {
    maxBuffer: 16 * 1_048_576,
  });
}
