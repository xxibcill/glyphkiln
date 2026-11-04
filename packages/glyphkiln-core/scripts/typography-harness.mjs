// Typography harness snapshots and baseline metrics (plan M0).
//   node scripts/typography-harness.mjs           write snapshots and report
//   node scripts/typography-harness.mjs --verify  require committed files to match
// Development only. Reads committed corpora and vendored data; no network.
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  buildBaselineReport,
  buildSnapshots,
  canonicalJson,
  createHarnessRegistry,
  formatForRepository,
  loadCorpora,
  packagePath,
} from "./typography/harness.mjs";
import { renderBaselineMarkdown } from "./typography/report.mjs";

const verify = process.argv.includes("--verify");
const registry = createHarnessRegistry();
const corpora = loadCorpora();
const snapshots = buildSnapshots(registry, corpora);
const report = buildBaselineReport(registry, corpora);

const files = new Map();
for (const [id, entries] of Object.entries(snapshots)) {
  files.set(
    `tests/typography/snapshots/${id.toLowerCase()}.json`,
    canonicalJson({ corpus: id, shaper: registry.shaperId, entries }),
  );
}
files.set(
  "../../docs/research/typography-m0-baseline/metrics.json",
  canonicalJson(report),
);
files.set(
  "../../docs/research/typography-m0-baseline/README.md",
  renderBaselineMarkdown(report),
);

const mismatches = [];
for (const [relative, raw] of files) {
  const url = packagePath(relative);
  const contents = await formatForRepository(raw, url);
  if (verify) {
    const current = await readFile(url, "utf8").catch(() => undefined);
    if (current !== contents) mismatches.push(relative);
    continue;
  }
  await mkdir(new URL(".", url), { recursive: true });
  await writeFile(url, contents);
}

if (mismatches.length > 0) {
  process.stderr.write(
    `Typography harness output differs from the committed files:\n${mismatches.join("\n")}\n` +
      "Run `npm run typography-harness:update --workspace @glyphkiln/core` only for a deliberate change.\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${verify ? "Verified" : "Wrote"} ${files.size} typography harness files (snapshots ${report.snapshotSha256}).\n`,
  );
}
