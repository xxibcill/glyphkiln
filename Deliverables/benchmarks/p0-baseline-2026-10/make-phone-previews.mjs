// Deterministic box-filter downscale of the stress-test PNGs to a 360 px phone
// feed width, for critique at delivered size. Usage: node ...make-phone-previews.mjs [--verify]
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import { createQualificationEmitter } from "../../../scripts/qualification-output.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE = resolve(ROOT, "Deliverables/designer-stress-test-2026-09-25");
const OUT = resolve(ROOT, "Deliverables/benchmarks/p0-baseline-2026-10/phone-width");
const WIDTH = 360;
const { emit } = createQualificationEmitter({
  repositoryRoot: ROOT,
  verify: process.argv.includes("--verify"),
});

function downscale(source, width) {
  const scale = source.width / width;
  const height = Math.round(source.height / scale);
  const target = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const offset = (sy * source.width + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            sum[channel] += source.data[offset + channel];
          }
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        target.data[offset + channel] = Math.round(sum[channel] / count);
      }
    }
  }
  return PNG.sync.write(target, { colorType: 6 });
}

const files = [
  ...(await readdir(resolve(SOURCE, "outputs")))
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => resolve(SOURCE, "outputs", name)),
  resolve(SOURCE, "scene/how-the-light-is-made.png"),
];
for (const file of files) {
  const source = PNG.sync.read(await readFile(file));
  const name = file.split("/").pop();
  await emit(resolve(OUT, name), new Uint8Array(downscale(source, WIDTH)));
}
console.log(`${files.length} previews at ${WIDTH} px wide.`);
