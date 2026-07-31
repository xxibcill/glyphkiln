# Offline CLI resource bundles

The CLI can resolve raster assets and caller-supplied fonts from one explicit
local directory without adding paths or URLs to a `DesignDocument`.

```bash
glyphkiln render design.json \
  --resource-bundle ./campaign-resources \
  --format svg \
  --output graphic.svg \
  --manifest
```

`campaign-resources` must be a real directory, not a symbolic link, and must
contain a fixed manifest named `glyphkiln-resource-bundle.json`.
`--resource-bundle` is accepted only by `render`. The bundle root is an
operator-selected CLI argument; document data can never select a filesystem
path.

See [ADR 0013](adr/0013-offline-cli-resource-bundles.md) for the rejected
alternatives and versioning decision.

## Format `1.0.0`

The manifest is strict UTF-8 JSON. Unknown fields and unsupported versions are
rejected.

```json
{
  "bundleVersion": "1.0.0",
  "assets": [
    {
      "file": "assets/logo.png",
      "id": "brand-logo",
      "mimeType": "image/png",
      "sha256": "f5f7f6a82b4f8a8a9db990cab407211760f2f2ce8a0620d7f477a1f892ca6e2f",
      "width": 512,
      "height": 512,
      "origin": {
        "kind": "licensed-library",
        "sourceName": "Example Library",
        "sourceReference": "asset-123"
      }
    }
  ],
  "fonts": [
    {
      "file": "fonts/ExampleSans-Regular.ttf",
      "family": "Example Sans",
      "weight": 400,
      "style": "normal",
      "sha256": "1d8f7c43e0ec1f83bb15da50d43fce51ba5be221a646e4338732f67a8d4d2c04"
    }
  ]
}
```

Every asset entry must exactly match one asset declaration in the validated
design, including its ID, MIME type, SHA-256, dimensions, and complete origin
object. Every design asset must have exactly one bundle entry.

Every font entry must exactly match a design font declaration by family,
weight, style, and SHA-256. A caller-supplied font declaration must include its
SHA-256. The bundled Inter normal variable face may be omitted; an exact Inter
entry is permitted when a fully explicit bundle is preferable.

Entries are returned to the renderer in design-document order, independent of
manifest order. The loader verifies each file hash before passing its bytes to
the existing Core registries. Core then independently enforces raster
signature, MIME, structure, full decode, dimensions, pixels, origin, and font
parsing/declaration checks. The format does not bypass or replace any renderer
validation.

## Filesystem and resource boundary

- Resource paths are bounded portable relative paths. They use `/`, contain at
  most 16 ASCII segments, and cannot be absolute, empty, `.`/`..`, contain a
  backslash, or escape the selected root.
- The root, every intermediate path component, the manifest, and every
  resource file are checked without following symbolic links. Final files are
  opened with `O_NOFOLLOW`, must be regular files, and are identity-checked
  against the inspected path.
- Resolved real paths must remain beneath the selected root. Absolute
  directories are redacted from expected diagnostics.
- The manifest is limited to 256 KiB, depth 8, and 2,048 entries. Asset/font
  counts and per-file/aggregate byte limits are the same public
  `RENDER_RESOURCE_LIMITS` enforced by rendering. Reads use a one-byte sentinel
  rather than trusting file metadata.
- No URL field exists, no network client is used, and bundle contents remain
  inert data. PNG and JPEG are the only asset types; uploaded SVG remains
  unsupported.

Bundle directories should be immutable while a render is in progress. File
identity checks and content hashes fail closed if a path or its bytes change.

## Operator responsibilities

Core validates file structure and reproducibility; it is not a malware scanner
and does not grant font or image rights. Scan hostile files at ingestion,
retain the original licensing records, and ensure the declared asset origin is
accurate. Use `renderGraphicIsolated` or an isolated application worker for
untrusted render jobs.
