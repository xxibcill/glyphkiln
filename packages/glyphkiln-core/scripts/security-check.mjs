import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const sourceFiles = await collectTypeScript(resolve("src"));
const patterns = [
  ["dynamic evaluation", new RegExp("\\be" + "val\\s*\\(")],
  ["Function constructor", new RegExp("\\bnew\\s+Fun" + "ction\\s*\\(")],
  ["network fetch", new RegExp("\\bfet" + "ch\\s*\\(")],
  ["non-literal dynamic import", /\bimport\s*\(\s*[^"']/],
];
const violations = [];

for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of patterns) {
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
}

if (violations.length > 0) {
  process.stderr.write(`Security check failed:\n${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Security check passed (${sourceFiles.length} source files inspected).\n`,
  );
}

async function collectTypeScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTypeScript(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat();
}
