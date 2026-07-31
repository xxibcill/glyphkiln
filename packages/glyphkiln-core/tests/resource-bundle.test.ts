import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLI_RESOURCE_BUNDLE_LIMITS,
  RESOURCE_BUNDLE_MANIFEST_FILENAME,
  loadResourceBundle,
} from "../src/cli/resource-bundle.js";
import {
  DEVELOPMENT_FONT_SHA256,
  RENDER_RESOURCE_LIMITS,
  renderGraphic,
  sha256,
  type DesignDocument,
} from "../src/index.js";
import { runCli } from "../src/cli/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

const PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    "base64",
  ),
);
const PIXEL_HASH = sha256(PIXEL_PNG);
const CREATION_TIMESTAMP = "2026-07-31T00:00:00.000Z";
const temporaryDirectories: string[] = [];

type BundleAsset = {
  file: string;
  id: string;
  mimeType: "image/png" | "image/jpeg";
  sha256: string;
  width: number;
  height: number;
  origin: { kind: "user-upload" };
};

type BundleFont = {
  file: string;
  family: string;
  weight: number;
  style: "normal" | "italic";
  sha256: string;
};

type BundleManifest = {
  bundleVersion: "1.0.0";
  assets: BundleAsset[];
  fonts: BundleFont[];
  unexpected?: boolean;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("offline CLI resource bundles", () => {
  it("loads exact asset and font bytes in document order", async () => {
    const fixture = await createBundleFixture();
    const secondAsset = assetDeclaration("second-asset");
    fixture.document.assets.push(secondAsset);
    fixture.manifest.assets.unshift({
      ...secondAsset,
      file: "assets/second.png",
    });
    await writeFile(join(fixture.root, "assets/second.png"), PIXEL_PNG);
    await writeManifest(fixture);

    const resources = await loadResourceBundle(fixture.root, fixture.document);

    expect(resources.assets.map((asset) => asset.id)).toEqual([
      "pixel-asset",
      "second-asset",
    ]);
    expect(resources.assets[0]?.bytes).toEqual(PIXEL_PNG);
    expect(resources.fonts).toEqual([
      expect.objectContaining({
        family: "Inter",
        weight: 400,
        style: "normal",
        sha256: DEVELOPMENT_FONT_SHA256,
      }),
    ]);
  });

  it("renders through the CLI and records the verified resource provenance", async () => {
    const fixture = await createBundleFixture();
    const designPath = join(fixture.directory, "design.json");
    const outputPath = join(fixture.directory, "graphic.svg");
    const manifestPath = join(fixture.directory, "graphic.manifest.json");
    await writeFile(designPath, `${JSON.stringify(fixture.document)}\n`);
    const capture = captureIo();

    expect(
      await runCli(
        [
          "render",
          designPath,
          "--resource-bundle",
          fixture.root,
          "--format",
          "svg",
          "--output",
          outputPath,
          "--manifest",
          manifestPath,
        ],
        capture.io,
      ),
    ).toBe(0);
    expect(await readFile(outputPath, "utf8")).toMatch(/^<svg /);
    const provenance = JSON.parse(await readFile(manifestPath, "utf8")) as {
      assets: { id: string; sha256: string }[];
      fonts: { sha256: string }[];
    };
    expect(provenance.assets).toEqual([
      expect.objectContaining({ id: "pixel-asset", sha256: PIXEL_HASH }),
    ]);
    expect(provenance.fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sha256: DEVELOPMENT_FONT_SHA256 }),
      ]),
    );
  });

  it("preserves output bytes when an exact built-in font is supplied explicitly", async () => {
    const fixture = await createBundleFixture();
    fixture.document.assets = [];
    fixture.manifest.assets = [];
    await writeManifest(fixture);
    const resources = await loadResourceBundle(fixture.root, fixture.document);

    const direct = await renderGraphic(fixture.document, {
      formats: ["svg"],
      creationTimestamp: CREATION_TIMESTAMP,
    });
    const bundled = await renderGraphic(fixture.document, {
      formats: ["svg"],
      fonts: resources.fonts,
      creationTimestamp: CREATION_TIMESTAMP,
    });

    expect(bundled.outputs[0]?.bytes).toEqual(direct.outputs[0]?.bytes);
    expect(bundled.outputs[0]?.fingerprint).toBe(direct.outputs[0]?.fingerprint);
  });

  it("rejects unknown manifest fields and unsupported versions", async () => {
    const fixture = await createBundleFixture();
    fixture.manifest.unexpected = true;
    await writeManifest(fixture);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE_BUNDLE" });

    delete fixture.manifest.unexpected;
    await writeFile(
      join(fixture.root, RESOURCE_BUNDLE_MANIFEST_FILENAME),
      `${JSON.stringify({ ...fixture.manifest, bundleVersion: "2.0.0" })}\n`,
    );
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE_BUNDLE" });
  });

  it("rejects duplicate asset IDs and case-insensitive font identities", async () => {
    const assetFixture = await createBundleFixture();
    assetFixture.manifest.assets.push({
      ...assetFixture.manifest.assets[0]!,
      file: "assets/second.png",
    });
    await writeManifest(assetFixture);
    await expect(
      loadResourceBundle(assetFixture.root, assetFixture.document),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE_BUNDLE" });

    const fontFixture = await createBundleFixture();
    fontFixture.manifest.fonts.push({
      ...fontFixture.manifest.fonts[0]!,
      family: "inter",
    });
    await writeManifest(fontFixture);
    await expect(
      loadResourceBundle(fontFixture.root, fontFixture.document),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE_BUNDLE" });
  });

  it.each([
    "../outside.png",
    "/tmp/outside.png",
    "C:\\outside.png",
    "https://x/y",
    "assets/CON.png",
  ])("rejects non-portable or escaping resource path %s", async (file) => {
    const fixture = await createBundleFixture();
    fixture.manifest.assets[0]!.file = file;
    await writeManifest(fixture);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE_BUNDLE" });
  });

  it("rejects symlinked resource files and symlinked path components", async () => {
    const fixture = await createBundleFixture();
    const outside = join(fixture.directory, "outside.png");
    await writeFile(outside, PIXEL_PNG);
    await rm(join(fixture.root, "assets/pixel.png"));
    await symlink(outside, join(fixture.root, "assets/pixel.png"));
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_SYMLINK_REJECTED" });

    await rm(join(fixture.root, "assets"), { recursive: true });
    const outsideDirectory = join(fixture.directory, "outside-assets");
    await mkdir(outsideDirectory);
    await writeFile(join(outsideDirectory, "pixel.png"), PIXEL_PNG);
    await symlink(outsideDirectory, join(fixture.root, "assets"));
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_SYMLINK_REJECTED" });
  });

  it("rejects a symlinked manifest and non-regular resource", async () => {
    const fixture = await createBundleFixture();
    const manifestPath = join(fixture.root, RESOURCE_BUNDLE_MANIFEST_FILENAME);
    const outsideManifest = join(fixture.directory, "outside-manifest.json");
    await writeFile(outsideManifest, `${JSON.stringify(fixture.manifest)}\n`);
    await rm(manifestPath);
    await symlink(outsideManifest, manifestPath);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_SYMLINK_REJECTED" });

    await rm(manifestPath);
    await writeManifest(fixture);
    await rm(join(fixture.root, "assets/pixel.png"));
    await mkdir(join(fixture.root, "assets/pixel.png"));
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_FILE_NOT_REGULAR" });
  });

  it("rejects a symlinked or non-directory bundle root", async () => {
    const fixture = await createBundleFixture();
    const linkedRoot = join(fixture.directory, "linked-bundle");
    await symlink(fixture.root, linkedRoot);
    await expect(
      loadResourceBundle(linkedRoot, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_ROOT_INVALID" });

    const fileRoot = join(fixture.directory, "not-a-directory");
    await writeFile(fileRoot, "data");
    await expect(loadResourceBundle(fileRoot, fixture.document)).rejects.toMatchObject({
      code: "RESOURCE_BUNDLE_ROOT_INVALID",
    });
  });

  it("rejects missing, undeclared, and metadata-mismatched assets", async () => {
    const fixture = await createBundleFixture();
    fixture.manifest.assets = [];
    await writeManifest(fixture);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_ASSET_MISSING" });

    fixture.document.assets = [];
    fixture.manifest.assets = [
      { ...assetDeclaration("extra-asset"), file: "assets/pixel.png" },
    ];
    await writeManifest(fixture);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_ASSET_UNDECLARED" });

    fixture.document.assets = [assetDeclaration("pixel-asset")];
    fixture.manifest.assets = [
      {
        ...assetDeclaration("pixel-asset"),
        width: 2,
        file: "assets/pixel.png",
      },
    ];
    await writeManifest(fixture);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({
      code: "RESOURCE_BUNDLE_ASSET_DECLARATION_MISMATCH",
    });
  });

  it("requires immutable hashes for caller-supplied fonts", async () => {
    const fixture = await createBundleFixture();
    fixture.manifest.fonts = [
      {
        file: "fonts/inter.ttf",
        family: "Custom Sans",
        weight: 400,
        style: "normal",
        sha256: DEVELOPMENT_FONT_SHA256,
      },
    ];
    fixture.document.fonts.push({
      family: "Custom Sans",
      weight: 400,
      style: "normal",
    });
    await writeManifest(fixture);

    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_FONT_HASH_REQUIRED" });
  });

  it("requires bundle font metadata to match the design exactly", async () => {
    const fixture = await createBundleFixture();
    fixture.document.assets = [];
    fixture.manifest.assets = [];
    fixture.manifest.fonts[0]!.family = "inter";
    await writeManifest(fixture);

    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({
      code: "RESOURCE_BUNDLE_FONT_DECLARATION_MISMATCH",
    });
  });

  it("escapes non-ASCII and control characters in font diagnostics", async () => {
    const fixture = await createBundleFixture();
    const family = "Unsafe\u001b[31m\u202E";
    fixture.document.assets = [];
    fixture.manifest.assets = [];
    fixture.document.fonts.push({
      family,
      weight: 400,
      style: "normal",
      sha256: "0".repeat(64),
    });
    fixture.manifest.fonts.push({
      file: "fonts/inter.ttf",
      family,
      weight: 400,
      style: "normal",
      sha256: "0".repeat(64),
    });
    await writeManifest(fixture);

    try {
      await loadResourceBundle(fixture.root, fixture.document);
      throw new Error("Expected the resource-bundle hash check to fail.");
    } catch (error) {
      expect(error).toMatchObject({ code: "RESOURCE_BUNDLE_FILE_HASH_MISMATCH" });
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain("\u001b");
      expect(message).not.toContain("\u202E");
      expect(message).toContain("\\u{1B}");
      expect(message).toContain("\\u{202E}");
    }
  });

  it("rejects asset and font hash mismatches before rendering", async () => {
    const fixture = await createBundleFixture();
    fixture.manifest.assets[0]!.sha256 = "0".repeat(64);
    fixture.document.assets[0]!.sha256 = "0".repeat(64);
    await writeManifest(fixture);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_FILE_HASH_MISMATCH" });

    fixture.document.assets = [];
    fixture.manifest.assets = [];
    fixture.manifest.fonts[0]!.sha256 = "0".repeat(64);
    fixture.document.fonts[0]!.sha256 = "0".repeat(64);
    await writeManifest(fixture);
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({ code: "RESOURCE_BUNDLE_FILE_HASH_MISMATCH" });
  });

  it("keeps full Core raster validation after bundle hash verification", async () => {
    const fixture = await createBundleFixture();
    const malformed = PIXEL_PNG.slice(0, 9);
    const malformedHash = sha256(malformed);
    fixture.document.assets[0]!.sha256 = malformedHash;
    fixture.manifest.assets[0]!.sha256 = malformedHash;
    await writeFile(join(fixture.root, "assets/pixel.png"), malformed);
    await writeManifest(fixture);
    const designPath = join(fixture.directory, "malformed-design.json");
    const outputPath = join(fixture.directory, "must-not-exist.svg");
    await writeFile(designPath, `${JSON.stringify(fixture.document)}\n`);
    const capture = captureIo();

    expect(
      await runCli(
        [
          "render",
          designPath,
          "--resource-bundle",
          fixture.root,
          "--format",
          "svg",
          "--output",
          outputPath,
        ],
        capture.io,
      ),
    ).toBe(1);
    expect(capture.stderr.join("\n")).toContain("MALFORMED_RASTER_ASSET");
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects oversized manifests and individual resource files from metadata", async () => {
    const fixture = await createBundleFixture();
    await truncate(
      join(fixture.root, RESOURCE_BUNDLE_MANIFEST_FILENAME),
      CLI_RESOURCE_BUNDLE_LIMITS.maxManifestBytes + 1,
    );
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({
      code: "RESOURCE_BUNDLE_MANIFEST_BYTES_LIMIT_EXCEEDED",
    });

    await writeManifest(fixture);
    await truncate(
      join(fixture.root, "assets/pixel.png"),
      RENDER_RESOURCE_LIMITS.maxAssetBytes + 1,
    );
    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({
      code: "RESOURCE_BUNDLE_FILE_BYTES_LIMIT_EXCEEDED",
    });
  });

  it("rejects aggregate asset bytes before reading sparse file contents", async () => {
    const fixture = await createBundleFixture();
    const fileSize = Math.floor(RENDER_RESOURCE_LIMITS.maxTotalAssetBytes / 4) + 1;
    fixture.document.assets = [];
    fixture.manifest.assets = [];
    for (let index = 0; index < 4; index += 1) {
      const declaration = assetDeclaration(`asset-${index}`);
      const file = `assets/large-${index}.png`;
      fixture.document.assets.push(declaration);
      fixture.manifest.assets.push({ ...declaration, file });
      await writeFile(join(fixture.root, file), "");
      await truncate(join(fixture.root, file), fileSize);
    }
    await writeManifest(fixture);

    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({
      code: "RESOURCE_BUNDLE_TOTAL_ASSET_BYTES_LIMIT_EXCEEDED",
    });
  });

  it("rejects aggregate font bytes before parsing sparse font contents", async () => {
    const fixture = await createBundleFixture();
    const fileSize = Math.floor(RENDER_RESOURCE_LIMITS.maxTotalFontBytes / 4) + 1;
    fixture.manifest.fonts = [];
    for (let index = 0; index < 4; index += 1) {
      const family = `Large Font ${index}`;
      const file = `fonts/large-${index}.ttf`;
      fixture.document.fonts.push({
        family,
        weight: 400,
        style: "normal",
        sha256: "0".repeat(64),
      });
      fixture.manifest.fonts.push({
        file,
        family,
        weight: 400,
        style: "normal",
        sha256: "0".repeat(64),
      });
      await writeFile(join(fixture.root, file), "");
      await truncate(join(fixture.root, file), fileSize);
    }
    await writeManifest(fixture);

    await expect(
      loadResourceBundle(fixture.root, fixture.document),
    ).rejects.toMatchObject({
      code: "RESOURCE_BUNDLE_TOTAL_FONT_BYTES_LIMIT_EXCEEDED",
    });
  });

  it("rejects invalid designs before opening resource files", async () => {
    const fixture = await createBundleFixture();
    const invalid = { ...fixture.document, schemaVersion: "999.0.0" };
    await rm(join(fixture.root, "assets/pixel.png"));

    await expect(loadResourceBundle(fixture.root, invalid)).rejects.toMatchObject({
      code: "INVALID_DESIGN_DOCUMENT",
    });
  });
});

async function createBundleFixture(): Promise<{
  directory: string;
  root: string;
  document: DesignDocument;
  manifest: BundleManifest;
}> {
  const directory = await mkdtemp(join(tmpdir(), "glyphkiln-resource-bundle-"));
  temporaryDirectories.push(directory);
  const root = join(directory, "bundle");
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "fonts"), { recursive: true });
  await writeFile(join(root, "assets/pixel.png"), PIXEL_PNG);
  await writeFile(
    join(root, "fonts/inter.ttf"),
    await readFile(resolve("assets/fonts/Inter-Variable.ttf")),
  );
  const document = cloneDocument(await loadExample("product-announcement"));
  document.assets = [assetDeclaration("pixel-asset")];
  const manifest: BundleManifest = {
    bundleVersion: "1.0.0",
    assets: [
      {
        ...assetDeclaration("pixel-asset"),
        file: "assets/pixel.png",
      },
    ],
    fonts: [
      {
        file: "fonts/inter.ttf",
        family: "Inter",
        weight: 400,
        style: "normal",
        sha256: DEVELOPMENT_FONT_SHA256,
      },
    ],
  };
  const fixture = { directory, root, document, manifest };
  await writeManifest(fixture);
  return fixture;
}

function assetDeclaration(id: string): Omit<BundleAsset, "file"> {
  return {
    id,
    mimeType: "image/png",
    sha256: PIXEL_HASH,
    width: 1,
    height: 1,
    origin: { kind: "user-upload" },
  };
}

async function writeManifest(fixture: {
  root: string;
  manifest: BundleManifest;
}): Promise<void> {
  await writeFile(
    join(fixture.root, RESOURCE_BUNDLE_MANIFEST_FILENAME),
    `${JSON.stringify(fixture.manifest)}\n`,
  );
}

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
  };
}
