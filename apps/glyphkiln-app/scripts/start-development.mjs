import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { readGlyphkilnHostname } from "./runtime-hostname.mjs";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
process.argv = [
  process.execPath,
  nextCli,
  "dev",
  "--hostname",
  readGlyphkilnHostname(),
  ...process.argv.slice(2),
];

await import(pathToFileURL(nextCli).href);
