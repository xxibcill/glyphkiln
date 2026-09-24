import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { DEVELOPMENT_FONT_SHA256 } from "../src/index.js";
import { runCli } from "../src/cli/index.js";

const input = {
  schemaVersion: "1.0.0",
  id: "offline-scene",
  seed: "offline",
  dimensions: { width: 120, height: 80 },
  title: "Offline scene",
  description: "A label",
  backgroundColor: "#ffffff",
  assets: [],
  fonts: [
    { family: "Inter", weight: 400, style: "normal", sha256: DEVELOPMENT_FONT_SHA256 },
  ],
  readingOrder: [],
  elements: [
    {
      id: "label",
      type: "text",
      text: "Offline",
      box: { x: 5, y: 5, width: 100, height: 30 },
      font: { family: "Inter", weight: 400, style: "normal" },
      fit: {
        preferredFontSize: 18,
        minimumFontSize: 12,
        maximumLines: 1,
        lineHeight: 1.2,
        align: "left",
      },
      fill: "#111111",
      textMode: "outline",
      semantic: { role: "content" },
    },
  ],
};

async function invoke(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(args, {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr };
}

describe("offline Scene CLI", () => {
  it("prints opt-in reading-order warnings without requiring a manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphkiln-scene-review-cli-"));
    try {
      const scenePath = join(root, "scene.json");
      const output = join(root, "scene.svg");
      await writeFile(scenePath, JSON.stringify(input));
      const rendered = await invoke([
        "scene",
        "render",
        scenePath,
        "--format",
        "svg",
        "--output",
        output,
        "--review-reading-order",
      ]);
      expect(rendered.code).toBe(0);
      expect(JSON.parse(rendered.stderr[0]!)).toMatchObject({
        code: "SCENE_READING_ORDER_UNCOVERED",
        layerId: "label",
      });
      expect(rendered.stdout).toContain(`Rendered svg: ${output}`);
      expect(await readFile(output, "utf8")).toContain("<svg");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("validates, inspects evidence, renders with a manifest, and verifies fingerprints", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphkiln-scene-cli-"));
    try {
      const scenePath = join(root, "scene.json");
      const output = join(root, "scene.svg");
      await writeFile(scenePath, JSON.stringify(input));
      expect((await invoke(["scene", "validate", scenePath])).code).toBe(0);
      const inspected = await invoke([
        "scene",
        "inspect",
        scenePath,
        "--review-reading-order",
      ]);
      expect(inspected.code).toBe(0);
      const data = JSON.parse(inspected.stdout.join("\n")) as {
        fingerprint: string;
        evidence: { text: unknown[] };
        qualityIssues: { code: string }[];
      };
      expect(data.evidence.text).toHaveLength(1);
      expect(data.qualityIssues.map((issue) => issue.code)).toEqual([
        "SCENE_READING_ORDER_UNCOVERED",
      ]);
      const rendered = await invoke([
        "scene",
        "render",
        scenePath,
        "--format",
        "svg",
        "--output",
        output,
        "--manifest",
        "--verify",
        data.fingerprint,
      ]);
      expect(rendered.code).toBe(0);
      expect(await readFile(output, "utf8")).toContain("<svg");
      expect(
        JSON.parse(await readFile(`${output}.manifest.json`, "utf8")),
      ).toMatchObject({ input: { kind: "scene" } });
      expect(
        (
          await invoke([
            "scene",
            "render",
            scenePath,
            "--format",
            "svg",
            "--output",
            output,
          ])
        ).stderr.join(" "),
      ).toContain("OUTPUT_EXISTS");
      expect(
        (
          await invoke([
            "scene",
            "render",
            scenePath,
            "--format",
            "svg",
            "--output",
            output,
            "--verify",
            "wrong",
            "--force",
          ])
        ).stderr.join(" "),
      ).toContain("FINGERPRINT_MISMATCH");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reuses bundle path and symlink checks for Scene resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphkiln-scene-bundle-"));
    try {
      const scenePath = join(root, "scene.json");
      const bundle = join(root, "bundle");
      await mkdir(bundle);
      await writeFile(scenePath, JSON.stringify(input));
      await writeFile(
        join(bundle, "glyphkiln-resource-bundle.json"),
        JSON.stringify({ bundleVersion: "1.0.0", assets: [], fonts: [] }),
      );
      expect(
        (await invoke(["scene", "inspect", scenePath, "--resource-bundle", bundle]))
          .code,
      ).toBe(0);
      await rm(join(bundle, "glyphkiln-resource-bundle.json"));
      await symlink(scenePath, join(bundle, "glyphkiln-resource-bundle.json"));
      expect(
        (
          await invoke(["scene", "inspect", scenePath, "--resource-bundle", bundle])
        ).stderr.join(" "),
      ).toContain("RESOURCE_BUNDLE_SYMLINK_REJECTED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("loads a hashed custom Thai font from an offline bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphkiln-scene-thai-cli-"));
    try {
      const bundle = resolve("fixtures/scene-thai");
      const scenePath = join(bundle, "thai-offer.scene.json");
      const output = join(root, "thai.svg");
      const rendered = await invoke([
        "scene",
        "render",
        scenePath,
        "--resource-bundle",
        bundle,
        "--format",
        "svg",
        "--output",
        output,
        "--manifest",
      ]);
      expect(rendered.code).toBe(0);
      expect(await readFile(output, "utf8")).toContain("ข้อเสนอ");
      expect(
        JSON.parse(await readFile(`${output}.manifest.json`, "utf8")),
      ).toMatchObject({
        fonts: [{ family: "Noto Sans Thai" }, { family: "Noto Sans Thai" }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
