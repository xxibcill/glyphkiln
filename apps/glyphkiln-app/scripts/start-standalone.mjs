import { readGlyphkilnHostname } from "./runtime-hostname.mjs";

process.env.HOSTNAME = readGlyphkilnHostname();

await import("./server.js");
