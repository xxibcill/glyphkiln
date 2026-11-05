// Typography M2 exit gate: one digest of M1 shaping and outlines, computed in
// fresh processes through the production M1 path (`createTypesetter`, the
// runtime HarfBuzz shaper with its wasm hash check), so it can be compared
// across platforms and Node versions.
//
//   node scripts/typography-m1-digest.mjs          two fresh processes; print
//                                                   the digest; fail unless
//                                                   both match the pinned one
//   node scripts/typography-m1-digest.mjs --child  print the digested text
//
// Needs a build first (`npm run build --workspace @glyphkiln/core`).
// It covers C-LAT, C-TH and C-MIX:
//   - each corpus in its own face at 1 px per font unit, optical size at the
//     axis default (glyph IDs, positions and raw outlines);
//   - each corpus at 48 px on a 1080 px canvas with automatic optical size
//     (SVG path data as Core writes it);
//   - C-TH at 0.05 em cluster tracking;
//   - C-MIX on Inter with a Noto Sans Thai fallback at `scale: "auto"`.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const EXPECTED_M1_DIGEST =
  "8aef70cfe3a1d671c04a6dd5854b8ba1adff471c687641407d446dc298e72007";

if (process.argv.includes("--child")) {
  process.stdout.write(await digestText());
} else {
  await main();
}

async function digestText() {
  const { FontRegistry } = await import("../dist/fonts/index.js");
  const { loadHarfBuzzShaper } = await import("../dist/fonts/harfbuzz.js");
  const { createTypesetter, loadTypographyEngine } =
    await import("../dist/typography/engine.js");
  const identity = await loadTypographyEngine();
  const shaper = await loadHarfBuzzShaper();
  const registry = new FontRegistry();
  const out = [`${identity.id} ${identity.wasmSha256}`];
  const setter = (model) =>
    createTypesetter({
      registry,
      model: { weight: 400, style: "normal", ...model },
      shortSidePx: 1080,
      layerId: "m1-digest",
    });
  const set = (engine, text, fontSize, letterSpacing = 0) =>
    engine.setLines({
      lines: [text],
      family: "unused",
      weight: 400,
      style: "normal",
      fontSize,
      lineHeight: 1.2,
      x: 0,
      y: 0,
      align: "left",
      letterSpacing,
    })[0];
  const glyphs = (line) =>
    line.glyphs
      .map(
        (glyph) => `${glyph.id}@${glyph.x},${glyph.y}+${glyph.advance}:${glyph.face}`,
      )
      .join(" ");
  for (const name of ["c-lat", "c-th", "c-mix"]) {
    const corpus = JSON.parse(
      readFileSync(
        new URL(`../tests/typography/corpora/${name}.json`, import.meta.url),
      ),
    );
    const family = corpus.face.family;
    const font = registry.get(family, corpus.face.weight, "normal");
    const unitsPerEm = shaper.metrics(shaper.loadFace(font.bytes)).unitsPerEm;
    const units = setter({ family, opticalSizing: "none" });
    const display = setter({ family });
    const tracked = setter({ family });
    const stacked = setter({
      family: "Inter",
      fallback: [{ family: "Noto Sans Thai", scale: "auto" }],
    });
    const face = shaper.instantiate(shaper.loadFace(font.bytes), { wght: 400 });
    for (const entry of corpus.entries) {
      const line = set(units, entry.text, unitsPerEm);
      const outlines = line.glyphs.map((glyph) =>
        JSON.stringify(shaper.glyphOutline(face, glyph.id).commands),
      );
      out.push(`${entry.id} units ${glyphs(line)}`);
      out.push(`${entry.id} outlines ${hash(outlines.join("\n"))}`);
      const svg = set(display, entry.text, 48);
      out.push(`${entry.id} 48px ${svg.width} ${hash(svg.path)}`);
      if (name === "c-th") {
        const line = set(tracked, entry.text, 48, 2.4);
        out.push(
          `${entry.id} tracked ${line.width} ${glyphs(line)} ${hash(line.path)}`,
        );
      }
      if (name === "c-mix") {
        const line = set(stacked, entry.text, 48);
        out.push(`${entry.id} stack ${line.width} ${glyphs(line)} ${hash(line.path)}`);
      }
    }
    out.push(
      `${name} faces ${JSON.stringify([display, tracked, stacked].map((engine) => engine.usedFaces()))}`,
    );
  }
  return `${out.join("\n")}\n`;
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  const run = () =>
    promisify(execFile)(
      process.execPath,
      [new URL(import.meta.url).pathname, "--child"],
      {
        maxBuffer: 64 * 1_048_576,
      },
    );
  const [first, second] = await Promise.all([run(), run()]);
  const digest = hash(first.stdout);
  const environment = `node ${process.version}, ${process.platform}-${process.arch}`;
  const lines = first.stdout.split("\n").length - 1;
  process.stdout.write(
    `Typography M1 digest: ${digest} (${lines} lines; ${environment})\n`,
  );
  const failures = [];
  if (first.stderr !== "" || second.stderr !== "")
    failures.push("a child wrote to stderr");
  if (first.stdout !== second.stdout) failures.push("two fresh processes differ");
  if (digest !== EXPECTED_M1_DIGEST) {
    failures.push(`expected the pinned digest ${EXPECTED_M1_DIGEST}`);
  }
  if (failures.length > 0) {
    process.stderr.write(
      `Typography M1 digest check failed: ${failures.join("; ")}.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Matches the pinned digest in two fresh processes.\n");
}
