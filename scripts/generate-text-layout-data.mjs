import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const root = new URL("../", import.meta.url);
const defaults = {
  sourceDirectory: fileURLToPath(new URL("vendor/unicode/17.0.0/sources/", root)),
  checksumsPath: fileURLToPath(
    new URL("vendor/unicode/17.0.0/source-checksums.json", root),
  ),
  outputPath: fileURLToPath(
    new URL("src/typography/text-layout-data.generated.ts", root),
  ),
};

const tableSpecifications = [
  {
    exportName: "BIDI_CONTROL_RANGES",
    sourceName: "PropList.txt",
    property: "Bidi_Control",
  },
  {
    exportName: "BIDI_CLASS_R_RANGES",
    sourceName: "DerivedBidiClass.txt",
    property: "R",
  },
  {
    exportName: "BIDI_CLASS_AL_RANGES",
    sourceName: "DerivedBidiClass.txt",
    property: "AL",
  },
  {
    exportName: "MONGOLIAN_SCRIPT_RANGES",
    sourceName: "Scripts.txt",
    property: "Mongolian",
  },
  {
    exportName: "PHAGS_PA_SCRIPT_RANGES",
    sourceName: "Scripts.txt",
    property: "Phags_Pa",
  },
  {
    exportName: "VERTICAL_DECOMPOSITION_RANGES",
    sourceName: "DerivedDecompositionType.txt",
    property: "Vertical",
  },
];

try {
  await run();
} catch (error) {
  process.stderr.write(
    `Unicode text-layout data generation failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const checksumRecord = JSON.parse(await readFile(options.checksumsPath, "utf8"));
  validateChecksumRecord(checksumRecord);
  const sourceContents = await readAndVerifySources(
    options.sourceDirectory,
    checksumRecord.files,
  );
  const tables = tableSpecifications.map((specification) => ({
    exportName: specification.exportName,
    ranges: parsePropertyRanges(
      sourceContents.get(specification.sourceName),
      specification.sourceName,
      specification.property,
    ),
  }));
  const prettierOptions = (await prettier.resolveConfig(defaults.outputPath)) ?? {};
  const output = await prettier.format(
    formatGeneratedModule(checksumRecord.unicodeVersion, checksumRecord.files, tables),
    { ...prettierOptions, parser: "typescript" },
  );
  if (options.verify) {
    const committed = await readFile(options.outputPath, "utf8");
    if (committed !== output) {
      throw new Error("generated output is stale; run npm run text-layout-data:update");
    }
    process.stdout.write(
      `Verified Unicode ${checksumRecord.unicodeVersion} text-layout data.\n`,
    );
    return;
  }
  await writeFile(options.outputPath, output, "utf8");
  process.stdout.write(
    `Wrote Unicode ${checksumRecord.unicodeVersion} text-layout data to ${options.outputPath}.\n`,
  );
}

function parseArguments(arguments_) {
  const options = { ...defaults, verify: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--verify") {
      options.verify = true;
    } else if (argument === "--source-dir") {
      options.sourceDirectory = requiredValue(arguments_[++index], argument);
    } else if (argument === "--checksums") {
      options.checksumsPath = requiredValue(arguments_[++index], argument);
    } else if (argument === "--output") {
      options.outputPath = requiredValue(arguments_[++index], argument);
    } else {
      throw new Error(`unknown option "${argument}"`);
    }
  }
  return options;
}

function requiredValue(value, option) {
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return resolve(value);
}

function validateChecksumRecord(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.unicodeVersion !== "17.0.0" ||
    typeof value.files !== "object" ||
    value.files === null
  ) {
    throw new Error("source-checksums.json is invalid");
  }
  for (const specification of tableSpecifications) {
    const checksum = value.files[specification.sourceName];
    if (typeof checksum !== "string" || !/^[0-9a-f]{64}$/.test(checksum)) {
      throw new Error(
        `source-checksums.json has no valid hash for ${specification.sourceName}`,
      );
    }
  }
}

async function readAndVerifySources(sourceDirectory, checksums) {
  const sourceNames = [
    ...new Set(tableSpecifications.map(({ sourceName }) => sourceName)),
  ].sort();
  const contents = new Map();
  for (const sourceName of sourceNames) {
    const content = await readFile(resolve(sourceDirectory, sourceName), "utf8");
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== checksums[sourceName]) {
      throw new Error(
        `${sourceName} checksum mismatch: expected ${checksums[sourceName]}, received ${actual}`,
      );
    }
    contents.set(sourceName, content);
  }
  return contents;
}

function parsePropertyRanges(content, sourceName, expectedProperty) {
  if (typeof content !== "string") {
    throw new Error(`missing source ${sourceName}`);
  }
  const ranges = [];
  for (const [index, sourceLine] of content.split(/\r?\n/).entries()) {
    const data = sourceLine.split("#", 1)[0].trim();
    if (data.length === 0) continue;
    const fields = data.split(";").map((field) => field.trim());
    if (fields.length !== 2 || fields[1].length === 0) {
      throw new Error(`${sourceName}:${index + 1} has a malformed range record`);
    }
    const range = parseRange(fields[0], sourceName, index + 1);
    if (fields[1] !== expectedProperty) continue;
    const previous = ranges.at(-1);
    if (previous !== undefined && range[0] < previous[0]) {
      throw new Error(
        `${sourceName}:${index + 1} property ${expectedProperty} is not sorted`,
      );
    }
    if (previous !== undefined && range[0] <= previous[1]) {
      throw new Error(
        `${sourceName}:${index + 1} property ${expectedProperty} overlaps a previous range`,
      );
    }
    ranges.push(range);
  }
  if (ranges.length === 0) {
    throw new Error(`${sourceName} has no ${expectedProperty} ranges`);
  }
  return mergeAdjacentRanges(ranges);
}

function parseRange(value, sourceName, lineNumber) {
  const match = /^([0-9A-F]{4,6})(?:\.\.([0-9A-F]{4,6}))?$/.exec(value);
  if (match === null) {
    throw new Error(`${sourceName}:${lineNumber} has a malformed range`);
  }
  const start = Number.parseInt(match[1], 16);
  const end = Number.parseInt(match[2] ?? match[1], 16);
  if (start > end || end > 0x10ffff) {
    throw new Error(`${sourceName}:${lineNumber} has an invalid range`);
  }
  return [start, end];
}

function mergeAdjacentRanges(ranges) {
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous !== undefined && range[0] === previous[1] + 1) {
      previous[1] = range[1];
    } else {
      merged.push([...range]);
    }
  }
  return merged;
}

function formatGeneratedModule(unicodeVersion, checksums, tables) {
  const lines = [
    "/* This file is generated by scripts/generate-text-layout-data.mjs. */",
    "",
    "export type TextLayoutRange = readonly [start: number, end: number];",
    "",
    `export const UNICODE_TEXT_LAYOUT_DATA_VERSION = "${unicodeVersion}" as const;`,
    "",
    "export const UNICODE_TEXT_LAYOUT_SOURCE_SHA256 = Object.freeze({",
  ];
  for (const sourceName of Object.keys(checksums).sort()) {
    lines.push(`  "${sourceName}": "${checksums[sourceName]}",`);
  }
  lines.push("});", "");
  for (const table of tables) {
    lines.push(
      `export const ${table.exportName}: readonly TextLayoutRange[] = Object.freeze([`,
    );
    for (const [start, end] of table.ranges) {
      lines.push(`  [${hex(start)}, ${hex(end)}],`);
    }
    lines.push("]);", "");
  }
  return `${lines.join("\n")}\n`;
}

function hex(value) {
  return `0x${value.toString(16).toUpperCase()}`;
}
