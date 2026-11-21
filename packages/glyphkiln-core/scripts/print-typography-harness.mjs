// Prints the typography harness output (snapshots and baseline metrics) as
// canonical JSON. Used by test-typography-harness-determinism.mjs.
import {
  buildBaselineReport,
  buildSnapshots,
  canonicalJson,
  createHarnessRegistry,
  loadCorpora,
} from "./typography/harness.mjs";

const registry = createHarnessRegistry();
const corpora = loadCorpora();
process.stdout.write(
  canonicalJson({
    snapshots: buildSnapshots(registry, corpora),
    report: buildBaselineReport(registry, corpora),
  }),
);
