# Glyphkiln Core

Glyphkiln Core is the open-source deterministic rendering engine for
professional social-media graphics and reviewed editorial scenes.

> Composed without generative image models and rendered deterministically from
> code; included asset origins are reported separately.

It accepts an untrusted, versioned design document; validates it strictly; lays
it out with an explicit font; renders safe SVG or PNG; and emits a provenance
manifest. It does not execute user code, fetch remote assets, call an LLM, or
depend on Glyphkiln Cloud.

## Status

This package is a production-quality pre-1.0 vertical slice. Schema and
templates are versioned, but the package itself may make documented breaking
changes before `1.0.0`.

The included minor Changeset targets Core `0.8.0` and adds the expert
`@glyphkiln/core/scene` entry point. It is a stable, validated replacement for
importing private renderer files; the normal `DesignDocument` workflow and
Glyphkiln App remain coordinate-free.

Core detects known bidi controls, strong right-to-left text, and
vertical-primary text that its LTR-horizontal layout cannot faithfully render.
The policy is pinned as `unicode-17.0.0/ltr-horizontal-v1`; unsupported visible
copy is rejected before asset or font resolution.

Thai copy uses bundled `budoux-th@0.7.0` segmentation and balanced legal line
breaks. Minimum-size internal word breaks are errors. Schema `1.2.0` adds a
bounded `keepTogether` phrase list for author-controlled grouping.

Supported templates:

- `product-announcement@1.1.1`
- `statistic-card@1.1.0`
- `quote-card@1.1.0`
- `article-cover@1.1.0`
- `tiktok-carousel-slide@1.0.4` (`1.0.3` remains renderable)
- `image-led-campaign@1.0.1` (`1.0.0` remains renderable)

Supported procedural styles:

- `flow-field@1.1.0`
- `layered-waves@1.1.0`
- `topographic-contours@1.1.0`
- `recursive-subdivision@1.1.0`

## Develop

Use Node.js 22.22.2 or newer within the Node 22 release line, or Node.js 24 or
newer, with npm 10.9.8. Run the verification suite from the monorepo root:

```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run text-layout-data:verify
npm run fixtures:verify
npm run scene-kernel-fixture:verify
npm run examples:verify
npm run licenses:verify
npm run test:package-consumer
```

The included Inter variable font is open source under the SIL Open Font License.
It makes local examples reproducible without proprietary fonts.

## SDK

```ts
import { readFile } from "node:fs/promises";

import {
  analyzeTextLayoutSupport,
  inspectDesignDocument,
  renderGraphic,
  validateDesignDocument,
} from "@glyphkiln/core";

const input: unknown = JSON.parse(
  await readFile(new URL("./design.json", import.meta.url), "utf8"),
);
const validation = validateDesignDocument(input);
if (!validation.success) {
  throw new Error(JSON.stringify(validation.problems));
}

const headline = validation.data.layers.find((layer) => layer.type === "headline");
if (headline?.type === "headline") {
  console.log(analyzeTextLayoutSupport(headline.text));
}

console.log(inspectDesignDocument(validation.data).textLayout);
const result = await renderGraphic(validation.data, { formats: ["svg", "png"] });
for (const output of result.outputs) {
  console.log(output.format, output.bytes, output.manifest);
}
```

Use `renderGraphicIsolated` for untrusted workloads. It runs the same API in a
permission-limited child process with a fixed memory ceiling, serialized
concurrency, and a 15-second maximum timeout.

`createDesignDocument` supplies schema version `1.4.0` and a stable content ID
when omitted. `renderGraphic` validates again at the trust boundary. Existing
schema `1.0.0`, `1.1.0`, `1.2.0`, and `1.3.0` documents remain supported. The
organic TikTok photo-carousel format requires schema `1.3.0`, while preserved
9:16 carousel documents remain renderable under their original schema. Assets
and fonts are byte-oriented caller inputs; the renderer performs no network
access.

Schema `1.4.0` adds bounded display/body/label typography roles and normalized
focal points with closed image treatments. `image-led-campaign@1.0.1` renders
one exact image/logo campaign across landscape, square, and portrait and returns
bounded safe-area, text, crop, overflow, and composited-contrast proof in
`result.evidence`. It sizes the contained logo box to the admitted raster's
aspect ratio so the visible logo slot begins at the safe-area column; saved
`1.0.0` documents retain their original fixed-slot pixels. Core embeds the exact
supplied raster bytes and never runs a silent color normalizer.

For a deliberate admission-time conversion, `normalizeRasterColor` accepts only
explicit bounded PNG/JPEG bytes and returns new canonical sRGB PNG bytes plus a
report containing source/output hashes, dimensions, profile evidence, and
orientation evidence. The caller must store and admit the output as a new
immutable resource before putting its hash in a document. The helper never
fetches, accepts a path or URL, mutates the source, or runs inside
`renderGraphic`. Embedded RGB and grayscale ICC profiles are supported; CMYK
and other color spaces fail explicitly until a bounded decoder can expose raw
samples safely.

### Expert Scene Kernel

Use `@glyphkiln/core/scene` when reviewed explicit geometry is the input. The
closed `SceneDocument 1.0.0` union supports primitives, nested groups, ordered
transforms, clips, semantic connectors with explicit point routes, Core-laid-out
text, semantic tags, and a reading order independent from paint order.

```ts
import {
  SCENE_DOCUMENT_VERSION,
  renderScene,
  type SceneDocument,
} from "@glyphkiln/core/scene";

const scene: SceneDocument = {
  schemaVersion: SCENE_DOCUMENT_VERSION,
  id: "reviewed-scene",
  seed: "reviewed-scene-v1",
  dimensions: { width: 640, height: 360 },
  title: "Reviewed scene",
  description: "One deterministic scene-kernel example.",
  backgroundColor: "#F6F1E7",
  assets: [],
  fonts: [],
  elements: [
    {
      id: "subject",
      type: "rect",
      x: 80,
      y: 80,
      width: 480,
      height: 200,
      fill: "#17262F",
      semantic: { role: "content", label: "Subject" },
    },
  ],
  readingOrder: ["subject"],
};

const result = await renderScene(scene, { formats: ["svg", "png"] });
```

Scene Kernel accepts inert data, never CSS, JavaScript, callbacks, URLs, paths,
uploaded SVG, host fonts, or runtime plugins. It provides deterministic SVG and
PNG, per-output manifests, reproduction verification, and a canonical
fingerprint; it does not provide automatic composition, book structure, PDF, or
scientific review. See the [Scene Kernel guide](../../docs/scene-kernel.md).

The reviewed Kilnform fixture uses the selected Kilnmaker Seal identity. Run
`npm run identity:update --workspace @glyphkiln/core` to reproduce its outlined
SVG lockups and transparent PNGs, including the exact raster asset admitted by
the example document. The SVG identity files are design deliverables, not Core
render inputs; Core continues to admit PNG and JPEG only.

Browser applications can import `canonicalJson`,
`createRenderFingerprintPayload`, `calculateFocalCrop`, and the immutable
campaign and authoring registries from
`@glyphkiln/core/browser`. This subpath contains no Node renderer or hashing
dependency; callers hash its canonical payload with their platform's SHA-256
implementation and can use the exact Core crop geometry for interaction
overlays.

`AUTHORING_TEMPLATE_REGISTRY` publishes fixed composition, semantic role,
asset, format, schema, hard-bound, and guidance metadata for every supported
template version. `validateCandidateDocuments` from the main entry point accepts
one to eight unknown candidate values, applies the normal strict schema,
template, brand, and text-layout checks, and returns bounded actionable issues.
Only valid candidates contain a normalized document and deterministic canonical
JSON. `mapQualityIssuesToAuthoringIssues` from the browser entry point maps up
to 128 proof issues to fixed designer actions and reports malformed or
truncated input without copying runtime messages or details. Exact assets and
fonts must still be resolved before isolated rendering; Core never calls a
model or accepts model-selected code, URLs, paths, CSS, JavaScript, or active
SVG. See
[AI-ready authoring contracts](../../docs/ai-authoring-contracts.md).

Campaign coordinators can use `createCampaignDirectionKey`,
`createCampaignCanvasKey`, and `deriveCampaignSeeds` from the main Core entry
point. The distinct validated key types prevent accidental direction/canvas
swaps, while derivation produces one stable art-direction seed plus a
canvas-specific seed from bounded family, template, format, variant, and
App-owned scope keys. Core still renders one document per canvas and does not
store campaign, lock, ordering, or review state. See
[Campaign-system contracts](../../docs/campaign-systems.md).

`analyzeTextLayoutSupport` returns stable `BIDI_CONTROL_UNSUPPORTED`,
`BIDI_LAYOUT_UNSUPPORTED`, and `VERTICAL_LAYOUT_UNSUPPORTED` diagnostics with
bounded numeric evidence. `inspectDesignDocument` applies the same policy to
every rendered semantic text field, including hidden layers. Hidden copy is
reported but does not block rendering.

See [Design document](../../docs/design-document.md),
[SDK and architecture](../../docs/architecture.md), and
[Determinism contract](../../docs/determinism.md). Thai segmentation, balancing,
quality diagnostics, and `keepTogether` are documented in
[Typography wrapping](../../docs/typography-wrapping.md). Public input, asset, font, and
deployment bounds are documented in
[Resource limits and worker profile](../../docs/resource-limits.md).

## CLI

From the monorepo root:

```bash
npm run build --workspace @glyphkiln/core
node packages/glyphkiln-core/dist/cli/index.js validate \
  packages/glyphkiln-core/examples/product-announcement.json
node packages/glyphkiln-core/dist/cli/index.js inspect \
  packages/glyphkiln-core/examples/product-announcement.json
node packages/glyphkiln-core/dist/cli/index.js render \
  packages/glyphkiln-core/examples/product-announcement.json \
  --format png \
  --output packages/glyphkiln-core/examples/generated/product-announcement.png \
  --manifest
node packages/glyphkiln-core/dist/cli/index.js render \
  packages/glyphkiln-core/examples/product-announcement.json \
  --format svg \
  --output packages/glyphkiln-core/examples/generated/product-announcement.svg \
  --manifest
```

Designs with local PNG/JPEG assets or additional font bytes can use one
validated offline bundle:

```bash
node packages/glyphkiln-core/dist/cli/index.js render design.json \
  --resource-bundle ./campaign-resources \
  --format svg \
  --output graphic.svg \
  --manifest
```

The selected directory contains `glyphkiln-resource-bundle.json`. Its strict
`1.0.0` manifest maps portable relative files to exact design asset/font
declarations and SHA-256 hashes. Traversal, absolute paths, symlinks,
non-regular files, oversized manifests/resources, and declaration mismatches
fail closed. The adapter performs no network access and does not replace upload
malware scanning. See
[Offline CLI resource bundles](../../docs/resource-bundles.md).

Run `npm link` once if you want the literal `glyphkiln` command while developing;
normal consumers receive it from package installation. `--verify
<fingerprint>` makes render verification fail when a result differs from an
expected canonical fingerprint. Expected validation and quality failures print
actionable messages and return a nonzero exit code without a stack trace.
Existing output is preserved unless `--force` is supplied. `--version` prints
the installed package version. `validate` remains structural; `inspect` returns
`textLayout.renderable` and its diagnostics; `render` rejects unsupported
visible text with `QUALITY_VALIDATION_FAILED`.

## Formats

| ID                      |  Dimensions |
| ----------------------- | ----------: |
| `linkedin-landscape`    |  1200 × 627 |
| `instagram-square`      | 1080 × 1080 |
| `instagram-portrait`    | 1080 × 1350 |
| `instagram-story`       | 1080 × 1920 |
| `tiktok-photo-carousel` | 1080 × 1440 |
| `tiktok-carousel`       | 1080 × 1920 |
| `x-landscape`           |  1200 × 675 |
| `youtube-thumbnail`     |  1280 × 720 |

The X default is 16:9 at 1200 × 675: a practical current default that maps
cleanly to common high-resolution preview surfaces. Applications can add new
versioned registry entries without scattering dimensions through templates.
The default organic TikTok photo carousel uses a high-resolution 1080 × 1440
(3:4) Glyphkiln working canvas. `tiktok-carousel-slide@1.0.4` targets that
organic path; TikTok does not publish one required organic Photo Mode canvas or
stable universal safe zone. Saved `1.0.2` documents remain exactly renderable
with the 1080 × 1920 `tiktok-carousel` paid-ad format. Smart Order, vertical
720 × 1280 guidance, music requirements, and any 3/7–9 card recommendation
belong only to the paid-ad workflow.

The current organic template uses a 1.08 headline-leading floor, optional
eyebrow/footer chrome, content-responsive type fields, and deterministic
Core-owned pattern rails when a procedural layer is present. Saved `1.0.3`
documents retain their original pixels.

`DELIVERY_PROFILE_REGISTRY` separates Instagram native, Instagram API, TikTok
native organic, TikTok Content Posting API, and TikTok paid-ad paths with dated sources and explicit evidence
levels. `reviewCarouselSequence()` checks actual delivery and ordering failures
while returning copy length, source coverage, accessibility, and composition
rhythm as warnings. `createCarouselDeliverySidecar()` produces deterministic
whole-slide publisher alt text, reading order, per-layer asset descriptions,
source notes, and profile identity for handoff. These contracts are available
from the main and browser entries and do not change template pixels.

For AI-assisted authoring, prioritize typography: semantic copy, type
hierarchy, color, and Core-owned layout or background primitives. Do not
generate or upload SVG artwork as a visual asset. This restriction is distinct
from Core's deterministic safe SVG output, which Core serializes from its
validated renderer-neutral scene.

## Examples and baselines

Reviewed example designs and their tracked SVG/PNG outputs live in
[`examples/`](examples/). Exact reviewed PNG baselines, source
designs, and manifests live in [`tests/visual/baselines/`](tests/visual/baselines/).
The Direction A editorial conformance scene, its expected semantic structure,
reviewed PNG, and SVG/PNG manifests live in
[`fixtures/scene-kernel/`](fixtures/scene-kernel/).

```bash
npm run build
npm run examples:generate
npm run examples:verify
npm run scene-kernel-fixture:verify
```

## Documentation

- [Architecture](../../docs/architecture.md)
- [Scene Kernel](../../docs/scene-kernel.md)
- [AI-ready authoring contracts](../../docs/ai-authoring-contracts.md)
- [Rendering lifecycle](../../docs/rendering-lifecycle.md)
- [Design-document specification](../../docs/design-document.md)
- [Resource limits and worker profile](../../docs/resource-limits.md)
- [Offline CLI resource bundles](../../docs/resource-bundles.md)
- [Fonts](../../docs/fonts.md) and [assets](../../docs/assets.md)
- [Text-layout diagnostics](../../docs/text-layout-diagnostics.md)
- [Provenance](../../docs/provenance.md)
- [Validation and quality policy](../../docs/quality-policy.md)
- [Template authoring](../../docs/template-authoring.md)
- [Campaign-system contracts](../../docs/campaign-systems.md)
- [Procedural backgrounds](../../docs/procedural-backgrounds.md)
- [Visual regression](../../docs/visual-regression.md)
- [Versioning](../../docs/versioning.md),
  [release process](../../docs/release-process.md)
- [Known limitations](../../docs/known-limitations.md),
  [roadmap](../../docs/roadmap.md)
- [Architecture decisions](../../docs/adr/README.md)

## License and contributions

Glyphkiln Core is licensed under Apache-2.0. See
[CONTRIBUTING.md](../../CONTRIBUTING.md) and
[SECURITY.md](../../SECURITY.md). Font files retain their separate OFL terms in
`assets/fonts/OFL.txt`. The generated production dependency inventory is
[`THIRD_PARTY_LICENSES.json`](THIRD_PARTY_LICENSES.json). Unicode 17.0.0 data
used by text-layout diagnostics retains the Unicode License v3 in
`vendor/unicode/LICENSE.txt`.
