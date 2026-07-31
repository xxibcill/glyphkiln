---
name: develop-glyphkiln-core
description: Implement or review changes to @glyphkiln/core, including the design schema, deterministic renderer, templates, typography, procedural backgrounds, assets and fonts, fingerprints, manifests, isolation, browser helpers, and CLI. Use for work under packages/glyphkiln-core, especially changes that may affect pixels, output bytes, versioned contracts, public exports, or untrusted render input.
---

# Develop Glyphkiln Core

Preserve Core as a deterministic, vector-first renderer for inert, untrusted
data. Treat output bytes, validation behavior, and public exports as explicit
contracts.

## Prepare

1. Read `AGENTS.md`, `CONTRIBUTING.md`, and the relevant source and tests.
2. Read [references/core-map.md](references/core-map.md) for the source, test,
   version, generated-artifact, and documentation map.
3. Classify the requested change:
   - pixel or serialized-output behavior;
   - schema, validation, or quality policy;
   - public API, browser contract, manifest, or fingerprint;
   - CLI, resource bundle, isolation, or security boundary;
   - internal behavior with no external contract impact.

## Preserve the invariants

- Keep document input as bounded JSON-compatible data.
- Never add expressions, callbacks, dynamic imports, user-selected modules,
  remote fetching, document-selected paths, active SVG, or host font fallback.
- Use seeded randomness from the existing seed module for every render-path
  random choice. Never call an unseeded random source in a render path.
- Preserve deterministic ordering explicitly. Do not depend on filesystem,
  database, locale, object-construction, or host-environment ordering.
- Keep SVG and PNG on one layout path: build the renderer-neutral scene,
  serialize safe SVG, and rasterize those SVG bytes.
- Resolve resources to verified bytes before rendering. Keep security limits
  closed and fail-safe.
- Keep new public API intentional through package entry points. Do not make an
  internal file path an accidental API.

## Implement by contract

### Pixel or output-byte changes

1. Identify every identical-input output that changes.
2. Bump the narrowest applicable version:
   - template version for composition owned by one template;
   - procedural algorithm version for background geometry;
   - renderer version for shared geometry, typography, SVG serialization, or
     rasterization behavior.
3. Update unions, registries, fixtures, manifests, examples, and documentation
   that encode the changed version.
4. Add or update exact tests for the behavior.
5. Regenerate visual baselines only when the pixel change is deliberate. Review
   each design, PNG, and manifest together; never refresh a baseline solely to
   silence a failure.
6. Keep older versioned behavior available when the compatibility policy
   requires existing documents to remain renderable. Never silently repoint an
   old version to new pixels.

### Schema or validation changes

1. Keep objects strict, collections and strings bounded, and runtime refinements
   explicit.
2. Decide compatibility before changing a schema version.
3. Update Zod validation, JSON Schema output, runtime refinement metadata, test
   vectors, and documentation together.
4. Preserve the failure policy: unsafe interpretation throws a stable
   `GlyphkilnError`; aggregatable composition failures become bounded
   `QualityIssue` records.
5. Add regression tests for every new stable error or quality code.

### Fingerprint or provenance changes

1. Decide whether the value affects pixels.
2. Include pixel-affecting values in the canonical fingerprint contract.
3. Exclude request identity, timestamps, and non-rendering metadata.
4. Bump the manifest version when serialized provenance fields or meanings
   change.
5. Test canonicalization, exclusion rules, output hashes, and reproduction
   verification.

### CLI, bundle, or isolation changes

1. Keep filesystem intent in operator-selected CLI arguments, never document
   fields.
2. Preserve byte, path, symlink, regular-file, hash, timeout, memory, and
   concurrency limits.
3. Keep SDK rendering side-effect-free; let only adapters perform approved
   filesystem operations.
4. Add negative tests for traversal, link following, oversized data, malformed
   resources, and permission failures relevant to the change.

## Test while developing

Run the narrowest relevant workspace test first. Add regression coverage next
to the owning behavior. For pixel changes, test both the semantic rule and the
exact rendered artifact.

Before handoff, invoke `$verify-glyphkiln-change` and complete its full
repository gate.

## Report

State:

- the contract changed and the owning module;
- deterministic-output impact;
- versions and generated artifacts changed;
- tests added or updated;
- verification commands and results;
- any intentionally deferred compatibility or visual review.
